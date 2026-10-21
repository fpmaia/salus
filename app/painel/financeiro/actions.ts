"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { lerMoeda, lerPercentualBp } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import {
  definirValorAgendamento,
  fecharCompetencia,
  lancarAjuste,
  registrarPagamento,
  reprocessar,
} from "@/src/server/financeiro";
import {
  cancelarCobranca,
  criarCobrancaProfissional,
  gerarTokenWebhook,
  reenviarCobranca,
  salvarConfigCobranca,
  simularPagamento,
} from "@/src/server/cobrancas";

function moeda(formData: FormData, campo: string, obrigatorio = false): number | null {
  const bruto = texto(formData, campo).trim();
  if (!bruto) {
    if (obrigatorio) throw new ErroNegocio("Informe o valor");
    return null;
  }
  const valor = lerMoeda(bruto);
  if (valor === null) throw new ErroNegocio(`Valor inválido: ${bruto}`);
  return valor;
}

function percentual(formData: FormData, campo: string): number | null {
  const bruto = texto(formData, campo).trim();
  if (!bruto) return null;
  const valor = lerPercentualBp(bruto);
  if (valor === null) throw new ErroNegocio(`Percentual inválido: ${bruto}`);
  return valor;
}

export async function fecharCompetenciaAcao(profissionalId: string, competencia: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await fecharCompetencia(ctx, profissionalId, competencia);
    return "Competência fechada";
  });
}

export async function reprocessarAcao(competencia: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { criados, estornados } = await reprocessar(ctx, competencia);
    return criados || estornados ? `${criados} lançamentos criados, ${estornados} estornados` : "Nada a ajustar: o ledger já está em dia";
  });
}

export async function registrarPagamentoAcao(profissionalId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await registrarPagamento(ctx, {
      profissionalId,
      data: texto(formData, "data"),
      valorCentavos: moeda(formData, "valor", true)!,
      direcao: texto(formData, "direcao") as never,
      forma: texto(formData, "forma") as never,
      observacao: texto(formData, "observacao"),
    });
    return "Pagamento registrado";
  });
}

export async function lancarAjusteAcao(profissionalId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await lancarAjuste(ctx, {
      profissionalId,
      data: texto(formData, "data"),
      natureza: texto(formData, "natureza") as never,
      valorCentavos: moeda(formData, "valor", true)!,
      descricao: texto(formData, "descricao"),
    });
    return "Ajuste lançado";
  });
}

export async function definirValorAcao(agendamentoId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await definirValorAgendamento(ctx, agendamentoId, moeda(formData, "valor"));
    return "Valor salvo";
  });
}

// ---------------------------------------------------------------------------
// Cobrança automática (Asaas do espaço)
// ---------------------------------------------------------------------------

export async function salvarConfigCobrancaAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await salvarConfigCobranca(ctx, {
      ativo: formData.get("ativo") === "on",
      ambiente: texto(formData, "ambiente") as never,
      apiKey: texto(formData, "apiKey"),
      diasVencimento: Number(texto(formData, "diasVencimento") || 5),
      multaBp: percentual(formData, "multa"),
      jurosMesBp: percentual(formData, "juros"),
    });
    return "Configuração salva";
  });
}

export async function gerarTokenWebhookAcao() {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { url, token } = await gerarTokenWebhook(ctx);
    return {
      erro: null,
      sucesso: "Cadastre no painel do Asaas (Integrações → Webhooks) com os eventos de cobrança. O token só é exibido agora.",
      dados: { url, token },
    };
  });
}

export async function criarCobrancaAcao(profissionalId: string, competencia: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const cobranca = await criarCobrancaProfissional(ctx, {
      profissionalId,
      valorCentavos: moeda(formData, "valor", true)!,
      vencimento: texto(formData, "vencimento") || undefined,
      forma: (texto(formData, "forma") || "UNDEFINED") as never,
      competencia,
    });
    if (cobranca.status === "erro") return { erro: `Não foi possível enviar ao Asaas: ${cobranca.ultimoErro}`, sucesso: null };
    return "Cobrança criada";
  });
}

export async function cancelarCobrancaAcao(cobrancaId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await cancelarCobranca(ctx, cobrancaId);
    return "Cobrança cancelada";
  });
}

export async function reenviarCobrancaAcao(cobrancaId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const c = await reenviarCobranca(ctx, cobrancaId);
    return c.status === "erro" ? { erro: c.ultimoErro ?? "Falhou de novo", sucesso: null } : "Cobrança enviada";
  });
}

export async function simularPagamentoAcao(cobrancaId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await simularPagamento(ctx, cobrancaId);
    return "Pagamento simulado: baixa lançada no extrato";
  });
}
