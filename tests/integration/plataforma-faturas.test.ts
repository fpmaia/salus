import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { auditLog, faturasSaas, faturasSaasItens, planosSaas, users } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { gerarFaturaDoMes, processarWebhookPlataforma, situacaoDaAssinaturaDoEspaco } from "../../src/server/assinatura";
import { definirPapelPlataforma } from "../../src/server/equipe-plataforma";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { alterarPlanoClinicaPlataforma, listarAuditoriaPlataforma } from "../../src/server/plataforma";
import {
  ajustarValorFatura,
  alterarVencimentoFatura,
  cancelarFaturaClinica,
  criarFaturaAvulsa,
  darBaixaManualFatura,
  reenviarFaturaClinica,
} from "../../src/server/plataforma-faturas";
import { criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Operações da equipe Salus numa fatura em aberto: o Asaas muda primeiro, o banco depois, e
// cada operação fica na auditoria da plataforma e do espaço.

let db: Database;
let dono: string;
let financeiro: string;
let suporte: string;
let planoPro: string;
const gateway = new GatewayFalso("opf_");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daquiA = (dias: number) => new Date(Date.parse(`${hoje()}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

async function clinicaComFatura(nome: string, agora = new Date("2027-01-02T15:00:00Z")) {
  const admin = await criarUsuario(db, `Admin ${nome}`);
  const { tenantId } = await criarTenantComAdmin(admin, { nomeTenant: nome, documento: "11.222.333/0001-81" }, db);
  await alterarPlanoClinicaPlataforma(dono, tenantId, planoPro, db);
  await gerarFaturaDoMes(tenantId, { agora, gateway, database: db });
  const ctx = { tenantId, userId: admin, role: "admin" as const };
  const [fatura] = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
  return { tenantId, ctx, fatura };
}

async function faturaAtual(ctx: { tenantId: string; userId: string; role: "admin" }, id: string) {
  const [f] = await withTenant(ctx, (tx) => tx.select().from(faturasSaas).where(eq(faturasSaas.id, id)), db);
  return f;
}

beforeAll(async () => {
  db = criarDbApp();
  dono = await criarUsuario(db, "Dono Operacoes Fatura");
  financeiro = await criarUsuario(db, "Financeiro Operacoes Fatura");
  suporte = await criarUsuario(db, "Suporte Operacoes Fatura");
  for (const id of [dono, financeiro, suporte]) await db.update(users).set({ role: "superadmin" }).where(eq(users.id, id));
  await definirPapelPlataforma(dono, financeiro, "financeiro", db);
  await definirPapelPlataforma(dono, suporte, "suporte", db);
  [{ id: planoPro }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "pro"));
  process.env.ASAAS_WEBHOOK_TOKEN = "token-operacoes-fatura";
});

afterAll(async () => {
  await db?.$client.end();
});

describe("operações na fatura pela equipe Salus", () => {
  it("novo vencimento tira a clínica do atraso e vai ao Asaas", async () => {
    const { tenantId, ctx, fatura } = await clinicaComFatura("Clínica Vencimento");
    const depoisDaCarencia = new Date("2027-01-30T15:00:00Z");
    expect((await situacaoDaAssinaturaDoEspaco(ctx, depoisDaCarencia, db)).estado).toBe("suspensa");

    await expect(alterarVencimentoFatura(suporte, tenantId, fatura.id, { vencimento: "2027-02-15", motivo: "pedido" }, { gateway, database: db })).rejects.toThrow(
      "não permite",
    );
    await expect(alterarVencimentoFatura(financeiro, tenantId, fatura.id, { vencimento: daquiA(-1), motivo: "ontem" }, { gateway, database: db })).rejects.toThrow(
      "passado",
    );
    await alterarVencimentoFatura(financeiro, tenantId, fatura.id, { vencimento: "2027-02-15", motivo: "pedido da clínica" }, { gateway, database: db });

    expect(gateway.atualizacoes).toContainEqual({ id: fatura.asaasPaymentId, vencimento: "2027-02-15" });
    expect(await faturaAtual(ctx, fatura.id)).toMatchObject({ vencimento: "2027-02-15", status: "pendente", observacao: "pedido da clínica" });
    expect((await situacaoDaAssinaturaDoEspaco(ctx, depoisDaCarencia, db)).estado).toBe("em_dia");
    const doEspaco = await withTenant(ctx, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "assinatura.fatura_vencimento")), db);
    expect(doEspaco).toHaveLength(1);
  });

  it("desconto pontual muda o valor no Asaas; zerar deixa a fatura isenta e cancela a cobrança", async () => {
    const { tenantId, ctx, fatura } = await clinicaComFatura("Clínica Ajuste");
    await ajustarValorFatura(financeiro, tenantId, fatura.id, { valorCentavos: -9900, descricao: "Desconto comercial", motivo: "negociação" }, { gateway, database: db });
    expect(gateway.cobrancas.get(fatura.asaasPaymentId!)?.valor).toBe(40000);
    expect((await faturaAtual(ctx, fatura.id)).valorCentavos).toBe(40000);
    await expect(
      ajustarValorFatura(financeiro, tenantId, fatura.id, { valorCentavos: -50000, descricao: "Demais", motivo: "teste" }, { gateway, database: db }),
    ).rejects.toThrow("negativa");

    await ajustarValorFatura(financeiro, tenantId, fatura.id, { valorCentavos: -40000, descricao: "Cortesia", motivo: "falha nossa" }, { gateway, database: db });
    expect(await faturaAtual(ctx, fatura.id)).toMatchObject({ valorCentavos: 0, status: "paga", formaBaixa: "isenta" });
    expect(gateway.cobrancas.get(fatura.asaasPaymentId!)?.removida).toBe(true);
    const itens = await withTenant(ctx, (tx) => tx.select().from(faturasSaasItens).where(eq(faturasSaasItens.faturaId, fatura.id)), db);
    expect(itens.filter((i) => i.tipo === "ajuste").map((i) => i.valorTotalCentavos)).toEqual([-9900, -40000]);
    await expect(alterarVencimentoFatura(financeiro, tenantId, fatura.id, { vencimento: daquiA(5), motivo: "depois" }, { gateway, database: db })).rejects.toThrow(
      "não está mais em aberto",
    );
  });

  it("cancelar tira do Asaas e não volta com o webhook", async () => {
    const { tenantId, ctx, fatura } = await clinicaComFatura("Clínica Cancelada");
    await cancelarFaturaClinica(financeiro, tenantId, fatura.id, "cobrança indevida", { gateway, database: db });
    expect(gateway.cobrancas.get(fatura.asaasPaymentId!)?.removida).toBe(true);
    expect((await faturaAtual(ctx, fatura.id)).status).toBe("cancelada");
    const auditoria = await listarAuditoriaPlataforma(dono, 10, db, { acao: "plataforma.fatura.cancelada", alvoId: tenantId });
    expect(auditoria[0]?.dados).toMatchObject({ motivo: "cobrança indevida", faturaId: fatura.id });
  });

  it("baixa manual: paga fora do Asaas; pagamento posterior no Asaas fica registrado como divergência", async () => {
    const { tenantId, ctx, fatura } = await clinicaComFatura("Clínica Baixa Manual");
    await expect(darBaixaManualFatura(financeiro, tenantId, fatura.id, { pagoEm: daquiA(2), observacao: "PIX direto" }, { gateway, database: db })).rejects.toThrow(
      "futuro",
    );
    await darBaixaManualFatura(financeiro, tenantId, fatura.id, { pagoEm: hoje(), observacao: "PIX direto na conta" }, { gateway, database: db });
    expect(await faturaAtual(ctx, fatura.id)).toMatchObject({ status: "paga", formaBaixa: "manual", observacao: "PIX direto na conta" });
    expect(gateway.cobrancas.get(fatura.asaasPaymentId!)?.removida).toBe(true);

    // A clínica pagou o boleto mesmo assim: o webhook não muda a fatura, mas deixa rastro.
    gateway.cobrancas.get(fatura.asaasPaymentId!)!.removida = false;
    gateway.definirStatus(fatura.asaasPaymentId!, "RECEIVED");
    const r = await processarWebhookPlataforma(
      "token-operacoes-fatura",
      { id: "evt_divergente", event: "PAYMENT_RECEIVED", payment: { id: fatura.asaasPaymentId!, externalReference: `saas:${tenantId}:${fatura.id}` } },
      { gateway, database: db },
    );
    expect(r).toBe("ok");
    expect((await faturaAtual(ctx, fatura.id)).formaBaixa).toBe("manual");
    const divergencias = await withTenant(ctx, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "assinatura.pagamento_divergente")), db);
    expect(divergencias).toHaveLength(1);
  });

  it("fatura avulsa vai ao Asaas e não ocupa a competência da mensal", async () => {
    const { tenantId, ctx } = await clinicaComFatura("Clínica Avulsa");
    const r = await criarFaturaAvulsa(
      financeiro,
      tenantId,
      {
        itens: [
          { descricao: "Implantação", valorCentavos: 30000 },
          { descricao: "Treinamento", valorCentavos: 15000 },
        ],
        vencimento: "2027-01-20",
        observacao: "Implantação Salus",
      },
      { gateway, database: db },
    );
    expect(r.enviada).toBe(true);
    const faturas = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
    const avulsa = faturas.find((f) => f.id === r.faturaId)!;
    expect(avulsa).toMatchObject({ tipo: "avulsa", valorCentavos: 45000, competencia: "2027-01-01", vencimento: "2027-01-20" });
    expect(faturas.filter((f) => f.competencia === "2027-01-01")).toHaveLength(2);
    expect(gateway.cobrancas.get(avulsa.asaasPaymentId!)?.valor).toBe(45000);
  });

  it("reenviar: com erro de envio volta ao Asaas; em aberto vai por e-mail aos administradores", async () => {
    const { tenantId, ctx, fatura } = await clinicaComFatura("Clínica Reenvio");
    const enviados: string[] = [];
    const provedor = { enviar: async (m: { para: string }) => void enviados.push(m.para) };
    const r = await reenviarFaturaClinica(financeiro, tenantId, fatura.id, { gateway, database: db, provedor: provedor as never });
    expect(r).toEqual({ modo: "email", enviados: 1 });
    expect(enviados).toHaveLength(1);

    await withTenant(ctx, (tx) => tx.update(faturasSaas).set({ status: "erro", asaasPaymentId: null }).where(eq(faturasSaas.id, fatura.id)), db);
    gateway.cobrancas.delete(fatura.asaasPaymentId!);
    expect((await reenviarFaturaClinica(financeiro, tenantId, fatura.id, { gateway, database: db })).modo).toBe("asaas");
    expect((await faturaAtual(ctx, fatura.id)).status).toBe("pendente");
  });
});
