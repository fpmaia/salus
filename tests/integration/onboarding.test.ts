import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { auditLog, memberships, tenantSettings, tenants } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { listarMembershipsDoUsuario } from "../../src/server/memberships";
import { criarTenantComAdmin, ErroOnboarding } from "../../src/server/onboarding";
import { criarDbApp, criarUsuario } from "./helpers";

let db: Database;

beforeAll(() => {
  db = criarDbApp();
});

afterAll(async () => {
  await db?.$client.end();
});

describe("onboarding (criar tenant + admin)", () => {
  it("cria tenant no plano Básico, configurações, membership admin e auditoria", async () => {
    const userId = await criarUsuario(db, "Fundadora");
    const { tenantId } = await criarTenantComAdmin(
      userId,
      { nomeTenant: "  Espaço Vida  ", documento: "11222333000181" },
      db,
    );

    const lido = await withTenant(
      { tenantId, userId, role: "admin" },
      async (tx) => ({
        tenants: await tx.select().from(tenants),
        settings: await tx.select().from(tenantSettings),
        membros: await tx.select().from(memberships),
        auditoria: await tx.select().from(auditLog),
      }),
      db,
    );

    expect(lido.tenants).toMatchObject([
      { id: tenantId, nome: "Espaço Vida", tipoDocumento: "cnpj", documento: "11222333000181", status: "ativo" },
    ]);
    expect(lido.settings).toMatchObject([{ tenantId, timezone: "America/Sao_Paulo" }]);
    expect(lido.membros).toMatchObject([{ tenantId, userId, role: "admin", ativo: true }]);
    expect(lido.auditoria).toMatchObject([
      { tenantId, userId, acao: "tenant.criado", entidade: "tenants", entidadeId: tenantId },
    ]);
    expect(await listarMembershipsDoUsuario(userId, db)).toMatchObject([
      { tenantId, tenantNome: "Espaço Vida", role: "admin" },
    ]);
  });

  it("recusa documento inválido", async () => {
    const userId = await criarUsuario(db, "Documento inválido");
    await expect(
      criarTenantComAdmin(userId, { nomeTenant: "Espaço", documento: "11.222.333/0001-00" }, db),
    ).rejects.toBeInstanceOf(ErroOnboarding);
  });

  it("recusa um segundo espaço para o mesmo usuário", async () => {
    const userId = await criarUsuario(db, "Dois espaços");
    await criarTenantComAdmin(userId, { nomeTenant: "Primeiro", documento: "52998224725" }, db);
    await expect(
      criarTenantComAdmin(userId, { nomeTenant: "Segundo", documento: "52998224725" }, db),
    ).rejects.toBeInstanceOf(ErroOnboarding);
  });
});
