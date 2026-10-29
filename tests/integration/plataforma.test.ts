import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { auditPlataforma, planosSaas, users } from "../../src/db/schema";
import { gerarFaturaDoMes } from "../../src/server/assinatura";
import { listarMembershipsDoUsuario, usuarioTemEspacoBloqueado } from "../../src/server/memberships";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import {
  atualizarConfiguracaoPlano,
  banirUsuarioPlataforma,
  desbanirUsuarioPlataforma,
  obterDetalhesClinicaPlataforma,
  obterFaturamentoPlataforma,
  listarClinicasPlataforma,
  listarUsuariosPlataforma,
  obterMetricasPlataforma,
  reativarClinicaPlataforma,
  suspenderClinicaPlataforma,
} from "../../src/server/plataforma";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

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
      "Acesso negado: área restrita à equipe da plataforma Salus.",
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

  it("clínica suspensa pela plataforma: o usuário não cai no onboarding (não cria outro espaço)", async () => {
    await suspenderClinicaPlataforma(superadminId, tenantTesteId, "Teste de bloqueio", db);
    expect(await listarMembershipsDoUsuario(usuarioComumId, db)).toEqual([]);
    expect(await usuarioTemEspacoBloqueado(usuarioComumId, db)).toBe(true);
    await reativarClinicaPlataforma(superadminId, tenantTesteId, db);
    expect(await usuarioTemEspacoBloqueado(usuarioComumId, db)).toBe(false);
    expect(await usuarioTemEspacoBloqueado(superadminId, db)).toBe(false);
  });
});

describe("planos, faturamento e detalhe da clínica (superadmin)", () => {
  it("edita o plano (antes falhava: o app só lê planos_saas) e audita; recusa valores inválidos", async () => {
    const [enterprise] = await db.select().from(planosSaas).where(eq(planosSaas.codigo, "enterprise"));
    try {
      await atualizarConfiguracaoPlano(superadminId, enterprise.id, { precoSalaExtraCentavos: 2990, limites: { unidades: 60, salas: 600, profissionais: 2500 } }, db);
      const [depois] = await db.select().from(planosSaas).where(eq(planosSaas.id, enterprise.id));
      expect(depois).toMatchObject({ precoSalaExtraCentavos: 2990, limites: { unidades: 60, salas: 600, profissionais: 2500 }, precoMensalCentavos: enterprise.precoMensalCentavos });
      const auditoria = await db.select().from(auditPlataforma).where(eq(auditPlataforma.alvoId, enterprise.id));
      expect(auditoria.some((a) => a.acao === "plataforma.plano.atualizar")).toBe(true);
    } finally {
      await atualizarConfiguracaoPlano(superadminId, enterprise.id, { precoSalaExtraCentavos: enterprise.precoSalaExtraCentavos, limites: enterprise.limites as never }, db);
    }
    expect(((await capturarErro(atualizarConfiguracaoPlano(superadminId, enterprise.id, { precoMensalCentavos: Number.NaN }, db))) as Error).message).toMatch(/Mensalidade/);
    expect(((await capturarErro(atualizarConfiguracaoPlano(superadminId, enterprise.id, { limites: { unidades: 0, salas: 1, profissionais: 1 } }, db))) as Error).message).toMatch(/Unidades/);
    await expect(atualizarConfiguracaoPlano(usuarioComumId, enterprise.id, { nome: "Hack" }, db)).rejects.toThrow("Acesso negado");
  });

  it("faturamento lista as faturas de todos os espaços com os itens (antes vinha vazio)", async () => {
    const admin = { tenantId: tenantTesteId, userId: usuarioComumId, role: "admin" as const };
    const { id: unidade } = await criarUnidade(admin, { nome: "Sede" }, db);
    for (let i = 1; i <= 6; i++) await criarSala(admin, unidade, { nome: `Sala ${i}` }, db);
    await gerarFaturaDoMes(tenantTesteId, { agora: new Date("2030-05-02T12:00:00Z"), gateway: new GatewayFalso("plat"), database: db });

    const { faturas, itensPorFatura, metricas } = await obterFaturamentoPlataforma(superadminId, db);
    const nossa = faturas.find((f) => f.tenantId === tenantTesteId)!;
    expect(nossa).toMatchObject({ tenantNome: "Clínica Plataforma Teste", competencia: "2030-05-01", valorCentavos: 19900 + 3990 });
    expect(itensPorFatura[nossa.id].map((i) => i.tipo).sort()).toEqual(["base", "sala_extra"]);
    expect(metricas.breakdownCentavos.sala_extra).toBeGreaterThanOrEqual(3990);
    await expect(obterFaturamentoPlataforma(usuarioComumId, db)).rejects.toThrow("Acesso negado");
  });

  it("detalhe da clínica traz recursos, equipe e faturas (antes respondia 404)", async () => {
    const d = await obterDetalhesClinicaPlataforma(superadminId, tenantTesteId, db);
    expect(d.tenant.nome).toBe("Clínica Plataforma Teste");
    expect(d.recursos.salas).toHaveLength(6);
    expect(d.membros.map((m) => m.role)).toContain("admin");
    expect(d.faturas.length).toBeGreaterThanOrEqual(1);
    await expect(obterDetalhesClinicaPlataforma(usuarioComumId, tenantTesteId, db)).rejects.toThrow("Acesso negado");
  });
});
