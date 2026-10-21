import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ContextoTenant } from "../db/tenant";
import { aceiteVigente } from "../server/aceites";
import { precisaConfigurar2FA, ROTA_CONFIGURAR_2FA } from "./dois-fatores";
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
  // Termos/Política em versão nova (ou nunca aceitos): aceite antes de seguir.
  if (!(await aceiteVigenteDoUsuario(sessao.user.id))) redirect("/aceite-termos");
  // Campo do plugin twoFactor (vem na sessão; o tipo inferido do Better Auth não o inclui).
  return sessao.user as typeof sessao.user & { twoFactorEnabled?: boolean | null };
}

const aceiteVigenteDoUsuario = cache((userId: string) => aceiteVigente(userId));

export type ContextoUsuario = ContextoTenant & {
  tenantNome: string;
  usuario: { nome: string; email: string };
  todasClinicas: Array<{ tenantId: string; tenantNome: string; role: ContextoTenant["role"] }>;
};

/** Usuário logado + tenant ativo (respeita cookie salus_tenant_id ou usa a primeira). Sem tenant → onboarding. */
export const obterContextoTenant = cache(async (): Promise<ContextoUsuario> => {
  const usuario = await exigirUsuario();
  const memberships = await listarMembershipsDoUsuario(usuario.id);
  if (memberships.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const tenantIdCookie = cookieStore.get("salus_tenant_id")?.value;
  const membership = (tenantIdCookie ? memberships.find((m) => m.tenantId === tenantIdCookie) : null) ?? memberships[0];
  // Quem administra o espaço precisa de 2FA (src/auth/dois-fatores.ts).
  if (precisaConfigurar2FA(usuario, membership.role === "admin")) redirect(`${ROTA_CONFIGURAR_2FA}?obrigatorio=1`);

  return {
    tenantId: membership.tenantId,
    tenantNome: membership.tenantNome,
    userId: usuario.id,
    role: membership.role,
    usuario: { nome: usuario.name, email: usuario.email },
    todasClinicas: memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantNome: m.tenantNome,
      role: m.role,
    })),
  };
});
