import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { acordosSaas, faturasSaas, planosSaas, users } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { simularAcordo } from "../../src/domain/acordos";
import { gerarFaturaDoMes, situacaoDaAssinaturaDoEspaco } from "../../src/server/assinatura";
import { definirPapelPlataforma } from "../../src/server/equipe-plataforma";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { alterarPlanoClinicaPlataforma } from "../../src/server/plataforma";
import { acordosDoEspaco, cancelarAcordo, criarAcordo } from "../../src/server/plataforma-acordos";
import { darBaixaManualFatura } from "../../src/server/plataforma-faturas";
import { criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Renegociação: faturas em aberto viram parcelas (com desconto), a clínica sai do atraso, e o
// acordo quita sozinho quando todas as parcelas são pagas.

let db: Database;
let dono: string;
let financeiro: string;
let suporte: string;
let planoPro: string;
const gateway = new GatewayFalso("aco_");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function clinicaComDuasFaturas(nome: string) {
  const admin = await criarUsuario(db, `Admin ${nome}`);
  const { tenantId } = await criarTenantComAdmin(admin, { nomeTenant: nome, documento: "11.222.333/0001-81" }, db);
  await alterarPlanoClinicaPlataforma(dono, tenantId, planoPro, db);
  await gerarFaturaDoMes(tenantId, { agora: new Date("2026-07-02T15:00:00Z"), gateway, database: db });
  await gerarFaturaDoMes(tenantId, { agora: new Date("2026-08-02T15:00:00Z"), gateway, database: db });
  const ctx = { tenantId, userId: admin, role: "admin" as const };
  const faturas = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
  return { tenantId, ctx, faturas };
}

beforeAll(async () => {
  db = criarDbApp();
  dono = await criarUsuario(db, "Dono Acordos");
  financeiro = await criarUsuario(db, "Financeiro Acordos");
  suporte = await criarUsuario(db, "Suporte Acordos");
  for (const id of [dono, financeiro, suporte]) await db.update(users).set({ role: "superadmin" }).where(eq(users.id, id));
  await definirPapelPlataforma(dono, financeiro, "financeiro", db);
  await definirPapelPlataforma(dono, suporte, "suporte", db);
  [{ id: planoPro }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "pro"));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("acordo de renegociação", () => {
  it("duas faturas vencidas viram 3 parcelas com 10% de desconto; a clínica sai da suspensão", async () => {
    const { tenantId, ctx, faturas } = await clinicaComDuasFaturas("Clínica Renegociada");
    expect((await situacaoDaAssinaturaDoEspaco(ctx, new Date(), db)).estado).toBe("suspensa");
    const total = faturas.reduce((t, f) => t + f.valorCentavos, 0);
    const desconto = Math.round(total * 0.1);
    const { parcelas } = simularAcordo({ valorOriginalCentavos: total, descontoCentavos: desconto, parcelas: 3, primeiroVencimento: hoje() });

    await expect(
      criarAcordo(suporte, tenantId, { faturasIds: faturas.map((f) => f.id), descontoCentavos: desconto, parcelas, motivo: "pedido" }, { gateway, database: db }),
    ).rejects.toThrow("não permite");
    await expect(
      criarAcordo(
        financeiro,
        tenantId,
        { faturasIds: faturas.map((f) => f.id), descontoCentavos: desconto, parcelas: parcelas.map((p, i) => (i === 0 ? { ...p, valorCentavos: p.valorCentavos - 1 } : p)), motivo: "pedido" },
        { gateway, database: db },
      ),
    ).rejects.toThrow("soma");

    const r = await criarAcordo(
      financeiro,
      tenantId,
      { faturasIds: faturas.map((f) => f.id), descontoCentavos: desconto, parcelas, motivo: "dificuldade no caixa" },
      { gateway, database: db },
    );
    expect(r.parcelasEnviadas).toBe(3);

    const depois = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
    expect(depois.filter((f) => f.substituidaPorAcordoId === r.acordoId).every((f) => f.status === "cancelada")).toBe(true);
    for (const f of faturas) expect(gateway.cobrancas.get(f.asaasPaymentId!)?.removida).toBe(true);
    const novas = depois.filter((f) => f.acordoId === r.acordoId).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    expect(novas.map((f) => [f.tipo, f.valorCentavos, f.vencimento])).toEqual(parcelas.map((p) => ["parcela_acordo", p.valorCentavos, p.vencimento]));
    expect((await situacaoDaAssinaturaDoEspaco(ctx, new Date(), db)).estado).toBe("em_dia");

    const [acordo] = await acordosDoEspaco(ctx, db);
    expect(acordo).toMatchObject({ status: "ativo", valorOriginalCentavos: total, descontoCentavos: desconto, parcelas: 3 });
    expect(acordo.parcelasFaturas).toHaveLength(3);
    expect(acordo.originais).toHaveLength(2);

    // Pagas as três (duas por baixa manual, uma pelo Asaas), o acordo quita sozinho.
    await darBaixaManualFatura(financeiro, tenantId, novas[0].id, { pagoEm: hoje(), observacao: "PIX direto" }, { gateway, database: db });
    await darBaixaManualFatura(financeiro, tenantId, novas[1].id, { pagoEm: hoje(), observacao: "PIX direto" }, { gateway, database: db });
    expect((await withTenant(ctx, (tx) => tx.select().from(acordosSaas), db))[0].status).toBe("ativo");
    await darBaixaManualFatura(financeiro, tenantId, novas[2].id, { pagoEm: hoje(), observacao: "PIX direto" }, { gateway, database: db });
    expect((await withTenant(ctx, (tx) => tx.select().from(acordosSaas), db))[0]).toMatchObject({ status: "quitado" });
  });

  it("uma fatura não entra em dois acordos; cancelar o acordo cancela as parcelas em aberto", async () => {
    const { tenantId, ctx, faturas } = await clinicaComDuasFaturas("Clínica Acordo Cancelado");
    const total = faturas[0].valorCentavos;
    const r = await criarAcordo(
      financeiro,
      tenantId,
      { faturasIds: [faturas[0].id], descontoCentavos: 0, parcelas: simularAcordo({ valorOriginalCentavos: total, descontoCentavos: 0, parcelas: 2, primeiroVencimento: hoje() }).parcelas, motivo: "teste" },
      { gateway, database: db },
    );
    await expect(
      criarAcordo(financeiro, tenantId, { faturasIds: [faturas[0].id], descontoCentavos: 0, parcelas: [{ valorCentavos: total, vencimento: hoje() }], motivo: "de novo" }, { gateway, database: db }),
    ).rejects.toThrow("ainda em aberto");

    await cancelarAcordo(financeiro, tenantId, r.acordoId, "clínica desistiu", { gateway, database: db });
    const parcelas = (await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db)).filter((f) => f.acordoId === r.acordoId);
    expect(parcelas.every((f) => f.status === "cancelada")).toBe(true);
    expect((await acordosDoEspaco(ctx, db)).find((a) => a.id === r.acordoId)?.status).toBe("cancelado");
    await expect(cancelarAcordo(financeiro, tenantId, r.acordoId, "de novo", { gateway, database: db })).rejects.toThrow("não está mais ativo");
  });
});
