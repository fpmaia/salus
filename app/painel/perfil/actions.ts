"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuth } from "@/src/auth/server";
import { obterContextoTenant } from "@/src/auth/sessao";
import type { EstadoAcao } from "@/src/server/acao";
import {
  atualizarDadosPessoais,
  atualizarDadosProfissionais,
} from "@/src/server/perfil";

export async function atualizarDadosPessoaisAcao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const ctx = await obterContextoTenant();
    const dados = {
      nome: String(formData.get("nome") || ""),
      telefone: String(formData.get("telefone") || ""),
    };
    await atualizarDadosPessoais(ctx, dados);
    revalidatePath("/painel/perfil");
    return { erro: null, sucesso: "Dados pessoais atualizados com sucesso!" };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao atualizar dados pessoais",
      sucesso: null,
    };
  }
}

export async function atualizarDadosProfissionaisAcao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const ctx = await obterContextoTenant();
    const dados = {
      conselho: String(formData.get("conselho") || ""),
      registro: String(formData.get("registro") || ""),
      especialidade: String(formData.get("especialidade") || ""),
      mensagemPublica: String(formData.get("mensagemPublica") || ""),
      duracaoConsultaMin: Number(formData.get("duracaoConsultaMin") || 60),
      agendamentoOnline: formData.get("agendamentoOnline") === "on",
      slugPublico: String(formData.get("slugPublico") || ""),
    };
    await atualizarDadosProfissionais(ctx, dados);
    revalidatePath("/painel/perfil");
    return { erro: null, sucesso: "Dados profissionais e agendamento online atualizados!" };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "Erro ao atualizar perfil profissional",
      sucesso: null,
    };
  }
}

export async function alterarSenhaAcao(
  _anterior: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  try {
    const currentPassword = String(formData.get("senhaAtual") || "");
    const newPassword = String(formData.get("novaSenha") || "");
    const confirmPassword = String(formData.get("confirmarSenha") || "");

    if (!currentPassword) return { erro: "Informe sua senha atual", sucesso: null };
    if (!newPassword || newPassword.length < 8) {
      return { erro: "A nova senha deve ter no mínimo 8 caracteres", sucesso: null };
    }
    if (newPassword !== confirmPassword) {
      return { erro: "A confirmação da nova senha não confere", sucesso: null };
    }

    const cabecalhos = await headers();
    await getAuth().api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      },
      headers: cabecalhos,
    });

    return { erro: null, sucesso: "Senha alterada com sucesso!" };
  } catch (erro) {
    return {
      erro:
        erro instanceof Error
          ? erro.message
          : "Erro ao alterar a senha. Verifique se a senha atual está correta.",
      sucesso: null,
    };
  }
}

export async function revogarSessaoAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const sessionId = String(formData.get("sessionId") || "");
  const ctx = await obterContextoTenant();
  const { revogarSessaoUsuario } = await import("@/src/server/perfil");
  await revogarSessaoUsuario(ctx.userId, sessionId);
  revalidatePath("/painel/perfil");
  return { sucesso: true, mensagem: "Sessão encerrada com sucesso." };
}

export async function revogarOutrasSessoesAcao() {
  const ctx = await obterContextoTenant();
  const { obterSessao } = await import("@/src/auth/sessao");
  const sessao = await obterSessao();
  if (sessao?.session?.token) {
    const { revogarOutrasSessoesUsuario } = await import("@/src/server/perfil");
    await revogarOutrasSessoesUsuario(ctx.userId, sessao.session.token);
  }
  revalidatePath("/painel/perfil");
  return { sucesso: true, mensagem: "Todas as outras sessões foram encerradas." };
}

