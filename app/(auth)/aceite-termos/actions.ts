"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obterSessao } from "@/src/auth/sessao";
import { registrarAceite } from "@/src/server/aceites";
import { ipDoCliente } from "@/src/seguranca/ip";

export async function aceitarDocumentosAcao(formData: FormData) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  if (formData.get("aceite") !== "on") redirect("/aceite-termos?erro=1");
  const h = await headers();
  await registrarAceite(sessao.user.id, "reaceite", { ip: ipDoCliente(h), userAgent: h.get("user-agent") });
  redirect("/painel");
}
