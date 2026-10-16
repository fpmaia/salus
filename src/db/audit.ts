import type { Transaction } from "./client";
import { auditLog } from "./schema";

export type EventoAuditoria = {
  acao: string;
  entidade: string;
  entidadeId?: string;
  dados?: Record<string, unknown>;
};

/** Grava no audit_log; tenant_id e user_id vêm do contexto do withTenant (defaults da tabela). */
export async function registrarAuditoria(tx: Transaction, evento: EventoAuditoria) {
  await tx.insert(auditLog).values({
    acao: evento.acao,
    entidade: evento.entidade,
    entidadeId: evento.entidadeId,
    dados: evento.dados,
  });
}
