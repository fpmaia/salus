import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { tenants, users } from "../../src/db/schema";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import {
  banirUsuarioPlataforma,
  desbanirUsuarioPlataforma,
  listarClinicasPlataforma,
  listarUsuariosPlataforma,
  obterMetricasPlataforma,
  reativarClinicaPlataforma,
  suspenderClinicaPlataforma,
} from "../../src/server/plataforma";
import { criarDbApp, criarUsuario } from "./helpers";

let db: Database;
let superadminId: string;
let usuarioComumId: string;
let tenantTesteId: string;

beforeAll(async () => {
  db = criarDbApp();

  // 1. Cria usuário comum e um tenant
  usuarioComumId = await criarUsuario(db, "Usuário Comum");
  const { tenantId } = await criarTenantComAdmin(
    usuarioComumId,
    { nomeTenant: "Clínica Plataforma Teste", documento: "11222333000181" },
    db,
  );
  tenantTesteId = tenantId;

  // 2. Cria superadmin
  superadminId = await criarUsuario(db, "Superadmin Dono");
  await db
    .update(users)
    .set({ role: "superadmin" })
    .where(eq(users.id, superadminId));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("área de plataforma do dono do sistema (/plataforma)", () => {
  it("recusa acesso a usuários não-superadmin", async () => {
    await expect(obterMetricasPlataforma(usuarioComumId, db)).rejects.toThrow(
      "Acesso negado: área restrita ao dono da plataforma Salus.",
    );
    await expect(listarClinicasPlataforma(usuarioComumId, db)).rejects.toThrow(
      "Acesso negado",
    );
  });

  it("permite ao superadmin ler métricas, listar clínicas e usuários", async () => {
    const metricas = await obterMetricasPlataforma(superadminId, db);
    expect(metricas.totalClinicas).toBeGreaterThanOrEqual(1);
    expect(metricas.totalUsuarios).toBeGreaterThanOrEqual(2);

    const clinicas = await listarClinicasPlataforma(superadminId, db);
    expect(clinicas.length).toBeGreaterThanOrEqual(1);
    const nossaClinica = clinicas.find((c) => c.id === tenantTesteId);
    expect(nossaClinica).toBeDefined();
    expect(nossaClinica?.nome).toBe("Clínica Plataforma Teste");

    const usuarios = await listarUsuariosPlataforma(superadminId, db);
    expect(usuarios.length).toBeGreaterThanOrEqual(2);
    expect(usuarios.some((u) => u.id === superadminId)).toBe(true);
  });

  it("superadmin consegue suspender e reativar uma clínica", async () => {
    await suspenderClinicaPlataforma(superadminId, tenantTesteId, "Inadimplência de teste", db);

    let clinicas = await listarClinicasPlataforma(superadminId, db);
    let c = clinicas.find((item) => item.id === tenantTesteId);
    expect(c?.status).toBe("suspenso");

    await reativarClinicaPlataforma(superadminId, tenantTesteId, db);

    clinicas = await listarClinicasPlataforma(superadminId, db);
    c = clinicas.find((item) => item.id === tenantTesteId);
    expect(c?.status).toBe("ativo");
  });

  it("superadmin consegue banir e desbanir usuário", async () => {
    const usuarioParaBanir = await criarUsuario(db, "Usuario Infrator");

    await banirUsuarioPlataforma(superadminId, usuarioParaBanir, "Violação dos termos de uso", db);

    let usuarios = await listarUsuariosPlataforma(superadminId, db);
    let u = usuarios.find((item) => item.id === usuarioParaBanir);
    expect(u?.banned).toBe(true);
    expect(u?.banReason).toBe("Violação dos termos de uso");

    await desbanirUsuarioPlataforma(superadminId, usuarioParaBanir, db);

    usuarios = await listarUsuariosPlataforma(superadminId, db);
    u = usuarios.find((item) => item.id === usuarioParaBanir);
    expect(u?.banned).toBe(false);
  });
});
