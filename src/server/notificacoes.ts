import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { agendamentos, notificacoesOutbox, pacientes, profissionais, reservasSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { ErroAgendamento, STATUS_ATIVOS } from "../domain/agendamentos";
import {
  atrasoRetentativaMs,
  LEMBRETE_ANTECEDENCIA_MAX_H,
  LEMBRETE_ANTECEDENCIA_MIN_H,
  MAX_TENTATIVAS,
  normalizarTelefoneBr,
  primeiroNome,
  textoDaMensagem,
} from "../domain/notificacoes";
import { exigirPermissao } from "../domain/rbac";
import { partesLocais } from "../domain/tempo";
import { aplicarStatusAgendamento } from "./agendamentos";
import { ErroNegocio } from "./erros";
import { lerTokenAgendamento, linkDoAgendamento } from "./links";
import { ErroEnvio, type NotificationProvider } from "./provider";
import { formatarDataBr } from "./reservas";

const horas = (h: number) => h * 3_600_000;

function local(unidadeNome: string, endereco: string | null): string {
  return endereco ? `${unidadeNome} — ${endereco}` : unidadeNome;
}

// ---------------------------------------------------------------------------
// Agendamento dos lembretes (job do worker, um tenant por vez)
// ---------------------------------------------------------------------------

/**
 * Enfileira os lembretes D-1: agendamentos (para pacientes que consentiram) e reservas
 * (para o profissional) que começam entre 2h e 24h a partir de agora. Idempotente.
 */
export async function agendarLembretes(tx: Transaction, agora = new Date()): Promise<{ agendamentos: number; reservas: number }> {
  const [{ tenantId }] = (await tx.execute<{ tenantid: string }>(sql`select app_current_tenant_id() as tenantid`)).rows.map(
    (r) => ({ tenantId: r.tenantid }),
  );
  const janela = sql`tstzrange(${new Date(agora.getTime() + horas(LEMBRETE_ANTECEDENCIA_MIN_H)).toISOString()}::timestamptz, ${new Date(agora.getTime() + horas(LEMBRETE_ANTECEDENCIA_MAX_H)).toISOString()}::timestamptz, '(]')`;

  const candidatos = await tx
    .select({
      id: agendamentos.id,
      periodo: agendamentos.periodo,
      pacienteNome: pacientes.nome,
      telefone: pacientes.telefone,
      profissionalNome: profissionais.nome,
      unidadeNome: unidades.nome,
      endereco: unidades.endereco,
      timezone: unidades.timezone,
    })
    .from(agendamentos)
    .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
    .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
    .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(
      and(
        inArray(agendamentos.status, ["agendado", "confirmado"]),
        eq(pacientes.consentimentoLembretes, true),
        eq(pacientes.ativo, true),
        sql`lower(${agendamentos.periodo}) <@ ${janela}`,
      ),
    );

  let totalAgendamentos = 0;
  for (const c of candidatos) {
    const para = normalizarTelefoneBr(c.telefone);
    if (!para) continue;
    const inicio = partesLocais(c.periodo.inicio, c.timezone);
    const inseridas = await tx
      .insert(notificacoesOutbox)
      .values({
        tipo: "lembrete_agendamento",
        destinatario: para,
        agendamentoId: c.id,
        agendarPara: agora,
        parametros: {
          paciente: primeiroNome(c.pacienteNome),
          profissional: c.profissionalNome,
          data: formatarDataBr(inicio.data),
          hora: inicio.hora,
          local: local(c.unidadeNome, c.endereco),
          link: linkDoAgendamento(tenantId, c.id, c.periodo.fim),
        },
        // O horário entra na chave: se o atendimento for remarcado, sai um lembrete novo.
        idempotencyKey: `lembrete_agendamento:${c.id}:${c.periodo.inicio.toISOString()}`,
      })
      .onConflictDoNothing()
      .returning({ id: notificacoesOutbox.id });
    totalAgendamentos += inseridas.length;
  }

  const reservas = await tx
    .select({
      id: reservasSala.id,
      periodo: reservasSala.periodo,
      profissionalNome: profissionais.nome,
      telefone: profissionais.telefone,
      salaNome: salas.nome,
      unidadeNome: unidades.nome,
      endereco: unidades.endereco,
      timezone: unidades.timezone,
    })
    .from(reservasSala)
    .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(and(eq(reservasSala.status, "ativa"), eq(profissionais.ativo, true), sql`lower(${reservasSala.periodo}) <@ ${janela}`));

  let totalReservas = 0;
  for (const r of reservas) {
    const para = normalizarTelefoneBr(r.telefone);
    if (!para) continue;
    const inicio = partesLocais(r.periodo.inicio, r.timezone);
    const inseridas = await tx
      .insert(notificacoesOutbox)
      .values({
        tipo: "lembrete_reserva",
        destinatario: para,
        reservaId: r.id,
        agendarPara: agora,
        parametros: {
          profissional: primeiroNome(r.profissionalNome),
          sala: r.salaNome,
          data: formatarDataBr(inicio.data),
          hora: inicio.hora,
          local: local(r.unidadeNome, r.endereco),
        },
        idempotencyKey: `lembrete_reserva:${r.id}:${r.periodo.inicio.toISOString()}`,
      })
      .onConflictDoNothing()
      .returning({ id: notificacoesOutbox.id });
    totalReservas += inseridas.length;
  }
  return { agendamentos: totalAgendamentos, reservas: totalReservas };
}

// ---------------------------------------------------------------------------
// Envio (job do worker)
// ---------------------------------------------------------------------------

/** Reservado há mais que isso e ainda "enviando" = o worker caiu no meio; volta para a fila. */
const ENVIANDO_EXPIRA_MS = 10 * 60_000;

type Reivindicada = typeof notificacoesOutbox.$inferSelect;

/**
 * Processa a fila de um tenant em três passos, para não segurar transação durante a
 * chamada externa: (1) reivindica e revalida, (2) envia, (3) registra o resultado.
 */
export async function processarFila(
  tenantId: string,
  provider: NotificationProvider,
  agora = new Date(),
  limite = 20,
  database: Database = getDb(),
): Promise<{ enviadas: number; falhas: number; canceladas: number }> {
  const resultado = { enviadas: 0, falhas: 0, canceladas: 0 };

  const lote = await withSistema(
    tenantId,
    async (tx) => {
      await tx
        .update(notificacoesOutbox)
        .set({ status: "pendente" })
        .where(
          and(
            eq(notificacoesOutbox.status, "enviando"),
            sql`${notificacoesOutbox.atualizadoEm} < ${new Date(agora.getTime() - ENVIANDO_EXPIRA_MS).toISOString()}::timestamptz`,
          ),
        );
      const pendentes = await tx
        .select()
        .from(notificacoesOutbox)
        .where(and(eq(notificacoesOutbox.status, "pendente"), lte(notificacoesOutbox.agendarPara, agora)))
        .orderBy(notificacoesOutbox.agendarPara)
        .limit(limite)
        .for("update", { skipLocked: true });

      const validas: Reivindicada[] = [];
      for (const n of pendentes) {
        const motivo = await motivoParaNaoEnviar(tx, n, agora);
        if (motivo) {
          await tx.update(notificacoesOutbox).set({ status: "cancelado", ultimoErro: motivo }).where(eq(notificacoesOutbox.id, n.id));
          resultado.canceladas++;
          continue;
        }
        await tx
          .update(notificacoesOutbox)
          .set({ status: "enviando", tentativas: n.tentativas + 1 })
          .where(eq(notificacoesOutbox.id, n.id));
        validas.push({ ...n, tentativas: n.tentativas + 1 });
      }
      return validas;
    },
    database,
  );

  for (const n of lote) {
    try {
      const { id } = await provider.enviar({ para: n.destinatario, tipo: n.tipo, parametros: n.parametros });
      await withSistema(
        tenantId,
        (tx) =>
          tx
            .update(notificacoesOutbox)
            .set({ status: "enviado", enviadoEm: new Date(), mensagemProviderId: id, ultimoErro: null })
            .where(eq(notificacoesOutbox.id, n.id)),
        database,
      );
      resultado.enviadas++;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const definitivo = (erro instanceof ErroEnvio && !erro.retentavel) || n.tentativas >= MAX_TENTATIVAS;
      await withSistema(
        tenantId,
        (tx) =>
          tx
            .update(notificacoesOutbox)
            .set(
              definitivo
                ? { status: "falhou", ultimoErro: mensagem }
                : { status: "pendente", ultimoErro: mensagem, agendarPara: new Date(agora.getTime() + atrasoRetentativaMs(n.tentativas)) },
            )
            .where(eq(notificacoesOutbox.id, n.id)),
        database,
      );
      resultado.falhas++;
    }
  }
  return resultado;
}

/** Revalida antes de enviar: o compromisso ainda vale e o paciente ainda consente? */
async function motivoParaNaoEnviar(tx: Transaction, n: Reivindicada, agora: Date): Promise<string | null> {
  if (n.agendamentoId) {
    const [a] = await tx
      .select({ status: agendamentos.status, periodo: agendamentos.periodo, consentimento: pacientes.consentimentoLembretes })
      .from(agendamentos)
      .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
      .where(eq(agendamentos.id, n.agendamentoId));
    if (!a || !(["agendado", "confirmado"] as string[]).includes(a.status)) return "Agendamento não está mais ativo";
    if (!a.consentimento) return "Paciente retirou o consentimento";
    if (a.periodo.inicio.getTime() <= agora.getTime()) return "Horário já passou";
  }
  if (n.reservaId) {
    const [r] = await tx.select({ status: reservasSala.status, periodo: reservasSala.periodo }).from(reservasSala).where(eq(reservasSala.id, n.reservaId));
    if (!r || r.status !== "ativa") return "Reserva não está mais ativa";
    if (r.periodo.inicio.getTime() <= agora.getTime()) return "Horário já passou";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Link do paciente (sem login)
// ---------------------------------------------------------------------------

export type AgendamentoPublico = {
  pacienteNome: string;
  profissionalNome: string;
  data: string;
  hora: string;
  local: string;
  status: (typeof agendamentos.$inferSelect)["status"];
  recebeLembretes: boolean;
};

async function carregarPeloToken<T>(token: string, agora: Date, database: Database, fn: (tx: Transaction, agendamentoId: string) => Promise<T>) {
  const payload = lerTokenAgendamento(token, agora);
  if (!payload) return null;
  return withSistema(payload.tenantId, (tx) => fn(tx, payload.agendamentoId), database);
}

/** Dados mínimos para a página do link (primeiro nome, data, hora, profissional, local). */
export async function obterAgendamentoPublico(token: string, agora = new Date(), database: Database = getDb()) {
  return carregarPeloToken(token, agora, database, async (tx, agendamentoId): Promise<AgendamentoPublico | null> => {
    const [a] = await tx
      .select({
        periodo: agendamentos.periodo,
        status: agendamentos.status,
        pacienteNome: pacientes.nome,
        consentimento: pacientes.consentimentoLembretes,
        profissionalNome: profissionais.nome,
        unidadeNome: unidades.nome,
        endereco: unidades.endereco,
        timezone: unidades.timezone,
      })
      .from(agendamentos)
      .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
      .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
      .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
      .innerJoin(salas, eq(salas.id, reservasSala.salaId))
      .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
      .where(eq(agendamentos.id, agendamentoId));
    if (!a) return null;
    const inicio = partesLocais(a.periodo.inicio, a.timezone);
    return {
      pacienteNome: primeiroNome(a.pacienteNome),
      profissionalNome: a.profissionalNome,
      data: formatarDataBr(inicio.data),
      hora: inicio.hora,
      local: local(a.unidadeNome, a.endereco),
      status: a.status,
      recebeLembretes: a.consentimento,
    };
  });
}

export type AcaoDoPaciente = "confirmar" | "cancelar" | "parar_lembretes";

/** Ação pelo link: confirmar, cancelar (mesma política de cancelamento) ou parar lembretes. */
export async function acaoDoPaciente(
  token: string,
  acao: AcaoDoPaciente,
  agora = new Date(),
  database: Database = getDb(),
): Promise<{ mensagem: string }> {
  const resultado = await carregarPeloToken(token, agora, database, async (tx, agendamentoId) => {
    const [agendamento] = await tx.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId)).for("update");
    if (!agendamento) throw new ErroNegocio("Agendamento não encontrado");

    if (acao === "parar_lembretes") {
      await tx
        .update(pacientes)
        .set({ consentimentoLembretes: false, consentimentoEm: null })
        .where(eq(pacientes.id, agendamento.pacienteId));
      const doPaciente = tx
        .select({ id: agendamentos.id })
        .from(agendamentos)
        .where(eq(agendamentos.pacienteId, agendamento.pacienteId));
      await tx
        .update(notificacoesOutbox)
        .set({ status: "cancelado", ultimoErro: "Paciente pediu para parar" })
        .where(and(eq(notificacoesOutbox.status, "pendente"), inArray(notificacoesOutbox.agendamentoId, doPaciente)));
      await registrarAuditoria(tx, {
        acao: "paciente.consentimento_retirado",
        entidade: "pacientes",
        entidadeId: agendamento.pacienteId,
        dados: { origem: "link" },
      });
      return { mensagem: "Pronto: você não receberá mais lembretes por WhatsApp." };
    }

    if (!STATUS_ATIVOS.includes(agendamento.status) || agendamento.status === "presente") {
      throw new ErroNegocio("Este atendimento não pode mais ser alterado por aqui. Fale com a recepção.");
    }
    if (acao === "confirmar") {
      if (agendamento.status === "confirmado") return { mensagem: "Seu atendimento já estava confirmado. Até lá!" };
      await aplicarStatusAgendamento(tx, agendamento, "confirmado", null, agora, "paciente");
      return { mensagem: "Atendimento confirmado. Até lá!" };
    }
    const { cancelamentoTardio } = await aplicarStatusAgendamento(tx, agendamento, "cancelado", "Cancelado pelo paciente", agora, "paciente");
    return {
      mensagem: cancelamentoTardio
        ? "Atendimento cancelado. Como foi com pouca antecedência, pode haver cobrança conforme a política do espaço."
        : "Atendimento cancelado.",
    };
  }).catch((erro: unknown) => {
    if (erro instanceof ErroAgendamento) throw new ErroNegocio(erro.message);
    throw erro;
  });
  if (!resultado) throw new ErroNegocio("Link inválido ou expirado");
  return resultado;
}

// ---------------------------------------------------------------------------
// Leitura (tela da outbox)
// ---------------------------------------------------------------------------

export async function listarNotificacoes(ctx: ContextoTenant, filtro: { status?: string } = {}, database?: Database) {
  exigirPermissao(ctx.role, "auditoria.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const linhas = await tx
        .select()
        .from(notificacoesOutbox)
        .where(
          filtro.status && ["pendente", "enviando", "enviado", "falhou", "cancelado"].includes(filtro.status)
            ? eq(notificacoesOutbox.status, filtro.status as never)
            : undefined,
        )
        .orderBy(desc(notificacoesOutbox.criadoEm))
        .limit(100);
      return linhas.map((n) => ({ ...n, texto: textoDaMensagem(n.tipo, n.parametros) }));
    },
    database,
  );
}

/** Recoloca na fila uma notificação que falhou (ação do admin). */
export async function reenviarNotificacao(ctx: ContextoTenant, id: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "auditoria.ver");
  await withTenant(
    ctx,
    async (tx) => {
      const alteradas = await tx
        .update(notificacoesOutbox)
        .set({ status: "pendente", agendarPara: agora, tentativas: 0, ultimoErro: null })
        .where(and(eq(notificacoesOutbox.id, id), eq(notificacoesOutbox.status, "falhou")))
        .returning({ id: notificacoesOutbox.id });
      if (alteradas.length === 0) throw new ErroNegocio("Só é possível reenviar notificações que falharam");
      await registrarAuditoria(tx, { acao: "notificacao.reenviada", entidade: "notificacoes_outbox", entidadeId: id });
    },
    database,
  );
}
