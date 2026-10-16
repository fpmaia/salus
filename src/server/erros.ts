import { ZodError } from "zod";
import { ErroPermissao } from "../domain/rbac";
import { ErroReserva } from "../domain/reservas";

/** Erro de regra de negócio com mensagem pronta para o usuário. */
export class ErroNegocio extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroNegocio";
  }
}

/** Mensagem amigável para erros esperados; null para erros inesperados (que devem subir). */
export function mensagemDeErro(erro: unknown): string | null {
  if (erro instanceof ErroNegocio || erro instanceof ErroReserva) return erro.message;
  if (erro instanceof ErroPermissao) return "Você não tem permissão para esta ação";
  if (erro instanceof ZodError) return erro.issues[0]?.message ?? "Dados inválidos";
  return null;
}
