"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterContextoTenant } from "@/src/auth/sessao";
import { lerMoeda, lerPercentualBp } from "@/src/domain/dinheiro";
import type { ItemGrade } from "@/src/domain/contratos";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import { criarContrato, editarContrato, encerrarContrato, type GradeContrato } from "@/src/server/contratos";
import { ErroNegocio } from "@/src/server/erros";

const moeda = (formData: FormData, campo: string) => {
  const v = textoOuUndefined(formData, campo);
  return v ? lerMoeda(v) : null;
};
const pct = (formData: FormData, campo: string) => {
  const v = textoOuUndefined(formData, campo);
  return v ? lerPercentualBp(v) : null;
};

/** Grade do formulário: "manter" (reajuste), "remover", "trocar"/"criar" (com sala e horários). */
function gradeDoFormulario(formData: FormData): GradeContrato | null | undefined {
  const acao = texto(formData, "gradeAcao") || "nenhuma";
  if (acao === "manter") return undefined;
  if (acao === "remover" || acao === "nenhuma") return acao === "remover" ? null : undefined;
  let itens: ItemGrade[];
  try {
    itens = JSON.parse(texto(formData, "gradeHorariosJson") || "[]");
  } catch {
    throw new ErroNegocio("Grade de horários inválida");
  }
  return { salaId: texto(formData, "gradeSalaId"), itens };
}

export async function criarContratoAcao(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  let destino: string | null = null;
  const resultado = await executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const modelo = texto(formData, "modelo") as "hora" | "consulta" | "percentual" | "mensalidade";
    const variante = texto(formData, "varianteMensalidade"); // pacote | turno
    const porAtendimento = texto(formData, "cobrancaPorAtendimento"); // nenhuma | consulta | percentual
    const prazo = textoOuUndefined(formData, "prazoCancelamentoHoras");
    const r = await criarContrato(
      ctx,
      {
        profissionalId: texto(formData, "profissionalId"),
        modelo,
        fluxoRecebimento: texto(formData, "fluxoRecebimento") === "centralizado" ? "centralizado" : "direto",
        valorHoraCentavos: moeda(formData, modelo === "mensalidade" ? "valorHoraExtra" : "valorHora"),
        valorConsultaCentavos:
          modelo === "consulta" ? moeda(formData, "valorConsulta") : porAtendimento === "consulta" ? moeda(formData, "valorPorAtendimento") : null,
        percentualBp: modelo === "percentual" ? pct(formData, "percentual") : porAtendimento === "percentual" ? pct(formData, "percentualPorAtendimento") : null,
        mensalidadeCentavos: modelo === "mensalidade" ? moeda(formData, "mensalidade") : null,
        horasIncluidas: modelo === "mensalidade" && variante === "pacote" ? Number(texto(formData, "horasIncluidas") || 0) : null,
        regraFalta: (texto(formData, "regraFalta") || "isenta") as "isenta" | "integral" | "percentual",
        faltaPercentualBp: pct(formData, "faltaPercentual"),
        prazoCancelamentoHoras: prazo ? Number(prazo) : null,
        multaCancelamentoReservaBp: modelo === "hora" ? pct(formData, "multaTurnoFixo") : null,
        termos: textoOuUndefined(formData, "termos") ?? null,
        observacoes: textoOuUndefined(formData, "observacoes") ?? null,
        vigenteDe: texto(formData, "vigenteDe"),
        vigenteAte: textoOuUndefined(formData, "vigenteAte") ?? null,
      },
      { grade: gradeDoFormulario(formData) },
    );
    const q = new URLSearchParams({ criado: "1" });
    if (r.reservasCriadas) q.set("reservas", String(r.reservasCriadas));
    if (r.datasEmConflito.length) q.set("conflitos", r.datasEmConflito.join(","));
    destino = `/painel/contratos/${r.id}?${q.toString()}`;
    return `Contrato ${r.codigo} criado`;
  });
  if (destino && resultado.sucesso) redirect(destino);
  return resultado;
}

export async function editarContratoAcao(contratoId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const prazo = textoOuUndefined(formData, "prazoCancelamentoHoras");
    await editarContrato(ctx, contratoId, {
      valorHoraCentavos: moeda(formData, "valorHoraCentavos"),
      valorConsultaCentavos: moeda(formData, "valorConsultaCentavos"),
      percentualBp: pct(formData, "percentualBp"),
      mensalidadeCentavos: moeda(formData, "mensalidadeCentavos"),
      horasIncluidas: textoOuUndefined(formData, "horasIncluidas") ? Number(texto(formData, "horasIncluidas")) : null,
      regraFalta: (textoOuUndefined(formData, "regraFalta") || "isenta") as "isenta" | "integral" | "percentual",
      faltaPercentualBp: pct(formData, "faltaPercentualBp"),
      prazoCancelamentoHoras: prazo ? Number(prazo) : undefined,
      multaCancelamentoReservaBp: pct(formData, "multaCancelamentoReservaBp"),
      termos: textoOuUndefined(formData, "termos") ?? null,
      observacoes: textoOuUndefined(formData, "observacoes") ?? null,
      vigenteAte: textoOuUndefined(formData, "vigenteAte") ?? null,
    });
    revalidatePath("/painel/contratos");
    revalidatePath(`/painel/contratos/${contratoId}`);
    return "Contrato atualizado com sucesso";
  });
}

export async function encerrarContratoAcao(contratoId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const r = await encerrarContrato(ctx, contratoId, texto(formData, "ultimoDia"));
    revalidatePath("/painel/contratos");
    revalidatePath(`/painel/contratos/${contratoId}`);
    return r.reservasComPacientes
      ? `Contrato encerrado. ${r.reservasLiberadas} data(s) da grade liberada(s); ${r.reservasComPacientes} com pacientes continuam até os atendimentos serem resolvidos.`
      : `Contrato encerrado. ${r.reservasLiberadas} data(s) da grade liberada(s).`;
  });
}
