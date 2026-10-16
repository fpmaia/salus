"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { simularPagamentoFatura, trocarPlano } from "@/src/server/assinatura";

export async function trocarPlanoAcao(codigo: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await trocarPlano(ctx, codigo);
    return "Plano alterado: vale a partir da próxima fatura";
  });
}

export async function simularPagamentoFaturaAcao(faturaId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await simularPagamentoFatura(ctx, faturaId);
    return "Pagamento simulado";
  });
}
