import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { opcoesAuth } from "../../src/auth/config";
import type { Database } from "../../src/db/client";
import { definirProvedorEmail, EmailMemoria } from "../../src/server/email";
import { criarDbApp } from "./helpers";

// Fluxos de conta com o Better Auth de verdade: confirmação obrigatória do e-mail e
// redefinição de senha, com o e-mail capturado em memória.

const BASE = "http://localhost:3000";
let db: Database;
let auth: ReturnType<typeof criarAuth>;
const caixa = new EmailMemoria();

function criarAuth(database: Database) {
  return betterAuth({ ...opcoesAuth(database), baseURL: BASE, secret: "segredo-de-teste-com-mais-de-32-caracteres!" });
}

function linkDe(texto: string): URL {
  const achado = texto.match(/https?:\/\/\S+/);
  if (!achado) throw new Error(`sem link no e-mail:\n${texto}`);
  return new URL(achado[0]);
}

beforeAll(() => {
  db = criarDbApp();
  auth = criarAuth(db);
  definirProvedorEmail(caixa);
});

afterAll(async () => {
  definirProvedorEmail(undefined);
  await db.$client.end();
});

describe("conta por e-mail", () => {
  const email = `ana.${randomUUID()}@teste.dev`;
  const senha = "senha-inicial-123";

  it("cadastro envia a confirmação e não abre sessão até confirmar", async () => {
    const cadastro = await auth.api.signUpEmail({ body: { name: "Ana", email, password: senha, callbackURL: "/onboarding" } });
    expect(cadastro.token).toBeNull();

    const mensagem = caixa.ultimoPara(email);
    expect(mensagem?.assunto).toBe("Confirme seu e-mail no Salus");
    expect(linkDe(mensagem!.texto).pathname).toBe("/api/auth/verify-email");

    await expect(auth.api.signInEmail({ body: { email, password: senha } })).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });
  });

  it("depois de confirmar, entra normalmente", async () => {
    const token = linkDe(caixa.ultimoPara(email)!.texto).searchParams.get("token")!;
    await auth.api.verifyEmail({ query: { token } });
    const sessao = await auth.api.signInEmail({ body: { email, password: senha } });
    expect(sessao.token).toBeTruthy();
  });

  it("redefinição de senha chega por e-mail e o token não vai para o log", async () => {
    const log = vi.spyOn(console, "log");
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${BASE}/redefinir-senha` } });
    const mensagem = caixa.ultimoPara(email)!;
    expect(mensagem.assunto).toBe("Redefinição de senha do Salus");
    const token = linkDe(mensagem.texto).pathname.split("/").pop()!;
    expect(log.mock.calls.flat().join(" ")).not.toContain(token);
    log.mockRestore();

    await auth.api.resetPassword({ body: { token, newPassword: "senha-nova-456" } });
    await expect(auth.api.signInEmail({ body: { email, password: senha } })).rejects.toThrow();
    expect((await auth.api.signInEmail({ body: { email, password: "senha-nova-456" } })).token).toBeTruthy();
  });
});
