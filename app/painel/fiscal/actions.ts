"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { lerPercentualBp } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import { cancelarNota, emitirNota, emitirNotasDoMes, salvarConfiguracaoFiscal } from "@/src/server/fiscal";

const ROTULO_STATUS: Record<string, string> = {
  pendente: "aguardando envio (nova tentativa automática)",
  processando: "em processamento na prefeitura/Receita",
  autorizada: "autorizada",
  erro: "recusada",
};

export async function salvarConfiguracaoFiscalAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const aliquota = texto(formData, "aliquota").trim();
    const regimeSn = texto(formData, "regimeSimples");
    const aliquotaBp = aliquota ? lerPercentualBp(aliquota) : null;
    if (aliquota && aliquotaBp === null) throw new ErroNegocio("Alíquota inválida");
    await salvarConfiguracaoFiscal(ctx, {
      ativo: formData.get("ativo") === "on",
      ambiente: texto(formData, "ambiente") as never,
      token: texto(formData, "token"),
      inscricaoMunicipal: texto(formData, "inscricaoMunicipal"),
      codigoMunicipio: texto(formData, "codigoMunicipio"),
      opcaoSimplesNacional: Number(texto(formData, "opcaoSimples")),
      regimeTributarioSimplesNacional: regimeSn ? Number(regimeSn) : null,
      regimeEspecialTributacao: Number(texto(formData, "regimeEspecial") || 0),
      codigoTributacaoNacional: texto(formData, "codigoTributacao"),
      codigoNbs: texto(formData, "codigoNbs"),
      aliquotaIssBp: aliquotaBp,
      descricaoServico: texto(formData, "descricaoServico"),
      serieDps: Number(texto(formData, "serieDps") || 1),
    });
    return "Configuração salva";
  });
}

export async function emitirNotaAcao(profissionalId: string, competencia: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { status } = await emitirNota(ctx, profissionalId, competencia);
    return `Nota ${ROTULO_STATUS[status] ?? status}`;
  });
}

export async function emitirNotasDoMesAcao(competencia: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const resultado = await emitirNotasDoMes(ctx, competencia);
    if (resultado.length === 0) return "Nenhuma nota a emitir";
    const ok = resultado.filter((r) => r.ok).length;
    const problemas = resultado.filter((r) => !r.ok).map((r) => `${r.nome}: ${r.mensagem}`);
    return [`${ok} nota(s) enviada(s)`, ...problemas].join(" · ");
  });
}

export async function cancelarNotaAcao(notaId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await cancelarNota(ctx, notaId, texto(formData, "justificativa"));
    return "Nota cancelada";
  });
}
