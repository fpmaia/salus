import { afterEach, describe, expect, it, vi } from "vitest";
import { errosDoAmbiente, validarAmbiente } from "./env";

const VALIDO = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "a".repeat(40),
  LINKS_SECRET: "b".repeat(40),
  SECRETS_KEY: Buffer.alloc(32, 1).toString("base64"),
  APP_URL: "https://app.exemplo.com",
  BETTER_AUTH_URL: "https://app.exemplo.com",
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
