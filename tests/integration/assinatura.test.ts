import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { faturasSaas, tenants } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import {
  avisarAtrasoDaAssinatura,
  espacoSuspensoPorAtraso,
  exigirAssinaturaEmDia,
  gerarFaturaDoMes,
  MENSAGEM_SUSPENSO,
  obterAssinatura,
  processarWebhookPlataforma,
  situacaoDaAssinaturaDoEspaco,
  sincronizarFaturas,
  trocarPlano,
} from "../../src/server/assinatura";
import { EmailMemoria } from "../../src/server/email";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarProfissional, criarProfissional } from "../../src/server/profissionais";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Cobrança do SaaS (conta Asaas da plataforma) e limites por plano.

const AGORA = new Date("2030-04-02T12:00:00Z");

let db: Database;
let admin: ContextoTenant;
let gateway: GatewayFalso;
const opcoes = () => ({ agora: AGORA, gateway, database: db });

beforeAll(async () => {
  process.env.ASAAS_WEBHOOK_TOKEN = "token-da-plataforma-de-teste";
  db = criarDbApp();
  gateway = new GatewayFalso();
  const adminId = await criarUsuario(db, "Admin Assinatura");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Plano", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
});

afterAll(async () => {
  await db?.$client.end();
});

describe("limites do plano", () => {
  it("o Básico permite 1 unidade; o upgrade libera a segunda", async () => {
    const { id: unidade } = await criarUnidade(admin, { nome: "Centro" }, db);
    await expect(criarUnidade(admin, { nome: "Norte" }, db)).rejects.toThrow("plano Básico permite até 1");
    await trocarPlano(admin, "pro", db);
    await criarUnidade(admin, { nome: "Norte" }, db);
    for (let i = 1; i <= 6; i++) await criarSala(admin, unidade, { nome: `Sala ${i}` }, db);
    expect((await obterAssinatura(admin, db)).uso).toEqual({ unidades: 2, salas: 6, profissionais: 0 });
  });

  it("downgrade é recusado quando o uso não cabe", async () => {
    await expect(trocarPlano(admin, "basico", db)).rejects.toThrow(/unidades, salas/);
  });

  it("reativar profissional conta no limite", async () => {
    const { id } = await criarProfissional(admin, { nome: "Inativo", email: `x.${randomUUID()}@teste.dev` }, db);
    await atualizarProfissional(admin, id, { nome: "Inativo", email: (await obterEmail(id))!, ativo: false }, db);
    await atualizarProfissional(admin, id, { nome: "Inativo", email: (await obterEmail(id))!, ativo: true }, db);
    expect((await obterAssinatura(admin, db)).uso.profissionais).toBe(1);
  });
});

describe("faturas do SaaS", () => {
  it("gera a fatura do mês uma única vez, pelo preço do plano, vencendo dia 10", async () => {
    expect((await gerarFaturaDoMes(admin.tenantId, opcoes())).criada).toBe(true);
    expect((await gerarFaturaDoMes(admin.tenantId, opcoes())).criada).toBe(false);
    const [fatura] = await withTenant(admin, (tx) => tx.select().from(faturasSaas), db);
    expect(fatura).toMatchObject({ competencia: "2030-04-01", valorCentavos: 49900, vencimento: "2030-04-10", status: "pendente", asaasPaymentId: "pay_1" });
    const [tenant] = await withTenant(admin, (tx) => tx.select().from(tenants), db);
    expect(tenant.asaasCustomerId).toBe("cus_1");
  });

  it("webhook da plataforma: token, referência e status consultado na API", async () => {
    const [fatura] = await withTenant(admin, (tx) => tx.select().from(faturasSaas), db);
    const payload = (id = randomUUID()) => ({ id, event: "PAYMENT_OVERDUE", payment: { id: "pay_1", externalReference: `saas:${admin.tenantId}:${fatura.id}` } });
    expect(await processarWebhookPlataforma("errado", payload(), opcoes())).toBe("nao_autorizado");
    expect(await processarWebhookPlataforma("token-da-plataforma-de-teste", { ...payload(), payment: { id: "pay_1", externalReference: "outra:coisa" } }, opcoes())).toBe("ignorado");

    gateway.definirStatus("pay_1", "OVERDUE");
    expect(await processarWebhookPlataforma("token-da-plataforma-de-teste", payload(), opcoes())).toBe("ok");
    expect(await situacaoDaAssinaturaDoEspaco(admin, AGORA, db)).toMatchObject({ estado: "atrasada", vencimento: "2030-04-10" });

    gateway.definirStatus("pay_1", "RECEIVED");
    const evento = randomUUID();
    expect(await processarWebhookPlataforma("token-da-plataforma-de-teste", payload(evento), opcoes())).toBe("ok");
    expect(await processarWebhookPlataforma("token-da-plataforma-de-teste", payload(evento), opcoes())).toBe("duplicado");
    const [paga] = await withTenant(admin, (tx) => tx.select().from(faturasSaas).where(eq(faturasSaas.id, fatura.id)), db);
    expect(paga.status).toBe("paga");
    expect(await situacaoDaAssinaturaDoEspaco(admin, AGORA, db)).toEqual({ estado: "em_dia" });
  });

  it("fatura gerada depois do dia 10 vence em 3 dias", async () => {
    const [{ tenantId }] = [await criarTenantComAdmin(await criarUsuario(db, "Admin Tarde"), { nomeTenant: "Tarde", documento: "529.982.247-25" }, db)];
    await gerarFaturaDoMes(tenantId, { ...opcoes(), agora: new Date("2030-04-20T12:00:00Z") });
    const ctx = { tenantId, userId: admin.userId, role: "admin" as const };
    const [f] = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
    expect(f.vencimento).toBe("2030-04-23");
  });

  it("falha no envio fica como erro e o job reenvia sem duplicar", async () => {
    gateway.perderResposta = 1;
    const maio = new Date("2030-05-02T12:00:00Z");
    expect(await gerarFaturaDoMes(admin.tenantId, { ...opcoes(), agora: maio })).toMatchObject({ criada: true, enviada: false });
    const total = gateway.cobrancas.size;
    await sincronizarFaturas(admin.tenantId, { ...opcoes(), agora: maio });
    expect(gateway.cobrancas.size).toBe(total);
    const faturas = await withTenant(admin, (tx) => tx.select().from(faturasSaas).where(eq(faturasSaas.competencia, "2030-05-01")), db);
    expect(faturas[0]).toMatchObject({ status: "pendente", asaasPaymentId: `pay_${total}` });
  });
});

describe("inadimplência: carência, aviso e suspensão", () => {
  const dia = (d: string) => new Date(`${d}T15:00:00Z`);
  let ctx: ContextoTenant;
  let adminEmail: string;

  beforeAll(async () => {
    const userId = await criarUsuario(db, "Admin Atrasado");
    const { tenantId } = await criarTenantComAdmin(userId, { nomeTenant: "Coworking Atrasado", documento: "45.723.174/0001-10" }, db);
    ctx = { tenantId, userId, role: "admin" };
    const { users } = await import("../../src/db/schema");
    adminEmail = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)))[0].email;
    await gerarFaturaDoMes(tenantId, { ...opcoes(), agora: dia("2030-06-02") }); // vence 10/06
  });

  it("em dia até o vencimento; depois, 15 dias de carência sem bloqueio", async () => {
    expect(await situacaoDaAssinaturaDoEspaco(ctx, dia("2030-06-10"), db)).toEqual({ estado: "em_dia" });
    expect(await situacaoDaAssinaturaDoEspaco(ctx, dia("2030-06-25"), db)).toMatchObject({ estado: "atrasada", suspensaoEm: "2030-06-26" });
    await exigirAssinaturaEmDia(ctx, dia("2030-06-25"), db);
    expect(await espacoSuspensoPorAtraso(ctx.tenantId, dia("2030-06-25"), db)).toBe(false);
  });

  it("e-mail aos admins 5 dias antes da suspensão, uma vez só", async () => {
    const email = new EmailMemoria();
    const avisar = (d: string) => avisarAtrasoDaAssinatura(ctx.tenantId, { agora: dia(d), provedor: email, database: db });
    expect(await avisar("2030-06-15")).toEqual({ aviso: "nenhum", emails: 0 });
    expect(await avisar("2030-06-21")).toEqual({ aviso: "suspensao_proxima", emails: 1 });
    expect(await avisar("2030-06-22")).toEqual({ aviso: "nenhum", emails: 0 });
    expect(email.ultimoPara(adminEmail)?.texto).toContain("Se não for paga até 26/06/2030");
  });

  it("no 16º dia o espaço fica só para consulta: mutações e agendamento online recusam", async () => {
    expect(await situacaoDaAssinaturaDoEspaco(ctx, dia("2030-06-26"), db)).toMatchObject({ estado: "suspensa", vencimento: "2030-06-10" });
    await expect(exigirAssinaturaEmDia(ctx, dia("2030-06-26"), db)).rejects.toThrow(MENSAGEM_SUSPENSO);
    expect(await espacoSuspensoPorAtraso(ctx.tenantId, dia("2030-06-26"), db)).toBe(true);
    // A consulta continua: a própria tela da assinatura abre.
    expect((await obterAssinatura(ctx, db)).faturas).toHaveLength(1);

    const email = new EmailMemoria();
    const avisar = () => avisarAtrasoDaAssinatura(ctx.tenantId, { agora: dia("2030-06-26"), provedor: email, database: db });
    expect(await avisar()).toEqual({ aviso: "suspensa", emails: 1 });
    expect(await avisar()).toEqual({ aviso: "nenhum", emails: 0 });
    expect(email.ultimoPara(adminEmail)?.assunto).toContain("só para consulta");
  });

  it("pago, volta sozinho", async () => {
    const [fatura] = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
    gateway.definirStatus(fatura.asaasPaymentId!, "RECEIVED");
    const payload = { id: randomUUID(), event: "PAYMENT_RECEIVED", payment: { id: fatura.asaasPaymentId!, externalReference: `saas:${ctx.tenantId}:${fatura.id}` } };
    expect(await processarWebhookPlataforma("token-da-plataforma-de-teste", payload, { ...opcoes(), agora: dia("2030-06-27") })).toBe("ok");
    expect(await situacaoDaAssinaturaDoEspaco(ctx, dia("2030-06-27"), db)).toEqual({ estado: "em_dia" });
    await exigirAssinaturaEmDia(ctx, dia("2030-06-27"), db);
  });
});

async function obterEmail(id: string) {
  const { profissionais } = await import("../../src/db/schema");
  const [p] = await withTenant(admin, (tx) => tx.select({ email: profissionais.email }).from(profissionais).where(eq(profissionais.id, id)), db);
  return p?.email;
}
