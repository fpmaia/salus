import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { reportarErro } from "../observabilidade/monitoramento";
import { mensagemDeErro } from "./erros";

/** Estado devolvido pelas Server Actions de formulário (useActionState). */
export type EstadoAcao = { erro: string | null; sucesso: string | null; dados?: Record<string, string> };

export const ESTADO_INICIAL: EstadoAcao = { erro: null, sucesso: null };

/**
 * Executa a mutação, converte erros esperados em mensagem e revalida o painel.
 * Erros inesperados viram uma mensagem genérica com código (detalhe só no log do servidor).
 */
export async function executarAcao(
  fn: () => Promise<string | EstadoAcao | void>,
): Promise<EstadoAcao> {
  try {
    const resultado = await fn();
    revalidatePath("/painel", "layout");
    if (resultado && typeof resultado === "object") return resultado;
    return { erro: null, sucesso: resultado ?? "Salvo" };
  } catch (erro) {
    // redirect()/notFound() dentro da ação são controle de fluxo do Next, não erro.
    unstable_rethrow(erro);
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };

    // Erro inesperado: gera correlation ID, loga detalhadamente no servidor e oculta SQL do browser
    const erroId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    reportarErro(erro, "erro inesperado numa ação", { extra: { erroId } });
    return {
      erro: `Ocorreu um erro interno ao processar a operação (${erroId}). Tente novamente ou informe o suporte.`,
      sucesso: null,
    };
  }
}

export function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export function textoOuUndefined(formData: FormData, campo: string): string | undefined {
  return texto(formData, campo).trim() || undefined;
}

/** Decisão sobre as reservas já marcadas (feriado/desativação): vazio = mostrar a lista. */
export function decisaoReservas(formData: FormData): "manter" | "cancelar" | undefined {
  const valor = texto(formData, "decisaoReservas");
  return valor === "manter" || valor === "cancelar" ? valor : undefined;
}

/** Complemento da mensagem de sucesso quando reservas foram canceladas. */
export function sufixoCanceladas(canceladas: number): string {
  return canceladas ? ` ${canceladas} reserva(s) cancelada(s), com aviso por WhatsApp a quem aceita receber.` : "";
}
