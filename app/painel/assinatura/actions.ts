"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { simularPagamentoFatura, trocarPlano } from "@/src/server/assinatura";

export async function trocarPlanoAcao(codigo: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await trocarPlano(ctx, codigo);
    return "Plano alterado: os limites já valem e a próxima fatura usa o novo plano";
  }, { liberadaNaSuspensao: true });
}

export async function simularPagamentoFaturaAcao(faturaId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await simularPagamentoFatura(ctx, faturaId);
    return "Pagamento simulado";
  }, { liberadaNaSuspensao: true });
}

export async function alternarLicencaProntuarioAcao(profissionalId: string, ativar: boolean) {
  return executarAcao(
    async () => {
      const ctx = await obterContextoTenant();
      const { ativarLicencaProntuario, desativarLicencaProntuario } = await import("@/src/server/assinatura");
      if (ativar) {
        await ativarLicencaProntuario(ctx, profissionalId);
        return "Licença ativada: paga pelo espaço na fatura mensal (15 dias grátis na primeira ativação).";
      }
      await desativarLicencaProntuario(ctx, profissionalId);
      return "Licença de prontuário desativada.";
    },
    // Desligar (reduzir custo) vale mesmo com o espaço suspenso; ativar, não.
    { liberadaNaSuspensao: !ativar },
  );
}
