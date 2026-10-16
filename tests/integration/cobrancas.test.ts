import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { cobrancasProfissional, memberships, pagamentos, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import {
  cancelarCobranca,
  criarCobrancaProfissional,
  gerarTokenWebhook,
  listarCobrancas,
  processarWebhookTenant,
  reenviarCobranca,
  salvarConfigCobranca,
  simularPagamento,
  sincronizarCobrancas,
  type FabricaGateway,
} from "../../src/server/cobrancas";
import { extrato, lancarAjuste } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Cobrança do profissional via Asaas (conta do espaço): emissão, webhook com consulta
// à API, baixa automática idempotente no ledger e estorno.

const AGORA = new Date("2030-04-02T12:00:00Z");

let db: Database;
let admin: ContextoTenant;
let anaCtx: ContextoTenant;
let ana: string;
let beto: string;
let gateway: GatewayFalso;
let tokenWebhook: string;
const fabrica: FabricaGateway = () => gateway;
const opcoes = () => ({ agora: AGORA, fabrica, database: db });

async function cobranca(id: string) {
  const [c] = await withTenant(admin, (tx) => tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, id)), db);
  return c;
}

async function webhook(paymentId: string, eventoId = randomUUID(), token = tokenWebhook) {
  return processarWebhookTenant(admin.tenantId, token, { id: eventoId, event: "PAYMENT_RECEIVED", payment: { id: paymentId } }, opcoes());
}

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 5).toString("base64");
  db = criarDbApp();
  gateway = new GatewayFalso();
  const adminId = await criarUsuario(db, "Admin Cobranca");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Cobra", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev`, documento: "529.982.247-25" }, db));
  ({ id: beto } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db));
  const anaUser = await criarUsuario(db, "Ana Cobranca");
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId: anaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, ana));
    },
    db,
  );
  anaCtx = { tenantId, userId: anaUser, role: "profissional" };
  // Ana deve R$ 150 ao espaço.
  await lancarAjuste(admin, { profissionalId: ana, data: "2030-04-01", natureza: "debito", valorCentavos: 15000, descricao: "Locação de março" }, db);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("configuração", () => {
  it("exige a chave para ativar fora do simulado e gera o token do webhook", async () => {
    const base = { ativo: true, ambiente: "sandbox" as const, diasVencimento: 5, multaBp: 200, jurosMesBp: 100 };
    await expect(salvarConfigCobranca(admin, base, db)).rejects.toThrow("chave de API");
    await salvarConfigCobranca(admin, { ...base, apiKey: "$aact_hmlg_teste" }, db);
    const { url, token } = await gerarTokenWebhook(admin, db);
    expect(url).toMatch(new RegExp(`/api/webhooks/asaas/${admin.tenantId}$`));
    tokenWebhook = token;
  });
});

describe("cobrança e baixa automática", () => {
  let primeira: string;

  it("cria o cliente uma vez e a cobrança com vencimento padrão", async () => {
    const c = await criarCobrancaProfissional(admin, { profissionalId: ana, valorCentavos: 15000, forma: "PIX" }, opcoes());
    primeira = c.id;
    expect(c).toMatchObject({ status: "pendente", asaasPaymentId: "pay_1", vencimento: "2030-04-07", invoiceUrl: "https://sandbox.asaas.com/i/pay_1" });
    await criarCobrancaProfissional(admin, { profissionalId: ana, valorCentavos: 1000, forma: "BOLETO" }, opcoes());
    expect(gateway.clientes).toHaveLength(1);
  });

  it("exige CPF/CNPJ do profissional", async () => {
    await expect(criarCobrancaProfissional(admin, { profissionalId: beto, valorCentavos: 1000 }, opcoes())).rejects.toThrow("CPF ou CNPJ");
  });

  it("webhook com token errado é recusado", async () => {
    expect(await webhook("pay_1", randomUUID(), "token-errado")).toBe("nao_autorizado");
  });

  it("o status vem da API, não do payload: ainda pendente no Asaas, nada muda", async () => {
    expect(await webhook("pay_1")).toBe("ok");
    expect((await cobranca(primeira)).status).toBe("pendente");
  });

  it("pagamento confirmado gera a baixa no ledger uma única vez", async () => {
    gateway.definirStatus("pay_1", "RECEIVED", "PIX");
    const eventoId = randomUUID();
    expect(await webhook("pay_1", eventoId)).toBe("ok");
    expect(await webhook("pay_1", eventoId)).toBe("duplicado");
    expect(await webhook("pay_1")).toBe("ok"); // outro evento do mesmo pagamento
    await sincronizarCobrancas(admin.tenantId, opcoes());

    const c = await cobranca(primeira);
    expect(c.status).toBe("paga");
    const baixas = await withTenant(admin, (tx) => tx.select().from(pagamentos).where(eq(pagamentos.profissionalId, ana)), db);
    expect(baixas).toHaveLength(1);
    expect(baixas[0]).toMatchObject({ valorCentavos: 15000, forma: "pix", direcao: "profissional_para_espaco" });
    expect((await extrato(admin, { profissionalId: ana, competencia: "2030-04" }, db)).saldoFinal).toBe(0);
  });

  it("webhook atrasado de 'pendente' não desfaz o pagamento", async () => {
    gateway.definirStatus("pay_1", "PENDING");
    await webhook("pay_1");
    expect((await cobranca(primeira)).status).toBe("paga");
  });

  it("estorno no Asaas estorna a baixa no ledger", async () => {
    gateway.definirStatus("pay_1", "REFUNDED");
    await webhook("pay_1");
    expect((await cobranca(primeira)).status).toBe("estornada");
    expect((await extrato(admin, { profissionalId: ana, competencia: "2030-04" }, db)).saldoFinal).toBe(15000);
    await webhook("pay_1"); // repetido: não estorna duas vezes
    expect((await extrato(admin, { profissionalId: ana, competencia: "2030-04" }, db)).saldoFinal).toBe(15000);
  });

  it("resposta perdida na criação: o reenvio adota a cobrança existente (sem duplicar)", async () => {
    gateway.perderResposta = 1;
    const c = await criarCobrancaProfissional(admin, { profissionalId: ana, valorCentavos: 15000 }, opcoes());
    expect(c.status).toBe("erro");
    const total = gateway.cobrancas.size;
    const reenviada = await reenviarCobranca(admin, c.id, opcoes());
    expect(reenviada.status).toBe("pendente");
    expect(gateway.cobrancas.size).toBe(total);
    expect(reenviada.asaasPaymentId).toBe(`pay_${total}`);
  });

  it("cancelar remove no Asaas", async () => {
    const c = await criarCobrancaProfissional(admin, { profissionalId: ana, valorCentavos: 500 }, opcoes());
    await cancelarCobranca(admin, c.id, opcoes());
    expect((await cobranca(c.id)).status).toBe("cancelada");
    expect(gateway.cobrancas.get(c.asaasPaymentId!)?.removida).toBe(true);
  });

  it("profissional vê só as próprias cobranças", async () => {
    const lista = await listarCobrancas(anaCtx, beto, db);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((c) => c.profissionalId === ana)).toBe(true);
  });
});

describe("ambiente simulado", () => {
  it("permite simular o pagamento", async () => {
    await salvarConfigCobranca(admin, { ativo: true, ambiente: "simulado", diasVencimento: 3, multaBp: null, jurosMesBp: null }, db);
    const c = await criarCobrancaProfissional(admin, { profissionalId: ana, valorCentavos: 15000 }, { agora: AGORA, database: db });
    expect(c.ambiente).toBe("simulado");
    await simularPagamento(admin, c.id, AGORA, db);
    expect((await cobranca(c.id)).status).toBe("paga");
    expect((await extrato(admin, { profissionalId: ana, competencia: "2030-04" }, db)).saldoFinal).toBe(0);
  });
});
