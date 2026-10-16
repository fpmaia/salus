"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { reenviarNotificacao } from "@/src/server/notificacoes";

export async function reenviarNotificacaoAcao(id: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await reenviarNotificacao(ctx, id);
    return "Recolocada na fila";
  });
}
