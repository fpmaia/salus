"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { exigirUsuario } from "@/src/auth/sessao";
import { usuarioTemEspacoBloqueado } from "@/src/server/memberships";
import { criarTenantComAdmin, ErroOnboarding } from "@/src/server/onboarding";

export type EstadoOnboarding = {
  erro: string | null;
  valores: { nomeTenant: string; documento: string };
};

export async function criarEspaco(
  _estado: EstadoOnboarding,
  formData: FormData,
): Promise<EstadoOnboarding> {
  const usuario = await exigirUsuario();
  const valores = {
    nomeTenant: String(formData.get("nomeTenant") ?? ""),
    documento: String(formData.get("documento") ?? ""),
  };
  if (await usuarioTemEspacoBloqueado(usuario.id)) redirect("/conta-suspensa");
  try {
    await criarTenantComAdmin(usuario.id, valores);
  } catch (erro) {
    if (erro instanceof ErroOnboarding) return { erro: erro.message, valores };
    if (erro instanceof ZodError) {
      return { erro: erro.issues[0]?.message ?? "Dados inválidos", valores };
    }
    throw erro;
  }
  redirect("/painel");
}
