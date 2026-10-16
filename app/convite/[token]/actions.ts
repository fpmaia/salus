"use server";

import { redirect } from "next/navigation";
import { exigirUsuario } from "@/src/auth/sessao";
import type { EstadoAcao } from "@/src/server/acao";
import { mensagemDeErro } from "@/src/server/erros";
import { aceitarConvite } from "@/src/server/profissionais";

export async function aceitarConviteAcao(token: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  try {
    await aceitarConvite(usuario.id, token);
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };
    throw erro;
  }
  redirect("/painel");
}
