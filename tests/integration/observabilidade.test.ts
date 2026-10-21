import { createHmac, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { opcoesAuth } from "../../src/auth/config";
import type { Database } from "../../src/db/client";
import { notificacoesOutbox, users } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { verificarAlertas } from "../../src/server/alertas";
import { definirProvedorEmail, EmailMemoria } from "../../src/server/email";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarDbApp, criarUsuario } from "./helpers";

let db: Database;

beforeAll(() => {
  db = criarDbApp();
});

afterAll(async () => {
  await db.$client.end();
});

describe("alertas da outbox", () => {
  let admin: ContextoTenant;
  const AGORA = new Date("2031-05-10T12:00:00Z");

  beforeAll(async () => {
    const adminId = await criarUsuario(db, "Admin Alertas");
    const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Alertas", documento: "11.222.333/0001-81" }, db);
    admin = { tenantId, userId: adminId, role: "admin" };
    await withTenant(
      admin,
      (tx) =>
        tx.insert(notificacoesOutbox).values([
          { tipo: "lembrete_agendamento", destinatario: "+5511900000001", status: "falhou", idempotencyKey: `f-${randomUUID()}`, agendarPara: AGORA },
          // Parada há 2 h: o worker ou o provedor de WhatsApp não está enviando.
          { tipo: "lembrete_agendamento", destinatario: "+5511900000002", status: "pendente", idempotencyKey: `p-${randomUUID()}`, agendarPara: new Date(AGORA.getTime() - 2 * 3600_000) },
        ]),
      db,
    );
    // Falhas contam nas últimas 24 h pela data de atualização.
    await withTenant(admin, (tx) => tx.update(notificacoesOutbox).set({ atualizadoEm: AGORA }).where(eq(notificacoesOutbox.status, "falhou")), db);
  });

  it("alerta falhas e fila parada, com e-mail no máximo uma vez por problema a cada 6 h", async () => {
    vi.stubEnv("ALERTAS_EMAIL", "ops@exemplo.com");
    const caixa = new EmailMemoria();
    try {
      const r = await verificarAlertas({ agora: AGORA, email: caixa, database: db });
      expect(r.espacosComFalha).toBeGreaterThanOrEqual(1);
      expect(r.espacosComAtraso).toBeGreaterThanOrEqual(1);
      const assuntos = caixa.enviados.map((m) => m.assunto);
      expect(assuntos.some((a) => a.includes("falharam"))).toBe(true);
      expect(assuntos.some((a) => a.includes("parados"))).toBe(true);
      // Sem dado pessoal no alerta: só ids e contagens.
      expect(caixa.enviados.map((m) => m.texto).join()).not.toContain("+55119");
      expect(caixa.enviados.map((m) => m.texto).join()).toContain(admin.tenantId);

      const enviados = caixa.enviados.length;
      await verificarAlertas({ agora: new Date(AGORA.getTime() + 15 * 60_000), email: caixa, database: db });
      expect(caixa.enviados.length).toBe(enviados);
      await verificarAlertas({ agora: new Date(AGORA.getTime() + 7 * 3600_000), email: caixa, database: db });
      expect(caixa.enviados.length).toBeGreaterThan(enviados);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos), como o app autenticador.
function base32(texto: string): Buffer {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of texto.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
function totp(segredo: string, instante = Date.now()): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(instante / 30_000)));
  const h = createHmac("sha1", base32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

describe("verificação em duas etapas", () => {
  const BASE = "http://localhost:3000";
  const auth = () => betterAuth({ ...opcoesAuth(db), baseURL: BASE, secret: "segredo-de-teste-com-mais-de-32-caracteres!" });
  const email = `dois.fatores.${randomUUID()}@teste.dev`;
  const senha = "senha-forte-123";

  function cookiesDe(resposta: Response): string {
    return resposta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  async function chamar(caminho: string, corpo: unknown, cookie = "") {
    return auth().handler(
      new Request(`${BASE}/api/auth${caminho}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie },
        body: JSON.stringify(corpo),
      }),
    );
  }

  beforeAll(async () => {
    definirProvedorEmail(new EmailMemoria());
    await auth().api.signUpEmail({ body: { name: "Admin 2FA", email, password: senha } });
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  });
  afterAll(() => definirProvedorEmail(undefined));

  it("ativa com o código do app, depois o login exige o código (ou um de recuperação)", async () => {
    const login = await chamar("/sign-in/email", { email, password: senha });
    const sessao = cookiesDe(login);

    const ativacao = await chamar("/two-factor/enable", { password: senha }, sessao);
    const { totpURI, backupCodes } = (await ativacao.json()) as { totpURI: string; backupCodes: string[] };
    const segredo = new URL(totpURI).searchParams.get("secret")!;
    expect(backupCodes).toHaveLength(10);
    expect((await chamar("/two-factor/verify-totp", { code: totp(segredo) }, sessao)).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u.twoFactorEnabled).toBe(true);

    // Senha certa não basta: vem o pedido do segundo fator, sem sessão.
    const segundoLogin = await chamar("/sign-in/email", { email, password: senha });
    expect(await segundoLogin.json()).toMatchObject({ twoFactorRedirect: true });
    const pendente = cookiesDe(segundoLogin);
    expect((await chamar("/two-factor/verify-totp", { code: "000000" }, pendente)).status).toBe(401);
    const ok = await chamar("/two-factor/verify-totp", { code: totp(segredo) }, pendente);
    expect(ok.status).toBe(200);
    expect(cookiesDe(ok)).toContain("session_token");

    // Código de recuperação vale uma vez.
    const terceiro = cookiesDe(await chamar("/sign-in/email", { email, password: senha }));
    expect((await chamar("/two-factor/verify-backup-code", { code: backupCodes[0] }, terceiro)).status).toBe(200);
    const quarto = cookiesDe(await chamar("/sign-in/email", { email, password: senha }));
    expect((await chamar("/two-factor/verify-backup-code", { code: backupCodes[0] }, quarto)).status).not.toBe(200);
  });
});
