"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exigirUsuario, obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { resolverDataNaoReservada } from "@/src/server/datas-nao-reservadas";
import { listarMembershipsDoUsuario } from "@/src/server/memberships";

export async function alternarClinicaAcao(novoTenantId: string) {
  const usuario = await exigirUsuario();
  const memberships = await listarMembershipsDoUsuario(usuario.id);

  const pertence = memberships.some((m) => m.tenantId === novoTenantId);
  if (!pertence) {
    throw new Error("Você não possui acesso a esta clínica.");
  }

  const cookieStore = await cookies();
  cookieStore.set("salus_tenant_id", novoTenantId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 ano
    sameSite: "lax",
    httpOnly: true,
  });

  redirect("/painel");
}

export async function resolverDataNaoReservadaAcao(id: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await resolverDataNaoReservada(ctx, id);
    return "Pendência resolvida";
  });
}
