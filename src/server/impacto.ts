import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { registrarAuditoria } from "../db/audit";
import type { Transaction } from "../db/client";
import { agendamentos, notificacoesOutbox, pacientes, profissionais, reservasSala, salas, unidades } from "../db/schema";
import { STATUS_ATIVOS } from "../domain/agendamentos";
import { normalizarTelefoneBr, primeiroNome } from "../domain/notificacoes";
import { instanteLocal, partesLocais, somarDias, type DataLocal } from "../domain/tempo";
import { aplicarStatusAgendamento } from "./agendamentos";
import { ErroNegocio } from "./erros";
import { gerarLancamentosReserva } from "./financeiro";
import { cancelarNotificacoesDaReserva } from "./outbox";

// Impacto de feriados e desativações nas reservas já marcadas: a lista de afetadas é mostrada
// ao admin, que decide manter ou cancelar (pelo espaço, sem cobrança, avisando por WhatsApp).

export type DecisaoImpacto = "manter" | "cancelar";

export type ReservaAfetada = {
  reservaId: string;
  data: DataLocal;
  horaInicio: string;
  horaFim: string;
  salaNome: string;
  profissionalNome: string;
  /** Atendimentos ativos dentro da reserva. */
  pacientes: number;
};

/** Há reservas afetadas e o admin ainda não decidiu: a mensagem traz a lista. */
export class ErroImpacto extends ErroNegocio {
  constructor(
    readonly afetadas: ReservaAfetada[],
    contexto: string,
  ) {
    const comPacientes = afetadas.filter((a) => a.pacientes > 0).length;
    const lista = afetadas
      .slice(0, 5)
      .map((a) => `${a.data.slice(8, 10)}/${a.data.slice(5, 7)} ${a.horaInicio}–${a.horaFim} ${a.salaNome} · ${a.profissionalNome}${a.pacientes ? ` (${a.pacientes} paciente${a.pacientes > 1 ? "s" : ""})` : ""}`)
      .join("; ");
    super(
      `${contexto}: ${afetadas.length} reserva(s) já marcada(s)${comPacientes ? `, ${comPacientes} com pacientes` : ""}. ` +
        `${lista}${afetadas.length > 5 ? `; e mais ${afetadas.length - 5}` : ""}. Escolha manter as reservas ou cancelar e avisar.`,
    );
    this.name = "ErroImpacto";
  }
}

type Filtro = { salaId?: string; profissionalId?: string; data?: DataLocal; unidadeId?: string | null };

/** Reservas ativas que ainda não começaram, pelo filtro (data = dia local no fuso de cada unidade). */
export async function reservasAfetadas(tx: Transaction, filtro: Filtro, agora: Date): Promise<(ReservaAfetada & { timezone: string })[]> {
  const linhas = await tx
    .select({
      reservaId: reservasSala.id,
      periodo: reservasSala.periodo,
      timezone: unidades.timezone,
      salaNome: salas.nome,
      profissionalNome: profissionais.nome,
      pacientes: sql<number>`(select count(*)::int from ${agendamentos}
        where ${agendamentos.reservaId} = ${reservasSala.id}
          and ${agendamentos.status} in ('agendado', 'confirmado', 'presente'))`,
    })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
    .where(
      and(
        eq(reservasSala.status, "ativa"),
        sql`lower(${reservasSala.periodo}) > ${agora.toISOString()}::timestamptz`,
        filtro.salaId ? eq(reservasSala.salaId, filtro.salaId) : undefined,
        filtro.profissionalId ? eq(reservasSala.profissionalId, filtro.profissionalId) : undefined,
        filtro.unidadeId ? eq(salas.unidadeId, filtro.unidadeId) : undefined,
        // Margem de um dia para cobrir qualquer fuso; o filtro exato é feito abaixo.
        filtro.data
          ? sql`${reservasSala.periodo} && tstzrange(${instanteLocal(somarDias(filtro.data, -1), "00:00", "UTC").toISOString()}::timestamptz, ${instanteLocal(somarDias(filtro.data, 2), "00:00", "UTC").toISOString()}::timestamptz)`
          : undefined,
      ),
    )
    .orderBy(asc(reservasSala.periodo));
  return linhas
    .map(({ periodo, ...l }) => {
      const inicio = partesLocais(periodo.inicio, l.timezone);
      return { ...l, data: inicio.data, horaInicio: inicio.hora, horaFim: partesLocais(periodo.fim, l.timezone).hora };
    })
    .filter((r) => !filtro.data || r.data === filtro.data);
}

/**
 * Aplica a decisão: sem afetadas, nada a fazer; afetadas sem decisão, ErroImpacto (a transação
 * volta); "cancelar" cancela atendimentos e reservas pelo espaço e enfileira os avisos.
 */
export async function decidirImpacto(
  tx: Transaction,
  afetadas: (ReservaAfetada & { timezone: string })[],
  decisao: DecisaoImpacto | undefined,
  contexto: { titulo: string; motivo: string },
  agora: Date,
): Promise<{ canceladas: number; avisos: number }> {
  if (afetadas.length === 0 || decisao === "manter") return { canceladas: 0, avisos: 0 };
  if (!decisao) throw new ErroImpacto(afetadas, contexto.titulo);
  let avisos = 0;
  for (const r of afetadas) avisos += await cancelarPeloEspaco(tx, r, contexto.motivo, agora);
  return { canceladas: afetadas.length, avisos };
}

async function cancelarPeloEspaco(tx: Transaction, r: ReservaAfetada & { timezone: string }, motivo: string, agora: Date): Promise<number> {
  let avisos = 0;
  const ativos = await tx
    .select()
    .from(agendamentos)
    .where(and(eq(agendamentos.reservaId, r.reservaId), inArray(agendamentos.status, [...STATUS_ATIVOS])))
    .for("update");
  for (const a of ativos) {
    // Pelo espaço: sem cobrança de cancelamento tardio para ninguém.
    await aplicarStatusAgendamento(tx, a, "cancelado", motivo, agora, "equipe", "espaco");
    const [p] = await tx
      .select({ nome: pacientes.nome, telefone: pacientes.telefone, consentimento: pacientes.consentimentoLembretes })
      .from(pacientes)
      .where(eq(pacientes.id, a.pacienteId));
    const para = p?.consentimento ? normalizarTelefoneBr(p.telefone) : null;
    if (para) {
      const inicio = partesLocais(a.periodo.inicio, r.timezone);
      avisos += await avisar(tx, {
        tipo: "cancelamento_agendamento",
        destinatario: para,
        agendamentoId: a.id,
        parametros: { paciente: primeiroNome(p.nome), profissional: r.profissionalNome, data: dataBr(inicio.data), hora: inicio.hora, motivo },
      });
    }
  }

  const [reserva] = await tx.select().from(reservasSala).where(eq(reservasSala.id, r.reservaId)).for("update");
  // A reserva criada pelo agendamento pode já ter sido liberada junto com o atendimento.
  if (reserva.status === "ativa") {
    await tx
      .update(reservasSala)
      .set({ status: "cancelada", canceladaEm: agora, canceladaPor: "espaco", motivoCancelamento: motivo })
      .where(eq(reservasSala.id, r.reservaId));
    await gerarLancamentosReserva(tx, r.reservaId);
    await cancelarNotificacoesDaReserva(tx, r.reservaId, "Reserva cancelada");
    await registrarAuditoria(tx, {
      acao: "reserva.cancelada",
      entidade: "reservas_sala",
      entidadeId: r.reservaId,
      dados: { motivo, canceladaPor: "espaco" },
    });
  }
  const [prof] = await tx.select({ telefone: profissionais.telefone }).from(profissionais).where(eq(profissionais.id, reserva.profissionalId));
  const para = normalizarTelefoneBr(prof?.telefone ?? null);
  if (para) {
    avisos += await avisar(tx, {
      tipo: "cancelamento_reserva",
      destinatario: para,
      reservaId: r.reservaId,
      parametros: { profissional: primeiroNome(r.profissionalNome), sala: r.salaNome, data: dataBr(r.data), hora: r.horaInicio, motivo },
    });
  }
  return avisos;
}

const dataBr = (d: DataLocal) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function avisar(
  tx: Transaction,
  aviso: {
    tipo: "cancelamento_agendamento" | "cancelamento_reserva";
    destinatario: string;
    agendamentoId?: string;
    reservaId?: string;
    parametros: Record<string, string>;
  },
): Promise<number> {
  const inseridas = await tx
    .insert(notificacoesOutbox)
    .values({ ...aviso, agendarPara: new Date(), idempotencyKey: `${aviso.tipo}:${aviso.agendamentoId ?? aviso.reservaId}` })
    .onConflictDoNothing()
    .returning({ id: notificacoesOutbox.id });
  return inseridas.length;
}
