import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { faturasSaasItens, planosSaas } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { PLANOS_PUBLICOS } from "../../src/domain/planos";
import { gerarFaturaDoMes, obterAssinatura, trocarPlano } from "../../src/server/assinatura";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { atualizarUnidade, criarSala, criarUnidade, listarUnidades } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Matriz de planos: o que a landing/manual prometem bate com o banco; limites que bloqueiam
// (unidade no Básico) x limites que viram excedente (salas, profissionais, unidade no Pro+).

let db: Database;

async function novoEspaco(nome: string): Promise<ContextoTenant> {
  const adminId = await criarUsuario(db, `Admin ${nome}`);
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: nome, documento: "11.222.333/0001-81" }, db);
  return { tenantId, userId: adminId, role: "admin" };
}

async function itensDaFatura(ctx: ContextoTenant) {
  const itens = await withTenant(ctx, (tx) => tx.select().from(faturasSaasItens), db);
  return itens.sort((a, b) => a.tipo.localeCompare(b.tipo));
}

beforeAll(() => {
  db = criarDbApp();
});

afterAll(async () => {
  await db?.$client.end();
});

describe("planos publicados", () => {
  it("landing e manual (src/domain/planos.ts) batem com planos_saas", async () => {
    const banco = await db.select().from(planosSaas).where(eq(planosSaas.ativo, true));
    for (const p of PLANOS_PUBLICOS) {
      const linha = banco.find((b) => b.codigo === p.codigo);
      expect(linha, p.codigo).toBeDefined();
      expect({
        nome: linha!.nome,
        precoMensalCentavos: linha!.precoMensalCentavos,
        limites: linha!.limites,
        permiteUnidadeExtra: linha!.permiteUnidadeExtra,
        precoSalaExtraCentavos: linha!.precoSalaExtraCentavos,
        precoProfissionalExtraCentavos: linha!.precoProfissionalExtraCentavos,
        precoUnidadeExtraCentavos: linha!.precoUnidadeExtraCentavos,
        precoProntuarioCentavos: linha!.precoProntuarioCentavos,
      }).toEqual({
        nome: p.nome,
        precoMensalCentavos: p.precoMensalCentavos,
        limites: p.limites,
        permiteUnidadeExtra: p.permiteUnidadeExtra,
        precoSalaExtraCentavos: p.precoSalaExtraCentavos,
        precoProfissionalExtraCentavos: p.precoProfissionalExtraCentavos,
        precoUnidadeExtraCentavos: p.precoUnidadeExtraCentavos,
        precoProntuarioCentavos: p.precoProntuarioCentavos,
      });
    }
  });
});

describe("Básico", () => {
  let admin: ContextoTenant;
  let unidadeA: string;

  beforeAll(async () => {
    admin = await novoEspaco("Espaço Básico");
    ({ id: unidadeA } = await criarUnidade(admin, { nome: "Sede A" }, db));
  });

  it("reativar uma unidade não fura o limite (antes: desativar A, criar B, reativar A = 2 unidades)", async () => {
    await atualizarUnidade(admin, unidadeA, { nome: "Sede A", ativo: false }, db);
    await criarUnidade(admin, { nome: "Sede B" }, db);
    const erro = await capturarErro(atualizarUnidade(admin, unidadeA, { nome: "Sede A", ativo: true }, db));
    expect((erro as Error).message).toMatch(/permite apenas 1 unidade/);
    expect((await obterAssinatura(admin, db)).uso.unidades).toBe(1);
  });

  it("salas e profissionais além do limite são criados e viram excedente na fatura", async () => {
    const unidade = (await listarUnidades(admin, db)).find((u) => u.ativo)!.id;
    for (let i = 1; i <= 7; i++) await criarSala(admin, unidade, { nome: `Sala ${i}` }, db);
    for (let i = 1; i <= 16; i++) await criarProfissional(admin, { nome: `Prof ${i}`, email: `p${i}.${randomUUID()}@teste.dev` }, db);

    await gerarFaturaDoMes(admin.tenantId, { agora: new Date("2030-04-02T12:00:00Z"), gateway: new GatewayFalso("lim1"), database: db });
    const itens = await itensDaFatura(admin);
    expect(itens.map((i) => [i.tipo, i.quantidade, i.valorTotalCentavos])).toEqual([
      ["base", 1, 19900],
      ["profissional_extra", 1, 1990],
      ["sala_extra", 2, 7980],
    ]);
  });

  it("subir para o Pro libera a segunda unidade na hora", async () => {
    await trocarPlano(admin, "pro", db);
    await expect(atualizarUnidade(admin, unidadeA, { nome: "Sede A", ativo: true }, db)).resolves.toBeUndefined();
  });

  it("voltar ao Básico com 2 unidades é recusado; com 1 unidade e salas a mais é aceito (vira excedente)", async () => {
    await expect(trocarPlano(admin, "basico", db)).rejects.toThrow(/permite apenas 1 unidade/);
    await atualizarUnidade(admin, unidadeA, { nome: "Sede A", ativo: false }, db);
    await expect(trocarPlano(admin, "basico", db)).resolves.toBeUndefined();
    expect((await obterAssinatura(admin, db)).plano?.codigo).toBe("basico");
  });
});

describe("Pro", () => {
  it("a quarta unidade é aceita e cobrada como unidade extra", async () => {
    const admin = await novoEspaco("Espaço Pro");
    await trocarPlano(admin, "pro", db);
    for (const nome of ["U1", "U2", "U3", "U4"]) await criarUnidade(admin, { nome }, db);
    await gerarFaturaDoMes(admin.tenantId, { agora: new Date("2030-04-02T12:00:00Z"), gateway: new GatewayFalso("lim2"), database: db });
    const itens = await itensDaFatura(admin);
    expect(itens.map((i) => [i.tipo, i.quantidade, i.valorTotalCentavos])).toEqual([
      ["base", 1, 49900],
      ["unidade_extra", 1, 14900],
    ]);
  });
});

