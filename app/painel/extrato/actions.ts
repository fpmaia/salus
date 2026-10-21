"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao, type EstadoAcao } from "@/src/server/acao";
import { pagarMeuSaldoComPix } from "@/src/server/cobrancas";
import { formatarMoeda } from "@/src/domain/dinheiro";

export async function pagarComPixAcao(): Promise<EstadoAcao> {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { cobranca, nova } = await pagarMeuSaldoComPix(ctx);
    if (cobranca.status === "erro") return { erro: `Não foi possível gerar o PIX agora: ${cobranca.ultimoErro ?? "tente de novo"}`, sucesso: null };
    return nova ? `PIX de ${formatarMoeda(cobranca.valorCentavos)} gerado` : "Você já tem uma cobrança em aberto: pague por ela";
  });
}
