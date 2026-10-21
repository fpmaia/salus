import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { pacientes } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { normalizarTelefoneBr } from "../../src/domain/notificacoes";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarPaciente, criarPaciente } from "../../src/server/pacientes";
import { criarDbApp, criarUsuario } from "./helpers";

// C15: a coluna gerada pelo banco segue exatamente a mesma regra de normalizarTelefoneBr.

const AGORA = new Date("2030-03-04T10:00:00Z");
const FORMATOS = [
  "(11) 99999-0000",
  "11 3333-4444",
  "+55 11 99999-0000",
  "0055 11 99999-0000",
  "5511999990000",
  "011 99999-0000",
  "99999-0000",
  "abc",
  "",
];

let db: Database;
let admin: ContextoTenant;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Telefone");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Telefone", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
});

afterAll(async () => {
  await db?.$client.end();
});

const normalizadoNoBanco = async (id: string) =>
  (await withTenant(admin, (tx) => tx.select({ n: pacientes.telefoneNormalizado }).from(pacientes).where(eq(pacientes.id, id)), db))[0].n;

describe("telefone normalizado (C15)", () => {
  it.each(FORMATOS)("%j: banco e código concordam", async (telefone) => {
    const { id } = await criarPaciente(admin, { nome: `Paciente ${telefone || "sem"}`, telefone }, AGORA, db);
    expect(await normalizadoNoBanco(id)).toBe(normalizarTelefoneBr(telefone));
  });

  it("acompanha a edição do telefone", async () => {
    const { id } = await criarPaciente(admin, { nome: "Paciente Edita", telefone: "11 98888-7777" }, AGORA, db);
    await atualizarPaciente(admin, id, { nome: "Paciente Edita", telefone: "21 3222-1111", ativo: true }, AGORA, db);
    expect(await normalizadoNoBanco(id)).toBe("+552132221111");
  });
});
