import { describe, expect, it, vi } from "vitest";

describe("instância do Better Auth do app", () => {
  it("carrega todos os plugins da config, com o nextCookies por último", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://ninguem@127.0.0.1:1/nada"); // o pool não conecta só por existir
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo");
    vi.resetModules();
    const { getAuth } = await import("./server");
    const ids = getAuth().options.plugins.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["admin", "two-factor", "captcha"]));
    expect(ids.at(-1)).toBe("next-cookies");
    vi.unstubAllEnvs();
  });
});
