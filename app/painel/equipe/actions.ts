"use server";

import { revalidatePath } from "next/cache";
import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import {
  alterarPapelMembro,
  convidarMembro,
  desativarMembro,
  reativarMembro,
  revogarConvite,
} from "@/src/server/equipe";
import type { Role } from "@/src/domain/rbac";

export async function convidarMembroAction(
  _anterior: unknown,
  formData: FormData,
) {
  const ctx = await obterContextoTenant();
  const email = String(formData.get("email") || "");
  const role = String(formData.get("role") || "") as Role;
  const profissionalId = (formData.get("profissionalId") as string) || null;

  return executarAcao(async () => {
    const resultado = await convidarMembro(ctx, { email, role, profissionalId });
    revalidatePath("/painel/equipe");
    return {
      erro: null,
      sucesso: `Convite enviado com sucesso para ${email}!`,
      dados: { link: resultado.link },
    };
  });
}

export async function alterarPapelAction(
  _anterior: unknown,
  formData: FormData,
) {
  const ctx = await obterContextoTenant();
  const membershipId = String(formData.get("membershipId") || "");
  const novoRole = String(formData.get("novoRole") || "") as Role;

  return executarAcao(async () => {
    await alterarPapelMembro(ctx, membershipId, novoRole);
    revalidatePath("/painel/equipe");
    return "Papel do membro alterado com sucesso.";
  });
}

export async function desativarMembroAction(
  _anterior: unknown,
  formData: FormData,
) {
  const ctx = await obterContextoTenant();
  const membershipId = String(formData.get("membershipId") || "");

  return executarAcao(async () => {
    await desativarMembro(ctx, membershipId);
    revalidatePath("/painel/equipe");
    return "Membro desativado do espaço.";
  });
}

export async function reativarMembroAction(
  _anterior: unknown,
  formData: FormData,
) {
  const ctx = await obterContextoTenant();
  const membershipId = String(formData.get("membershipId") || "");

  return executarAcao(async () => {
    await reativarMembro(ctx, membershipId);
    revalidatePath("/painel/equipe");
    return "Membro reativado com sucesso.";
  });
}

export async function revogarConviteAction(
  _anterior: unknown,
  formData: FormData,
) {
  const ctx = await obterContextoTenant();
  const conviteId = String(formData.get("conviteId") || "");

  return executarAcao(async () => {
    await revogarConvite(ctx, conviteId);
    revalidatePath("/painel/equipe");
    return "Convite revogado.";
  });
}
