"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import type { EstadoAcao } from "@/src/server/acao";
import { mensagemDeErro } from "@/src/server/erros";
import { LIMITES, limitarTaxa } from "@/src/server/limite-taxa";
import { ipDoCliente } from "@/src/seguranca/ip";
import { acaoDoPaciente, type AcaoDoPaciente } from "@/src/server/notificacoes";

// Ação pública (sem login): a autorização é o token assinado do link.
export async function acaoDoPacienteAcao(token: string, acao: AcaoDoPaciente): Promise<EstadoAcao> {
  try {
    await limitarTaxa(`link-paciente:ip:${ipDoCliente(await headers()) ?? "desconhecido"}`, LIMITES.linkPacientePorIp);
    const { mensagem } = await acaoDoPaciente(token, acao);
    refresh();
    return { erro: null, sucesso: mensagem };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };
    throw erro;
  }
}
