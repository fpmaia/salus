import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { configurarAgendamentoOnline } from "../../src/server/agendamento-online";
import { ativarLicencaProntuario } from "../../src/server/assinatura";
import { emitirNota, salvarConfiguracaoFiscal } from "../../src/server/fiscal";
import { definirModulos } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { salvarRascunho } from "../../src/server/prontuario";
import { criarDbApp, criarUsuario } from "./helpers";

// Módulo desligado = a ação recusa no servidor (antes só a página respondia 404 e a
// Server Action continuava funcionando se chamada direto).

let db: Database;
let admin: ContextoTenant;
let profissional: ContextoTenant;
let profissionalId: string;
let paciente: string;

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Modulos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Espaço Módulos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const userId = await criarUsuario(db, "Prof Modulos");
  ({ id: profissionalId } = await criarProfissional(admin, { nome: "Dra. Módulos", email: `mod.${randomUUID()}@teste.dev` }, db));
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, profissionalId));
    },
    db,
  );
  profissional = { tenantId, userId, role: "profissional" };
  ({ id: paciente } = await criarPaciente(profissional, { nome: "Paciente Módulos" }, new Date(), db));
  await ativarLicencaProntuario(admin, profissionalId, new Date(), db);
});

afterAll(async () => {
  await db?.$client.end();
});

const desligado = /está desligado neste espaço/;

describe("com os módulos desligados (padrão de um espaço novo)", () => {
  it("prontuário recusa escrever", async () => {
    await expect(salvarRascunho(profissional, { pacienteId: paciente, anotacoes: "x" }, { database: db })).rejects.toThrow(desligado);
  });

  it("NFS-e recusa configurar e emitir", async () => {
    const config = {
      ativo: false,
      ambiente: "homologacao" as const,
      opcaoSimplesNacional: 3,
      regimeTributarioSimplesNacional: null,
      regimeEspecialTributacao: 0,
      aliquotaIssBp: 200,
      descricaoServico: "Cessão de uso de sala",
      serieDps: 1,
      codigoMunicipio: "3550308",
    };
    await expect(salvarConfiguracaoFiscal(admin, config, db)).rejects.toThrow(desligado);
    await expect(emitirNota(admin, profissionalId, "2030-03-01", { database: db })).rejects.toThrow(desligado);
  });

  it("agenda online recusa configurar", async () => {
    await expect(
      configurarAgendamentoOnline(admin, { profissionalId, ativo: true, duracaoConsultaMin: 60, antecedenciaMinHoras: 2, janelaDias: 30 }, db),
    ).rejects.toThrow(desligado);
  });
});

describe("ligados", () => {
  it("as mesmas ações passam do bloqueio de módulo", async () => {
    await definirModulos(admin, { fiscal: true, agendaOnline: true, prontuario: true }, db);
    await expect(salvarRascunho(profissional, { pacienteId: paciente, anotacoes: "x" }, { database: db })).resolves.toHaveProperty("id");
    await expect(
      configurarAgendamentoOnline(admin, { profissionalId, ativo: true, duracaoConsultaMin: 60, antecedenciaMinHoras: 2, janelaDias: 30 }, db),
    ).resolves.toHaveProperty("slug");
    // Sem mês fechado a emissão para por outra regra, não pelo módulo.
    await expect(emitirNota(admin, profissionalId, "2030-03-01", { database: db })).rejects.not.toThrow(desligado);
  });
});
