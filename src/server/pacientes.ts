import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { agendamentos, pacientes, pacientesProfissionais, profissionais, reservasSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { cpfValido, somenteDigitos } from "../domain/documentos";
import { exigirPermissao, pode } from "../domain/rbac";
import { dataValida, partesLocais } from "../domain/tempo";
import { ErroNegocio } from "./erros";
import { profissionalDoUsuario } from "./profissionais";

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const pacienteSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do paciente").max(120),
  cpf: z
    .string()
    .optional()
    .transform((v) => (v ? somenteDigitos(v) : null))
    .refine((v) => v === null || cpfValido(v), "CPF inválido"),
  dataNascimento: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || dataValida(v), "Data de nascimento inválida"),
  telefone: textoOpcional(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "E-mail inválido"),
  consentimentoLembretes: z.boolean().default(false),
});

function traduzirErroPaciente(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.violacaoUnica && pg.constraint === "pacientes_tenant_cpf_key") {
    throw new ErroNegocio("Já existe um paciente com esse CPF");
  }
  throw erro;
}

/** Profissional só acessa pacientes vinculados a ele; admin/recepção acessam todos. */
type Acesso = { todos: true } | { todos: false; profissionalId: string };

export async function acessoAPacientes(tx: Transaction, ctx: ContextoTenant): Promise<Acesso> {
  if (pode(ctx.role, "pacientes.gerenciar")) return { todos: true };
  exigirPermissao(ctx.role, "pacientes.proprios");
  const proprio = await profissionalDoUsuario(tx, ctx.userId);
  if (!proprio) throw new ErroNegocio("Seu usuário não está vinculado a um cadastro de profissional");
  return { todos: false, profissionalId: proprio.id };
}

export async function pacienteVisivel(tx: Transaction, acesso: Acesso, pacienteId: string): Promise<boolean> {
  const condicao = acesso.todos
    ? eq(pacientes.id, pacienteId)
    : and(eq(pacientes.id, pacienteId), sql`exists (
        select 1 from ${pacientesProfissionais}
        where ${pacientesProfissionais.pacienteId} = ${pacientes.id}
          and ${pacientesProfissionais.profissionalId} = ${acesso.profissionalId})`);
  const [linha] = await tx.select({ id: pacientes.id }).from(pacientes).where(condicao);
  return Boolean(linha);
}

export async function vincularPaciente(tx: Transaction, pacienteId: string, profissionalId: string) {
  await tx.insert(pacientesProfissionais).values({ pacienteId, profissionalId }).onConflictDoNothing();
}

export async function criarPaciente(
  ctx: ContextoTenant,
  dados: z.input<typeof pacienteSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string }> {
  const valores = pacienteSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const acesso = await acessoAPacientes(tx, ctx);
      const [paciente] = await tx
        .insert(pacientes)
        .values({ ...valores, consentimentoEm: valores.consentimentoLembretes ? agora : null })
        .returning({ id: pacientes.id })
        .catch(traduzirErroPaciente);
      if (!acesso.todos) await vincularPaciente(tx, paciente.id, acesso.profissionalId);
      // Sem dados pessoais no audit_log (minimização): só o fato.
      await registrarAuditoria(tx, { acao: "paciente.criado", entidade: "pacientes", entidadeId: paciente.id });
      return paciente;
    },
    database,
  );
}

export async function atualizarPaciente(
  ctx: ContextoTenant,
  pacienteId: string,
  dados: z.input<typeof pacienteSchema> & { ativo: boolean },
  agora = new Date(),
  database?: Database,
): Promise<void> {
  const valores = pacienteSchema.parse(dados);
  await withTenant(
    ctx,
    async (tx) => {
      const acesso = await acessoAPacientes(tx, ctx);
      if (!(await pacienteVisivel(tx, acesso, pacienteId))) throw new ErroNegocio("Paciente não encontrado");
      const [atual] = await tx.select().from(pacientes).where(eq(pacientes.id, pacienteId));
      if (atual.anonimizadoEm) throw new ErroNegocio("Paciente anonimizado: o cadastro não pode mais ser alterado");
      const mudouConsentimento = atual.consentimentoLembretes !== valores.consentimentoLembretes;
      await tx
        .update(pacientes)
        .set({
          ...valores,
          ativo: dados.ativo,
          ...(mudouConsentimento ? { consentimentoEm: valores.consentimentoLembretes ? agora : null } : {}),
        })
        .where(eq(pacientes.id, pacienteId))
        .catch(traduzirErroPaciente);
      await registrarAuditoria(tx, {
        acao: "paciente.atualizado",
        entidade: "pacientes",
        entidadeId: pacienteId,
        dados: mudouConsentimento ? { consentimentoLembretes: valores.consentimentoLembretes } : undefined,
      });
    },
    database,
  );
}

type FiltroPacientes = { busca?: string; incluirInativos?: boolean };

/** Visibilidade + busca por nome, CPF ou telefone (dígitos, ignorando a formatação gravada). */
function condicaoPacientes(acesso: Acesso, filtro: FiltroPacientes) {
  const busca = filtro.busca?.trim();
  const digitos = busca ? somenteDigitos(busca) : "";
  return and(
    filtro.incluirInativos ? undefined : eq(pacientes.ativo, true),
    acesso.todos
      ? undefined
      : sql`exists (select 1 from ${pacientesProfissionais}
          where ${pacientesProfissionais.pacienteId} = ${pacientes.id}
            and ${pacientesProfissionais.profissionalId} = ${acesso.profissionalId})`,
    busca
      ? or(
          ilike(pacientes.nome, `%${busca.replace(/[%_\\]/g, "\\$&")}%`),
          digitos.length >= 3 ? ilike(pacientes.cpf, `%${digitos}%`) : undefined,
          digitos.length >= 3 ? sql`regexp_replace(coalesce(${pacientes.telefone}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : undefined,
        )
      : undefined,
  );
}

const colunasDaLista = {
  id: pacientes.id,
  nome: pacientes.nome,
  cpf: pacientes.cpf,
  telefone: pacientes.telefone,
  email: pacientes.email,
  dataNascimento: pacientes.dataNascimento,
  consentimentoLembretes: pacientes.consentimentoLembretes,
  ativo: pacientes.ativo,
};

export const PACIENTES_POR_PAGINA = 30;

/** Página da lista de pacientes, com o total (para a paginação). */
export async function buscarPacientes(
  ctx: ContextoTenant,
  filtro: FiltroPacientes & { pagina?: number; porPagina?: number } = {},
  database?: Database,
) {
  const porPagina = Math.min(Math.max(filtro.porPagina ?? PACIENTES_POR_PAGINA, 1), 100);
  const pagina = Math.max(Math.floor(filtro.pagina ?? 1), 1);
  return withTenant(
    ctx,
    async (tx) => {
      const condicao = condicaoPacientes(await acessoAPacientes(tx, ctx), filtro);
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(pacientes).where(condicao);
      const itens = await tx
        .select(colunasDaLista)
        .from(pacientes)
        .where(condicao)
        .orderBy(asc(pacientes.nome), asc(pacientes.id))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina);
      return { itens, total, pagina, porPagina, paginas: Math.max(Math.ceil(total / porPagina), 1) };
    },
    database,
  );
}

/** Lista curta (até 100), para seletores que ainda não usam a busca. */
export async function listarPacientes(ctx: ContextoTenant, filtro: FiltroPacientes = {}, database?: Database) {
  return (await buscarPacientes(ctx, { ...filtro, porPagina: 100 }, database)).itens;
}

/** Paciente + histórico de agendamentos (o profissional vê só os próprios atendimentos). */
export async function obterPaciente(ctx: ContextoTenant, pacienteId: string, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const acesso = await acessoAPacientes(tx, ctx);
      if (!(await pacienteVisivel(tx, acesso, pacienteId))) return null;
      const [paciente] = await tx.select().from(pacientes).where(eq(pacientes.id, pacienteId));
      const historico = await tx
        .select({
          id: agendamentos.id,
          periodo: agendamentos.periodo,
          status: agendamentos.status,
          cancelamentoTardio: agendamentos.cancelamentoTardio,
          profissionalNome: profissionais.nome,
          salaNome: salas.nome,
          timezone: unidades.timezone,
        })
        .from(agendamentos)
        .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
        .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(
          and(
            eq(agendamentos.pacienteId, pacienteId),
            acesso.todos ? undefined : eq(agendamentos.profissionalId, acesso.profissionalId),
          ),
        )
        .orderBy(desc(agendamentos.periodo))
        .limit(100);
      return {
        paciente,
        historico: historico.map((h) => {
          const ini = partesLocais(h.periodo.inicio, h.timezone);
          return {
            id: h.id,
            data: ini.data,
            horaInicio: ini.hora,
            horaFim: partesLocais(h.periodo.fim, h.timezone).hora,
            status: h.status,
            cancelamentoTardio: h.cancelamentoTardio,
            profissionalNome: h.profissionalNome,
            salaNome: h.salaNome,
          };
        }),
      };
    },
    database,
  );
}
