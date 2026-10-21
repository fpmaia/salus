import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { opcoesAuth } from "../../src/auth/config";
import type { Database } from "../../src/db/client";
import { rateLimits } from "../../src/db/schema";
import { consumirLimite, limitarTaxa, limparLimitesAntigos } from "../../src/server/limite-taxa";
import { criarDbApp } from "./helpers";

let db: Database;

beforeAll(() => {
  db = criarDbApp();
});

afterAll(async () => {
  await db.$client.end();
});

describe("rate limit das páginas públicas", () => {
  const regra = { janelaSegundos: 60, max: 3 };

  it("conta por chave dentro da janela e recomeça na seguinte", async () => {
    const chave = `teste:${randomUUID()}`;
    const t0 = 1_900_000_000_000;
    const resultados = [];
    for (let i = 0; i < 4; i++) resultados.push(await consumirLimite(chave, regra, t0 + i * 1000, db));
    expect(resultados).toEqual([true, true, true, false]);
    // Outra chave não é afetada; passada a janela, volta a aceitar.
    expect(await consumirLimite(`${chave}:outra`, regra, t0, db)).toBe(true);
    expect(await consumirLimite(chave, regra, t0 + 61_000, db)).toBe(true);
    await expect(limitarTaxa(chave, { janelaSegundos: 60, max: 1 }, t0 + 62_000, db)).rejects.toThrow("Muitas tentativas");
  });

  it("limpeza apaga só contadores parados há mais de 1 dia", async () => {
    const velha = `teste:velha:${randomUUID()}`;
    const nova = `teste:nova:${randomUUID()}`;
    const agora = 1_900_100_000_000;
    await consumirLimite(velha, regra, agora - 2 * 86_400_000, db);
    await consumirLimite(nova, regra, agora, db);
    await limparLimitesAntigos(agora, db);
    const restantes = (await db.select({ key: rateLimits.key }).from(rateLimits).where(like(rateLimits.key, "salus:teste:%"))).map((r) => r.key);
    expect(restantes).toContain(`salus:${nova}`);
    expect(restantes).not.toContain(`salus:${velha}`);
  });
});

describe("rate limit do Better Auth no Postgres", () => {
  it("bloqueia o 6º login no minuto para o mesmo IP e guarda o contador na tabela", async () => {
    const opcoes = opcoesAuth(db);
    const auth = betterAuth({
      ...opcoes,
      baseURL: "http://localhost:3000",
      secret: "segredo-de-teste-com-mais-de-32-caracteres!",
      rateLimit: { ...opcoes.rateLimit, enabled: true },
    });
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const tentar = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": ip, origin: "http://localhost:3000" },
          body: JSON.stringify({ email: `ninguem.${randomUUID()}@teste.dev`, password: "senha-errada-123" }),
        }),
      );
    const status = [];
    for (let i = 0; i < 6; i++) status.push((await tentar()).status);
    expect(status.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(status[5]).toBe(429);
    const linhas = await db.select().from(rateLimits).where(like(rateLimits.key, `${ip}%`));
    expect(linhas.length).toBeGreaterThan(0);
    await db.delete(rateLimits).where(eq(rateLimits.id, linhas[0].id));
  });
});
