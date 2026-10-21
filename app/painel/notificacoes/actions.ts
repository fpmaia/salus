"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { mensagemDeErro } from "@/src/server/erros";
import { reenviarNotificacao } from "@/src/server/notificacoes";
import { conectarWhatsapp, desconectarWhatsapp, verificarConexaoWhatsapp } from "@/src/server/whatsapp";

export async function reenviarNotificacaoAcao(id: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await reenviarNotificacao(ctx, id);
    return "Recolocada na fila";
  });
}

type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: string };

/** Erros esperados viram mensagem para a tela; o resto sobe (Sentry). */
async function comMensagem<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (erro) {
    unstable_rethrow(erro);
    const mensagem = mensagemDeErro(erro);
    if (!mensagem) throw erro;
    return { ok: false, erro: mensagem };
  }
}

export async function conectarWhatsappAcao(aceitoRisco: boolean) {
  return comMensagem(async () => {
    const ctx = await obterContextoTenant();
    return conectarWhatsapp(ctx, { aceitoRisco });
  });
}

export async function verificarWhatsappAcao() {
  return comMensagem(async () => {
    const ctx = await obterContextoTenant();
    const status = await verificarConexaoWhatsapp(ctx);
    if (status === "conectado") revalidatePath("/painel/notificacoes");
    return { status };
  });
}

export async function desconectarWhatsappAcao() {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await desconectarWhatsapp(ctx);
    return "WhatsApp desconectado: os lembretes ficam na fila até conectar de novo";
  });
}
