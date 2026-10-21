import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { ErroPermissao } from "../../src/domain/rbac";
import { criarAcordo, extrato, reprocessar } from "../../src/server/financeiro";
import { definirModulos, modulosDoEspaco } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarProfissional, criarProfissional } from "../../src/server/profissionais";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Módulos opcionais por espaço, RBAC da recepção (C14) e prévia do fechamento no extrato (C12).

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let ana: string;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Modulos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Módulos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const recepcaoId = await criarUsuario(db, "Recepcao Modulos");
  await withTenant(admin, (tx) => tx.insert(memberships).values({ userId: recepcaoId, role: "recepcao" }), db);
  recepcao = { tenantId, userId: recepcaoId, role: "recepcao" };
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("módulos do espaço", () => {
  it("espaço novo começa com tudo desligado; só o admin liga", async () => {
    expect(await modulosDoEspaco(admin, db)).toEqual({ fiscal: false, agendaOnline: false, prontuario: false });
    expect(await capturarErro(definirModulos(recepcao, { fiscal: true, agendaOnline: false, prontuario: false }, db))).toBeInstanceOf(ErroPermissao);
    await definirModulos(admin, { fiscal: true, agendaOnline: false, prontuario: true }, db);
    expect(await modulosDoEspaco(recepcao, db)).toEqual({ fiscal: true, agendaOnline: false, prontuario: true });
    // Sem nenhum prontuário registrado, dá para desligar.
    await definirModulos(admin, { fiscal: true, agendaOnline: false, prontuario: false }, db);
  });
});

describe("recepção (C14)", () => {
  it("não recalcula o mês nem ativa/inativa profissional, mas edita o cadastro", async () => {
    expect(await capturarErro(reprocessar(recepcao, "2030-03", db))).toBeInstanceOf(ErroPermissao);
    const [{ email }] = await withTenant(admin, (tx) => tx.select({ email: profissionais.email }).from(profissionais).where(eq(profissionais.id, ana)), db);
    expect(await capturarErro(atualizarProfissional(recepcao, ana, { nome: "Dra. Ana", email: email!, ativo: false }, db))).toBeInstanceOf(ErroPermissao);
    await atualizarProfissional(recepcao, ana, { nome: "Dra. Ana Lima", email: email!, especialidade: "Psicologia", ativo: true }, db);
    await reprocessar(admin, "2030-03", db);
  });
});

describe("prévia do fechamento (C12)", () => {
  it("no mês aberto, o extrato mostra a mensalidade que ainda vai entrar", async () => {
    await criarAcordo(admin, { profissionalId: ana, modelo: "mensalidade", mensalidadeCentavos: 80000, horasIncluidas: 20, valorHoraCentavos: 5000, vigenteDe: "2030-03-01" }, db);
    const e = await extrato(admin, { profissionalId: ana, competencia: "2030-03" }, db);
    expect(e.saldoFinal).toBe(0);
    expect(e.previsto).toEqual([{ descricao: expect.stringContaining("Mensalidade"), valorCentavos: 80000 }]);
  });
});
