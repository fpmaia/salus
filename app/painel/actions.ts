"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/src/auth/sessao";
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
