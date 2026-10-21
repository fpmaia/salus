"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { contaDemo, demoHabilitado, SENHA_DEMO } from "@/src/auth/demo";
import { getAuth } from "@/src/auth/server";

export async function loginDemoServerAcao(email: string) {
  if (!demoHabilitado()) return { erro: "Login de demonstração desativado neste ambiente." };
  if (!contaDemo(email)) return { erro: "Esta conta não é de demonstração." };

  try {
    await getAuth().api.signInEmail({ body: { email, password: SENHA_DEMO }, headers: await headers() });
  } catch (erro: unknown) {
    const mensagem = erro && typeof erro === "object" && "message" in erro ? String((erro as { message?: string }).message) : "";
    return { erro: mensagem || "Erro ao autenticar conta de teste" };
  }
  redirect("/painel");
}
