import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { faturasSaas, planosSaas, sessions, users } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { gerarFaturaDoMes } from "../../src/server/assinatura";
import { definirPapelPlataforma } from "../../src/server/equipe-plataforma";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { alterarPlanoClinicaPlataforma, reativarClinicaPlataforma, suspenderClinicaPlataforma } from "../../src/server/plataforma";
import {
  cancelarContaClinica,
  criarNotaClinica,
  encerrarSessoesUsuario,
  historicoDaClinica,
  listarNotasClinica,
  motivoDoBloqueio,
  previaPorPlano,
} from "../../src/server/plataforma-clinica";
import { salvarCondicoesComerciais } from "../../src/server/plataforma-financeiro";
import { alertasPlataforma, obterPainelFinanceiro } from "../../src/server/plataforma-painel";
import { criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Gestão da conta da clínica e painel financeiro da plataforma.

let db: Database;
let dono: string;
let financeiro: string;
let suporte: string;
let planoPro: string;
const gateway = new GatewayFalso("cta_");

async function novaClinica(nome: string) {
  const admin = await criarUsuario(db, `Admin ${nome}`);
  const { tenantId } = await criarTenantComAdmin(admin, { nomeTenant: nome, documento: "11.222.333/0001-81" }, db);
  await alterarPlanoClinicaPlataforma(dono, tenantId, planoPro, db);
  return { tenantId, admin, ctx: { tenantId, userId: admin, role: "admin" as const } };
}

beforeAll(async () => {
  db = criarDbApp();
  dono = await criarUsuario(db, "Dono Conta Clinica");
  financeiro = await criarUsuario(db, "Financeiro Conta Clinica");
  suporte = await criarUsuario(db, "Suporte Conta Clinica");
  for (const id of [dono, financeiro, suporte]) await db.update(users).set({ role: "superadmin" }).where(eq(users.id, id));
  await definirPapelPlataforma(dono, financeiro, "financeiro", db);
  await definirPapelPlataforma(dono, suporte, "suporte", db);
  [{ id: planoPro }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "pro"));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("conta da clínica", () => {
  it("suspensão mostra o motivo para a equipe da clínica; reativar limpa", async () => {
    const { tenantId, admin } = await novaClinica("Clínica Suspensa Motivo");
    await suspenderClinicaPlataforma(suporte, tenantId, "Contrato pendente de assinatura", db);
    expect(await motivoDoBloqueio(admin, db)).toEqual({ status: "suspenso", motivo: "Contrato pendente de assinatura" });
    await reativarClinicaPlataforma(suporte, tenantId, db);
    expect(await motivoDoBloqueio(admin, db)).toBeNull();
  });

  it("só o Dono cancela; exige o nome; cancela as faturas em aberto (Asaas também); só o Dono reabre", async () => {
    const { tenantId, ctx, admin } = await novaClinica("Clínica Que Sai");
    await gerarFaturaDoMes(tenantId, { agora: new Date("2027-01-02T15:00:00Z"), gateway, database: db });
    const [fatura] = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);

    await expect(cancelarContaClinica(financeiro, tenantId, { confirmacao: "Clínica Que Sai", motivo: "pediu" }, { gateway, database: db })).rejects.toThrow("não permite");
    await expect(cancelarContaClinica(dono, tenantId, { confirmacao: "Outra", motivo: "pediu" }, { gateway, database: db })).rejects.toThrow("Digite o nome");
    expect(await cancelarContaClinica(dono, tenantId, { confirmacao: "clínica que sai", motivo: "pediu para sair" }, { gateway, database: db })).toEqual({ faturasCanceladas: 1 });

    expect(gateway.cobrancas.get(fatura.asaasPaymentId!)?.removida).toBe(true);
    expect(await motivoDoBloqueio(admin, db)).toEqual({ status: "cancelado", motivo: "pediu para sair" });
    await expect(reativarClinicaPlataforma(suporte, tenantId, db)).rejects.toThrow();
    await reativarClinicaPlataforma(dono, tenantId, db);
    expect(await motivoDoBloqueio(admin, db)).toBeNull();
  });

  it("notas internas, encerrar sessões e histórico", async () => {
    const { tenantId, admin } = await novaClinica("Clínica Notas");
    await criarNotaClinica(financeiro, tenantId, "Ligou pedindo vencimento dia 20", db);
    expect((await listarNotasClinica(suporte, tenantId, db))[0]).toMatchObject({ texto: "Ligou pedindo vencimento dia 20", autorNome: "Financeiro Conta Clinica" });

    await db.insert(sessions).values({ userId: admin, token: `tok-${tenantId}`, expiresAt: new Date(Date.now() + 86_400_000) });
    await expect(encerrarSessoesUsuario(financeiro, admin, db)).rejects.toThrow("não permite");
    expect(await encerrarSessoesUsuario(suporte, admin, db)).toBe(1);

    await suspenderClinicaPlataforma(suporte, tenantId, "teste", db);
    const historico = await historicoDaClinica(financeiro, tenantId, 50, db);
    expect(historico.map((e) => [e.origem, e.acao])).toEqual(expect.arrayContaining([["plataforma", "clinica.suspensa"], ["espaco", "tenant.criado"]]));
  });

  it("prévia por plano usa uso e condições da clínica", async () => {
    const { tenantId } = await novaClinica("Clínica Prévia Plano");
    await salvarCondicoesComerciais(financeiro, tenantId, {
      precoMensalCentavos: 10000,
      precoSalaExtraCentavos: null,
      precoProfissionalExtraCentavos: null,
      precoUnidadeExtraCentavos: null,
      precoProntuarioCentavos: null,
      diaVencimento: null,
      diasCarencia: null,
    }, db);
    const previas = await previaPorPlano(suporte, tenantId, new Date(), db);
    expect(previas.length).toBeGreaterThan(1);
    expect(previas.every((p) => p.valorCentavos === 10000)).toBe(true);
  });
});

describe("painel financeiro da plataforma", () => {
  it("MRR pela fatura estimada, inadimplência e clínicas em atraso; alertas de teste terminando", async () => {
    const { tenantId } = await novaClinica("Clínica Painel Atrasada");
    await gerarFaturaDoMes(tenantId, { agora: new Date("2026-08-02T15:00:00Z"), gateway, database: db });
    const painel = await obterPainelFinanceiro(suporte, { busca: "Painel Atrasada" }, new Date(), db);
    expect(painel.mrrCentavos).toBeGreaterThan(0);
    expect(painel.resumo.emAtrasoCentavos).toBeGreaterThan(0);
    expect(painel.pertoDaSuspensao.find((c) => c.tenantId === tenantId)?.estado).toBe("suspensa");
    expect(painel.faturas.every((f) => f.tenantNome === "Clínica Painel Atrasada")).toBe(true);

    const alertas = await alertasPlataforma(suporte, new Date(), db);
    expect(Array.isArray(alertas.testesTerminando)).toBe(true);
  });
});
