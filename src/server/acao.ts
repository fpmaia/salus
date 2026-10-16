import { revalidatePath } from "next/cache";
import { mensagemDeErro } from "./erros";

/** Estado devolvido pelas Server Actions de formulário (useActionState). */
export type EstadoAcao = { erro: string | null; sucesso: string | null; dados?: Record<string, string> };

export const ESTADO_INICIAL: EstadoAcao = { erro: null, sucesso: null };

/**
 * Executa a mutação, converte erros esperados em mensagem e revalida o painel.
 * Erros inesperados sobem (error boundary do Next.js).
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
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };
    throw erro;
  }
}

export function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export function textoOuUndefined(formData: FormData, campo: string): string | undefined {
  return texto(formData, campo).trim() || undefined;
}
