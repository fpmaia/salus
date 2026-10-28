import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { agendamentos, pacientes, profissionais, reservasSala, salas, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { STATUS_ATIVOS } from "../domain/agendamentos";
import { agruparPorDia, gerarSlug, horariosLivres } from "../domain/disponibilidade";
import { cpfValido, somenteDigitos } from "../domain/documentos";
import { normalizarTelefoneBr, primeiroNome } from "../domain/notificacoes";
import { exigirPermissao, pode } from "../domain/rbac";
import { partesLocais } from "../domain/tempo";
import { espacoSuspensoPorAtraso } from "./assinatura";
import { ErroNegocio } from "./erros";
import { exigirModulo, moduloAtivoNoTenant } from "./modulos";
import { linkDoAgendamento } from "./links";
import { vincularPaciente } from "./pacientes";
import { profissionalDoUsuario } from "./profissionais";
import { formatarDataBr } from "./reservas";

/** Agendamentos online futuros ativos por paciente (proteção contra abuso). */
export const MAX_ONLINE_POR_PACIENTE = 3;

// ---------------------------------------------------------------------------
// Configuração (profissional ou admin)
// ---------------------------------------------------------------------------

export const configOnlineSchema = z.object({
  ativo: z.boolean(),
  duracaoConsultaMin: z.number().int().min(15).max(480).refine((v) => v % 15 === 0, "Use múltiplos de 15 minutos"),
  antecedenciaMinHoras: z.number().int().min(0).max(168),
  janelaDias: z.number().int().min(1).max(180),
  mensagemPublica: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

async function alvoDaConfiguracao(tx: Transaction, ctx: ContextoTenant, profissionalId?: string): Promise<string> {
  if (pode(ctx.role, "profissionais.gerenciar")) {
    if (!profissionalId) throw new ErroNegocio("Escolha o profissional");
    return profissionalId;
  }
  exigirPermissao(ctx.role, "agenda.propria");
  const proprio = await profissionalDoUsuario(tx, ctx.userId);
  if (!proprio) throw new ErroNegocio("Seu usuário não está vinculado a um cadastro de profissional");
  return proprio.id;
}

export async function obterConfigOnline(ctx: ContextoTenant, profissionalId?: string, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const id = await alvoDaConfiguracao(tx, ctx, profissionalId);
      const [p] = await tx
        .select({
          id: profissionais.id,
          nome: profissionais.nome,
          agendamentoOnline: profissionais.agendamentoOnline,
          slugPublico: profissionais.slugPublico,
          duracaoConsultaMin: profissionais.duracaoConsultaMin,
          antecedenciaMinHoras: profissionais.antecedenciaMinHoras,
          janelaDias: profissionais.janelaDias,
          mensagemPublica: profissionais.mensagemPublica,
        })
        .from(profissionais)
        .where(eq(profissionais.id, id));
      return p ?? null;
    },
    database,
  );
}

/** Liga/desliga e ajusta o agendamento online; cria o slug público na primeira ativação. */
export async function configurarAgendamentoOnline(
  ctx: ContextoTenant,
  dados: z.input<typeof configOnlineSchema> & { profissionalId?: string },
  database?: Database,
): Promise<{ slug: string | null }> {
  const valores = configOnlineSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      await exigirModulo(tx, "agendaOnline");
      const id = await alvoDaConfiguracao(tx, ctx, dados.profissionalId);
      const [atual] = await tx.select().from(profissionais).where(eq(profissionais.id, id));
      if (!atual) throw new ErroNegocio("Profissional não encontrado");
      const slug = atual.slugPublico ?? (valores.ativo ? gerarSlug(atual.nome, randomBytes(3).toString("hex")) : null);
      await tx
        .update(profissionais)
        .set({
          agendamentoOnline: valores.ativo,
          duracaoConsultaMin: valores.duracaoConsultaMin,
          antecedenciaMinHoras: valores.antecedenciaMinHoras,
          janelaDias: valores.janelaDias,
          mensagemPublica: valores.mensagemPublica,
          slugPublico: slug,
        })
        .where(eq(profissionais.id, id));
      await registrarAuditoria(tx, { acao: "agendamento_online.configurado", entidade: "profissionais", entidadeId: id, dados: { ...valores, slug } });
      return { slug };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Página pública (sem login)
// ---------------------------------------------------------------------------

async function resolverSlug(slug: string, database: Database) {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { rows } = await database.execute<{ tenant_id: string; profissional_id: string }>(
    sql`select * from app_profissional_publico(${slug})`,
  );
  if (!rows[0]) return null;
  // Espaço com o módulo desligado: a página pública fica indisponível.
  if (!(await moduloAtivoNoTenant(rows[0].tenant_id, "agendaOnline", database))) return null;
  // Espaço suspenso por atraso no SaaS: sem consultas novas (as já marcadas continuam).
  if (await espacoSuspensoPorAtraso(rows[0].tenant_id, new Date(), database)) return null;
  return { tenantId: rows[0].tenant_id, profissionalId: rows[0].profissional_id };
}

type HorarioOferta = { inicio: Date; reservaId: string; unidadeNome: string; endereco: string | null; timezone: string };

/** Horários livres do profissional (recalculado também no momento de agendar). */
async function ofertas(tx: Transaction, profissionalId: string, agora: Date): Promise<HorarioOferta[]> {
  const [p] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
  if (!p) return [];
  const ate = new Date(agora.getTime() + p.janelaDias * 86_400_000);
  const reservas = await tx
    .select({
      id: reservasSala.id,
      periodo: reservasSala.periodo,
      slot: unidades.slotMinutos,
      unidadeNome: unidades.nome,
      endereco: unidades.endereco,
      timezone: unidades.timezone,
    })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(
      and(
        eq(reservasSala.profissionalId, profissionalId),
        eq(reservasSala.status, "ativa"),
        sql`${reservasSala.periodo} && tstzrange(${agora.toISOString()}::timestamptz, ${ate.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(asc(reservasSala.periodo));
  if (reservas.length === 0) return [];
  const ocupados = await tx
    .select({ periodo: agendamentos.periodo })
    .from(agendamentos)
    .where(
      and(
        eq(agendamentos.profissionalId, profissionalId),
        ne(agendamentos.status, "cancelado"),
        sql`${agendamentos.periodo} && tstzrange(${agora.toISOString()}::timestamptz, ${ate.toISOString()}::timestamptz)`,
      ),
    );

  const resultado: HorarioOferta[] = [];
  const vistos = new Set<number>();
  for (const r of reservas) {
    for (const inicio of horariosLivres({
      reservas: [r.periodo],
      ocupados: ocupados.map((o) => o.periodo),
      duracaoMin: p.duracaoConsultaMin,
      passoMin: r.slot,
      agora,
      antecedenciaMinHoras: p.antecedenciaMinHoras,
      janelaDias: p.janelaDias,
    })) {
      if (vistos.has(inicio.getTime())) continue;
      vistos.add(inicio.getTime());
      resultado.push({ inicio, reservaId: r.id, unidadeNome: r.unidadeNome, endereco: r.endereco, timezone: r.timezone });
    }
  }
  return resultado.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

export async function obterPaginaPublica(slug: string, agora = new Date(), database: Database = getDb()) {
  const alvo = await resolverSlug(slug, database);
  if (!alvo) return null;
  return withSistema(
    alvo.tenantId,
    async (tx) => {
      const [p] = await tx.select().from(profissionais).where(eq(profissionais.id, alvo.profissionalId));
      const [tenant] = await tx.select({ nome: tenants.nome }).from(tenants);
      const lista = await ofertas(tx, alvo.profissionalId, agora);
      const timezone = lista[0]?.timezone ?? "America/Sao_Paulo";
      const locais = [...new Map(lista.map((o) => [o.unidadeNome, o.endereco])).entries()].map(([nome, endereco]) => ({ nome, endereco }));
      return {
        profissional: {
          nome: p.nome,
          especialidade: p.especialidade,
          registro: p.conselho && p.registro ? `${p.conselho} ${p.registro}` : null,
          mensagem: p.mensagemPublica,
          duracaoMin: p.duracaoConsultaMin,
        },
        espaco: tenant?.nome ?? "",
        locais,
        timezone,
        // ISO do instante: é o que o formulário devolve ao agendar.
        dias: agruparPorDia(
          lista.map((o) => o.inicio),
          timezone,
        ).map((dia) => ({
          ...dia,
          horarios: lista
            .filter((o) => partesLocais(o.inicio, timezone).data === dia.data)
            .map((o) => ({ iso: o.inicio.toISOString(), hora: partesLocais(o.inicio, timezone).hora })),
        })),
      };
    },
    database,
  );
}

export const pedidoOnlineSchema = z.object({
  inicio: z.iso.datetime({ message: "Escolha um horário" }),
  nome: z.string().trim().min(3, "Informe seu nome completo").max(120),
  telefone: z
    .string()
    .transform((v) => normalizarTelefoneBr(v))
    .refine((v): v is string => v !== null, "Informe um celular válido com DDD"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "E-mail inválido"),
  cpf: z
    .string()
    .optional()
    .transform((v) => (v ? somenteDigitos(v) : null))
    .refine((v) => v === null || cpfValido(v), "CPF inválido"),
  consentimentoLembretes: z.boolean().default(false),
  aceitePrivacidade: z.literal(true, { message: "É preciso aceitar o uso dos dados para o agendamento" }),
  /** Campo-isca: invisível para pessoas; robôs costumam preencher. */
  site: z.string().optional(),
});

/** Paciente existente do tenant pelo CPF ou pelo celular (normalizado); null se não houver. */
async function encontrarPaciente(tx: Transaction, cpf: string | null, telefone: string) {
  if (cpf) {
    const [porCpf] = await tx.select().from(pacientes).where(eq(pacientes.cpf, cpf));
    if (porCpf) return porCpf;
  }
  // Pela coluna normalizada (com índice), sem carregar todos os pacientes (C15).
  const [porTelefone] = await tx
    .select()
    .from(pacientes)
    .where(and(eq(pacientes.telefoneNormalizado, telefone), eq(pacientes.ativo, true)))
    .orderBy(asc(pacientes.criadoEm))
    .limit(1);
  return porTelefone ?? null;
}

/**
 * Agenda pela página pública. O horário é revalidado contra a oferta atual (não dá para
 * forjar um horário fora das reservas) e o banco barra corrida entre dois pacientes.
 */
export async function agendarOnline(
  slug: string,
  dados: z.input<typeof pedidoOnlineSchema>,
  agora = new Date(),
  database: Database = getDb(),
): Promise<{ link: string; data: string; hora: string; profissional: string; local: string; paciente: string }> {
  const pedido = pedidoOnlineSchema.parse(dados);
  if (pedido.site) throw new ErroNegocio("Não foi possível concluir o agendamento");
  const alvo = await resolverSlug(slug, database);
  if (!alvo) throw new ErroNegocio("Agenda indisponível");

  return withSistema(
    alvo.tenantId,
    async (tx) => {
      const inicio = new Date(pedido.inicio);
      const oferta = (await ofertas(tx, alvo.profissionalId, agora)).find((o) => o.inicio.getTime() === inicio.getTime());
      if (!oferta) throw new ErroNegocio("Este horário não está mais disponível. Escolha outro.");
      const [p] = await tx.select().from(profissionais).where(eq(profissionais.id, alvo.profissionalId));
      const fim = new Date(inicio.getTime() + p.duracaoConsultaMin * 60_000);

      let paciente = await encontrarPaciente(tx, pedido.cpf, pedido.telefone);
      if (!paciente) {
        [paciente] = await tx
          .insert(pacientes)
          .values({
            nome: pedido.nome,
            telefone: pedido.telefone,
            email: pedido.email,
            cpf: pedido.cpf,
            consentimentoLembretes: pedido.consentimentoLembretes,
            consentimentoEm: pedido.consentimentoLembretes ? agora : null,
          })
          .returning();
        await registrarAuditoria(tx, { acao: "paciente.criado", entidade: "pacientes", entidadeId: paciente.id, dados: { origem: "online" } });
      } else if (pedido.consentimentoLembretes && !paciente.consentimentoLembretes) {
        // O próprio paciente consentiu agora; não retiramos consentimento dado antes.
        await tx.update(pacientes).set({ consentimentoLembretes: true, consentimentoEm: agora }).where(eq(pacientes.id, paciente.id));
      }

      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(agendamentos)
        .where(
          and(
            eq(agendamentos.pacienteId, paciente.id),
            eq(agendamentos.origem, "online"),
            inArray(agendamentos.status, [...STATUS_ATIVOS]),
            gt(sql`lower(${agendamentos.periodo})`, sql`${agora.toISOString()}::timestamptz`),
          ),
        );
      if (total >= MAX_ONLINE_POR_PACIENTE) {
        throw new ErroNegocio("Você já tem agendamentos futuros marcados por aqui. Fale com o espaço para marcar outros.");
      }

      const [agendamento] = await tx
        .insert(agendamentos)
        .values({
          reservaId: oferta.reservaId,
          profissionalId: alvo.profissionalId,
          pacienteId: paciente.id,
          periodo: { inicio, fim },
          origem: "online",
        })
        .returning({ id: agendamentos.id })
        .catch((erro: unknown) => {
          // Outro paciente levou o horário entre a consulta e a gravação (EXCLUDE do banco).
          if (erroPostgres(erro)?.code === PG.violacaoExclusao) {
            throw new ErroNegocio("Este horário acabou de ser ocupado. Escolha outro.");
          }
          throw erro;
        });
      await vincularPaciente(tx, paciente.id, alvo.profissionalId);
      await registrarAuditoria(tx, {
        acao: "agendamento.criado",
        entidade: "agendamentos",
        entidadeId: agendamento.id,
        dados: { origem: "online", profissionalId: alvo.profissionalId, inicio: inicio.toISOString() },
      });

      const local = partesLocais(inicio, oferta.timezone);
      return {
        link: linkDoAgendamento(alvo.tenantId, agendamento.id, fim),
        data: formatarDataBr(local.data),
        hora: local.hora,
        profissional: p.nome,
        local: oferta.endereco ? `${oferta.unidadeNome} — ${oferta.endereco}` : oferta.unidadeNome,
        paciente: primeiroNome(paciente.nome),
      };
    },
    database,
  );
}
