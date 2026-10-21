import { afterEach, describe, expect, it, vi } from "vitest";
import { errosDoAmbiente, validarAmbiente } from "./env";

const VALIDO = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "a".repeat(40),
  LINKS_SECRET: "b".repeat(40),
  SECRETS_KEY: Buffer.alloc(32, 1).toString("base64"),
  APP_URL: "https://app.exemplo.com",
  BETTER_AUTH_URL: "https://app.exemplo.com",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_teste",
  EMAIL_FROM: "Salus <nao-responda@exemplo.com>",
  TURNSTILE_SITE_KEY: "0x4AAA",
  TURNSTILE_SECRET_KEY: "0x4AAA-segredo",
  SALUS_EMPRESA_NOME: "Empresa Exemplo Ltda",
  SALUS_EMPRESA_CNPJ: "11.222.333/0001-81",
  SALUS_ENCARREGADO_EMAIL: "privacidade@exemplo.com",
  SENTRY_DSN: "https://chave@o0.ingest.sentry.io/0",
};

afterEach(() => vi.unstubAllEnvs());

function definir(valores: Record<string, string>) {
  for (const [k, v] of Object.entries({ ...VALIDO, ...valores })) vi.stubEnv(k, v);
}

describe("validação do ambiente", () => {
  it("aceita um ambiente completo", () => {
    definir({});
    expect(errosDoAmbiente("app")).toEqual([]);
  });

  it("acusa segredos ausentes (string vazia do compose conta como ausente), curtos ou repetidos", () => {
    definir({ LINKS_SECRET: "", SECRETS_KEY: "curta" });
    expect(errosDoAmbiente("worker")).toEqual(
      expect.arrayContaining(["LINKS_SECRET não definida", expect.stringContaining("SECRETS_KEY deve ter 32 bytes")]),
    );
    definir({ LINKS_SECRET: VALIDO.BETTER_AUTH_SECRET });
    expect(errosDoAmbiente("app")).toContain("BETTER_AUTH_SECRET, LINKS_SECRET e SECRETS_KEY devem ser diferentes");
  });

  it("exige provedor de e-mail real, salvo em ambiente de demonstração", () => {
    definir({ EMAIL_PROVIDER: "console" });
    expect(errosDoAmbiente("app")).toEqual([]); // dev: console é o padrão
    vi.stubEnv("NODE_ENV", "production");
    expect(errosDoAmbiente("app")).toEqual([expect.stringContaining("EMAIL_PROVIDER=console não envia")]);
    vi.stubEnv("SALUS_DEMO", "true");
    expect(errosDoAmbiente("app")).toEqual([]);
    definir({ RESEND_API_KEY: "" });
    expect(errosDoAmbiente("app")).toEqual(["RESEND_API_KEY não definida (EMAIL_PROVIDER=resend)"]);
  });

  it("em produção o app exige as chaves do Turnstile (o worker não usa)", () => {
    definir({ TURNSTILE_SECRET_KEY: "" });
    vi.stubEnv("NODE_ENV", "production");
    expect(errosDoAmbiente("app")).toEqual(["TURNSTILE_SECRET_KEY não definida (captcha das páginas públicas)"]);
    expect(errosDoAmbiente("worker")).toEqual([]);
  });

  it("em produção app e worker exigem o Sentry", () => {
    definir({ SENTRY_DSN: "" });
    vi.stubEnv("NODE_ENV", "production");
    expect(errosDoAmbiente("worker")).toEqual(["SENTRY_DSN não definida (monitoramento de erros e alertas)"]);
  });

  it("em produção o app exige a identificação da empresa e do encarregado", () => {
    definir({ SALUS_ENCARREGADO_EMAIL: "" });
    vi.stubEnv("NODE_ENV", "production");
    expect(errosDoAmbiente("app")).toEqual(["SALUS_ENCARREGADO_EMAIL não definida (documentos legais)"]);
  });

  it("em produção impede o boot; fora dela só avisa", () => {
    definir({ SECRETS_KEY: "" });
    vi.stubEnv("NODE_ENV", "production");
    expect(() => validarAmbiente("app")).toThrow("SECRETS_KEY não definida");
    vi.stubEnv("NODE_ENV", "development");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validarAmbiente("app")).not.toThrow();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
