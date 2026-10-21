"use server";

import { redirect } from "next/navigation";
import { obterContextoTenant } from "@/src/auth/sessao";
import { criarContrato, encerrarContrato } from "@/src/server/contratos";
import { lerMoeda } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao } from "@/src/server/acao";
import type { ItemGrade } from "@/src/domain/contratos";

export async function criarContratoAcao(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  let novoContratoId: string | null = null;

  const resultado = await executarAcao(async () => {
    const ctx = await obterContextoTenant();

    const profissionalId = String(formData.get("profissionalId") || "");
    const salaId = String(formData.get("salaId") || "");
    const dataInicio = String(formData.get("dataInicio") || "");
    const dataFim = String(formData.get("dataFim") || "") || undefined;
    const diaVencimento = Number(formData.get("diaVencimento") || 10);
    const valorMensalBruto = String(formData.get("valorMensal") || "0");
    const valorMensalCentavos = lerMoeda(valorMensalBruto) ?? 0;

    const cobrancaConsultaTipo = String(
      formData.get("cobrancaConsultaTipo") || "nenhuma"
    ) as "nenhuma" | "fixo" | "percentual";

    let cobrancaConsultaValorCentavos: number | undefined;
    let cobrancaConsultaPercentualBp: number | undefined;

    if (cobrancaConsultaTipo === "fixo") {
      const v = String(formData.get("cobrancaConsultaValor") || "0");
      cobrancaConsultaValorCentavos = lerMoeda(v) ?? undefined;
    } else if (cobrancaConsultaTipo === "percentual") {
      const p = Number(formData.get("cobrancaConsultaPercentual") || 0);
      cobrancaConsultaPercentualBp = Math.round(p * 100);
    }

    const gradeHorariosRaw = String(formData.get("gradeHorariosJson") || "[]");
    let gradeHorarios: ItemGrade[] = [];
    try {
      gradeHorarios = JSON.parse(gradeHorariosRaw);
    } catch {
      throw new Error("Grade de horários inválida");
    }

    const termosContrato = String(formData.get("termosContrato") || "");
    const observacoes = String(formData.get("observacoes") || "") || undefined;

    const res = await criarContrato(ctx, {
      profissionalId,
      salaId,
      dataInicio,
      dataFim,
      valorMensalCentavos,
      diaVencimento,
      cobrancaConsultaTipo,
      cobrancaConsultaValorCentavos,
      cobrancaConsultaPercentualBp,
      gradeHorarios,
      termosContrato,
      observacoes,
    });

    novoContratoId = res.id;
    return `Contrato ${res.codigo} ativado com sucesso! ${res.ocorrenciasCriadas} reservas foram geradas na agenda.`;
  });

  if (resultado.erro) {
    return resultado;
  }

  redirect(`/painel/contratos/${novoContratoId}`);
}

export async function encerrarContratoAcao(contratoId: string): Promise<EstadoAcao> {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const res = await encerrarContrato(ctx, contratoId);
    return `Contrato encerrado. ${res.reservasCanceladas} reserva(s) futuras foram desocupadas na agenda.`;
  });
}
