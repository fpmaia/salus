import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "../db/client";
import { notificacoesOutbox } from "../db/schema";

/** Cancela as notificações ainda não enviadas de um agendamento. */
export async function cancelarNotificacoesDoAgendamento(tx: Transaction, agendamentoId: string, motivo: string) {
  await tx
    .update(notificacoesOutbox)
    .set({ status: "cancelado", ultimoErro: motivo })
    .where(and(eq(notificacoesOutbox.agendamentoId, agendamentoId), inArray(notificacoesOutbox.status, ["pendente"])));
}

/** Cancela as notificações ainda não enviadas de uma reserva. */
export async function cancelarNotificacoesDaReserva(tx: Transaction, reservaId: string, motivo: string) {
  await tx
    .update(notificacoesOutbox)
    .set({ status: "cancelado", ultimoErro: motivo })
    .where(and(eq(notificacoesOutbox.reservaId, reservaId), inArray(notificacoesOutbox.status, ["pendente"])));
}
