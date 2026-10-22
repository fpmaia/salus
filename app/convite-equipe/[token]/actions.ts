"use server";

import { redirect } from "next/navigation";
import { obterSessao } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { aceitarConviteMembro } from "@/src/server/equipe";

export async function aceitarConviteEquipeAcao(token: string) {
  let tenantIdRedirecionar: string | null = null;

  const resultado = await executarAcao(async () => {
    const sessao = await obterSessao();
    if (!sessao) throw new Error("Faça login para aceitar o convite.");

    const { tenantId } = await aceitarConviteMembro(sessao.user.id, token);
    tenantIdRedirecionar = tenantId;
    return "Convite aceito com sucesso!";
  }, { liberadaNaSuspensao: true });

  if (resultado.sucesso && tenantIdRedirecionar) {
    redirect("/painel");
  }

  return resultado;
}
