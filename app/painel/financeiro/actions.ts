"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { lerMoeda, lerPercentualBp } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import {
  criarAcordo,
  definirValorAgendamento,
  fecharCompetencia,
  lancarAjuste,
  registrarPagamento,
  reprocessar,
} from "@/src/server/financeiro";

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

export async function criarAcordoAcao(profissionalId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const horas = texto(formData, "horasIncluidas").trim();
    await criarAcordo(ctx, {
      profissionalId,
      modelo: texto(formData, "modelo") as never,
      fluxoRecebimento: texto(formData, "fluxoRecebimento") as never,
      valorHoraCentavos: moeda(formData, "valorHora"),
      valorConsultaCentavos: moeda(formData, "valorConsulta"),
      percentualBp: percentual(formData, "percentual"),
      mensalidadeCentavos: moeda(formData, "mensalidade"),
      horasIncluidas: horas ? Number(horas) : null,
      regraFalta: texto(formData, "regraFalta") as never,
      faltaPercentualBp: percentual(formData, "faltaPercentual"),
      vigenteDe: texto(formData, "vigenteDe"),
    });
    return "Acordo salvo";
  });
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
