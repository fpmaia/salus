import { randomUUID } from "node:crypto";
import { createDb, type Database } from "../../src/db/client";
import { users } from "../../src/db/schema";
import { TEST_DATABASE_URL } from "./env";

/** Conexão com o papel da aplicação (salus_app), exatamente como o app em produção. */
export function criarDbApp(): Database {
  // max: 1 força todas as queries na mesma conexão (útil para provar que o SET LOCAL não vaza).
  return createDb(TEST_DATABASE_URL, { max: 1 });
}

export async function criarUsuario(db: Database, nome: string): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ name: nome, email: `${nome.toLowerCase().replace(/\W+/g, ".")}.${randomUUID()}@teste.dev` })
    .returning({ id: users.id });
  return usuario.id;
}

/** Código SQLSTATE do erro do Postgres (o Drizzle embrulha o erro original em `cause`). */
export function codigoPg(erro: unknown): string | undefined {
  let atual: unknown = erro;
  while (atual && typeof atual === "object") {
    if ("code" in atual && typeof atual.code === "string") return atual.code;
    atual = "cause" in atual ? atual.cause : undefined;
  }
  return undefined;
}

export async function capturarErro(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error("Era esperado um erro, mas a operação foi concluída");
}

// SQLSTATE 42501 = insufficient_privilege (violação de RLS ou falta de GRANT).
export const SEM_PRIVILEGIO = "42501";
