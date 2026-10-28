"use server";

import { redirect } from "next/navigation";
import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import { mensagemDeErro } from "@/src/server/erros";
import {
  compartilharProntuario,
  criarAdendo,
  descartarRascunho,
  finalizarRegistro,
  revogarCompartilhamento,
  salvarRascunho,
  solicitarProntuario,
} from "@/src/server/prontuario";

export async function salvarRascunhoAcao(pacienteId: string, registroId: string | undefined, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await salvarRascunho(ctx, {
      registroId,
      pacienteId,
      agendamentoId: textoOuUndefined(formData, "agendamentoId") ?? null,
      anotacoes: texto(formData, "anotacoes"),
      prescricao: texto(formData, "prescricao"),
    });
    return "Rascunho salvo";
  });
}

export async function finalizarRegistroAcao(registroId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await finalizarRegistro(ctx, registroId);
    return "Registro finalizado";
  });
}

export async function descartarRascunhoAcao(registroId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await descartarRascunho(ctx, registroId);
    return "Rascunho descartado";
  });
}

export async function criarAdendoAcao(registroId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await criarAdendo(ctx, registroId, { anotacoes: texto(formData, "anotacoes"), prescricao: texto(formData, "prescricao") });
    return "Adendo criado como rascunho: revise e finalize";
  });
}

export async function compartilharAcao(pacienteId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    if (formData.get("confirmo") !== "on") return { erro: "Confirme que o paciente consentiu", sucesso: null };
    await compartilharProntuario(ctx, {
      pacienteId,
      paraProfissionalId: texto(formData, "paraProfissionalId"),
      consentimento: texto(formData, "consentimento"),
    });
    return "Compartilhado";
  });
}

export async function revogarAcao(compartilhamentoId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await revogarCompartilhamento(ctx, compartilhamentoId);
    return "Compartilhamento revogado";
  });
}

export async function solicitarProntuarioAcao(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await obterContextoTenant();
  let id: string;
  try {
    ({ solicitacaoId: id } = await solicitarProntuario(ctx, {
      profissionalId: texto(formData, "profissionalId"),
      pacienteId: texto(formData, "pacienteId"),
      justificativa: texto(formData, "justificativa"),
    }));
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };
    throw erro;
  }
  redirect(`/painel/prontuario/solicitacao/${id}`);
}

export async function ativarMeuProntuarioTrialAcao(profissionalId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { ativarLicencaProntuario } = await import("@/src/server/assinatura");
    await ativarLicencaProntuario(ctx, profissionalId);
    return "Prontuário ativado: 15 dias grátis na primeira ativação.";
  });
}

export async function gerarCobrancaProntuarioAcao(profissionalId?: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { gerarCobrancaProntuarioProfissional } = await import("@/src/server/assinatura");
    const { invoiceUrl } = await gerarCobrancaProntuarioProfissional(ctx, profissionalId);
    return invoiceUrl
      ? "Cobrança gerada: pague por Pix ou cartão no link e depois toque em \"Já paguei\"."
      : "Cobrança gerada.";
  }, { liberadaNaSuspensao: true });
}

export async function confirmarPagamentoProntuarioAcao(profissionalId?: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { confirmarPagamentoProntuario } = await import("@/src/server/assinatura");
    const resultado = await confirmarPagamentoProntuario(ctx, profissionalId);
    if (!resultado.confirmado) {
      return { erro: resultado.mensagem, sucesso: null };
    }
    return resultado.mensagem;
  }, { liberadaNaSuspensao: true });
}

