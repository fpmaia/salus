import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ContextoTenant } from "../db/tenant";
import { listarMembershipsDoUsuario } from "../server/memberships";
import { getAuth } from "./server";

export const obterSessao = cache(async () => {
  // headers() antes de getAuth(): marca a rota como dinâmica antes de tocar no banco,
  // então o build não tenta pré-renderizá-la (e não exige DATABASE_URL).
  const cabecalhos = await headers();
  return getAuth().api.getSession({ headers: cabecalhos });
});

export async function exigirUsuario() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  return sessao.user;
}

export type ContextoUsuario = ContextoTenant & {
  tenantNome: string;
  usuario: { nome: string; email: string };
};

/** Usuário logado + tenant ativo (primeira membership). Sem tenant → onboarding. */
export const obterContextoTenant = cache(async (): Promise<ContextoUsuario> => {
  const usuario = await exigirUsuario();
  const [membership] = await listarMembershipsDoUsuario(usuario.id);
  if (!membership) redirect("/onboarding");
  return {
    tenantId: membership.tenantId,
    tenantNome: membership.tenantNome,
    userId: usuario.id,
    role: membership.role,
    usuario: { nome: usuario.name, email: usuario.email },
  };
});
