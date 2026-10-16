// Erros do Postgres embrulhados pelo Drizzle (o erro original fica em `cause`).

export type ErroPostgres = { code: string; constraint?: string; message: string };

export function erroPostgres(erro: unknown): ErroPostgres | undefined {
  let atual: unknown = erro;
  while (atual && typeof atual === "object") {
    if ("code" in atual && typeof atual.code === "string" && "severity" in atual) {
      const e = atual as { code: string; constraint?: string; message?: string };
      return { code: e.code, constraint: e.constraint, message: e.message ?? "" };
    }
    atual = "cause" in atual ? atual.cause : undefined;
  }
  return undefined;
}

export const PG = {
  violacaoUnica: "23505",
  violacaoExclusao: "23P01",
  violacaoFk: "23503",
  excecaoPlpgsql: "P0001",
} as const;
