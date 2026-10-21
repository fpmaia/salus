import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import type { ContextoTenant } from "../../src/db/tenant";
import { trocarPlano } from "../../src/server/assinatura";
import { competenciaAtual, fecharCompetencia } from "../../src/server/financeiro";
import { hojeNoEspaco } from "../../src/server/fuso";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { criarUnidade } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";

// C13: o "hoje" do espaço é a data local mais atrasada entre as unidades. Com uma unidade no
// Acre (UTC−5), março só termina para o espaço quando termina lá também.

const MEIA_NOITE_EM_SP = new Date("2030-04-01T03:30:00Z"); // 00:30 em SP, 22:30 de 31/03 no Acre
const MEIA_NOITE_NO_ACRE = new Date("2030-04-01T05:30:00Z"); // 00:30 no Acre

let db: Database;
let admin: ContextoTenant;
let ana: string;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Fusos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Dois Fusos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  await trocarPlano(admin, "pro", db); // duas unidades
  await criarUnidade(admin, { nome: "São Paulo", timezone: "America/Sao_Paulo" }, db);
  await criarUnidade(admin, { nome: "Rio Branco", timezone: "America/Rio_Branco" }, db);
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("fuso das unidades como fonte única (C13)", () => {
  it("o hoje do espaço é o da unidade mais atrasada", async () => {
    expect(await hojeNoEspaco(admin, MEIA_NOITE_EM_SP, db)).toBe("2030-03-31");
    expect(await competenciaAtual(admin, MEIA_NOITE_EM_SP, db)).toBe("2030-03-01");
    expect(await hojeNoEspaco(admin, MEIA_NOITE_NO_ACRE, db)).toBe("2030-04-01");
  });

  it("março só fecha quando terminou em todas as unidades", async () => {
    await expect(fecharCompetencia(admin, ana, "2030-03", MEIA_NOITE_EM_SP, db)).rejects.toThrow("depois que ele terminar");
    await fecharCompetencia(admin, ana, "2030-03", MEIA_NOITE_NO_ACRE, db);
  });
});
