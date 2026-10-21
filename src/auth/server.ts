import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/client";
import { opcoesAuth } from "./config";

function criarAuth() {
  const opcoes = opcoesAuth(getDb());
  // Mantém os plugins da config (admin, twoFactor, captcha) e põe o nextCookies por último,
  // como ele exige. Sobrescrever a lista desligaria esses plugins no app.
  return betterAuth({ ...opcoes, plugins: [...opcoes.plugins, nextCookies()] });
}

const globalParaAuth = globalThis as unknown as { salusAuth?: ReturnType<typeof criarAuth> };

/** Instância criada sob demanda para que o build não exija env de banco/segredo. */
export function getAuth() {
  globalParaAuth.salusAuth ??= criarAuth();
  return globalParaAuth.salusAuth;
}
