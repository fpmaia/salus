import { beforeAll, describe, expect, it, vi } from "vitest";
import { cifrar, decifrar } from "./cripto";

beforeAll(() => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("cripto", () => {
  it("cifra e decifra", () => {
    const cifrado = cifrar("token-da-focus-123");
    expect(cifrado).not.toContain("token-da-focus");
    expect(decifrar(cifrado)).toBe("token-da-focus-123");
  });

  it("cada cifra usa um IV novo", () => {
    expect(cifrar("x")).not.toBe(cifrar("x"));
  });

  it("detecta adulteração", () => {
    const [v, iv, tag, dado] = cifrar("segredo").split(".");
    const adulterado = [v, iv, tag, Buffer.from("outro").toString("base64url") + dado.slice(7)].join(".");
    expect(() => decifrar(adulterado)).toThrow();
  });

  it("em produção não deriva a chave do BETTER_AUTH_SECRET", () => {
    vi.stubEnv("SECRETS_KEY", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => cifrar("x")).toThrow("Defina SECRETS_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
