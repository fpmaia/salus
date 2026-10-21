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

/** Devolve à fila os lembretes cancelados por uma mudança de status desfeita (o envio revalida). */
export async function reativarNotificacoesDoAgendamento(tx: Transaction, agendamentoId: string, motivo: string) {
  await tx
    .update(notificacoesOutbox)
    .set({ status: "pendente", ultimoErro: null })
    .where(
      and(
        eq(notificacoesOutbox.agendamentoId, agendamentoId),
        eq(notificacoesOutbox.status, "cancelado"),
        eq(notificacoesOutbox.ultimoErro, motivo),
      ),
    );
}

/** Cancela as notificações ainda não enviadas de uma reserva. */
export async function cancelarNotificacoesDaReserva(tx: Transaction, reservaId: string, motivo: string) {
  await tx
    .update(notificacoesOutbox)
    .set({ status: "cancelado", ultimoErro: motivo })
    .where(and(eq(notificacoesOutbox.reservaId, reservaId), inArray(notificacoesOutbox.status, ["pendente"])));
}
