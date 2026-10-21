import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import type { ContextoTenant } from "../../src/db/tenant";
import { ErroPermissao } from "../../src/domain/rbac";
import { criarAgendamento } from "../../src/server/agendamentos";
import { criarAcordo } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { primeirosPassos } from "../../src/server/primeiros-passos";
import { criarProfissional, gerarConvite } from "../../src/server/profissionais";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Primeiros passos do admin (no lugar do tour e do manual).

const AGORA = new Date("2030-03-04T10:00:00Z");

let db: Database;
let admin: ContextoTenant;

const feitas = async () => (await primeirosPassos(admin, db)).filter((e) => e.feita).map((e) => e.chave);

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Passos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Passos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
});

afterAll(async () => {
  await db?.$client.end();
});

describe("primeiros passos", () => {
  it("espaço novo: nada feito, na ordem do uso", async () => {
    const etapas = await primeirosPassos(admin, db);
    expect(etapas.map((e) => e.chave)).toEqual(["unidade", "salas", "profissional", "contrato", "convite", "paciente", "consulta"]);
    expect(await feitas()).toEqual([]);
    expect(await capturarErro(primeirosPassos({ ...admin, role: "recepcao" }, db))).toBeInstanceOf(ErroPermissao);
  });

  it("cada cadastro marca a etapa até a primeira consulta", async () => {
    const { id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db);
    const { id: sala } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db);
    const { id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db);
    expect(await feitas()).toEqual(["unidade", "salas", "profissional"]);
    await criarAcordo(admin, { profissionalId: ana, modelo: "hora", valorHoraCentavos: 4000, vigenteDe: "2030-03-01" }, db);
    await gerarConvite(admin, ana, AGORA, db);
    const { id: paciente } = await criarPaciente(admin, { nome: "João" }, AGORA, db);
    await criarAgendamento(admin, { pacienteId: paciente, profissionalId: ana, salaId: sala, data: "2030-03-05", horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    expect(await feitas()).toHaveLength(7);
  });
});
