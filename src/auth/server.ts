import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/client";
import { opcoesAuth } from "./config";

function criarAuth() {
  // nextCookies deve ser o último plugin.
  return betterAuth({ ...opcoesAuth(getDb()), plugins: [nextCookies()] });
}

const globalParaAuth = globalThis as unknown as { salusAuth?: ReturnType<typeof criarAuth> };

/** Instância criada sob demanda para que o build não exija env de banco/segredo. */
export function getAuth() {
  globalParaAuth.salusAuth ??= criarAuth();
  return globalParaAuth.salusAuth;
}
