import { writeFileSync } from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { opcoesAuth } from "../../src/auth/config";
import { createDb } from "../../src/db/client";
import { aplicarMigrations } from "../../src/db/migrator";
import { memberships, profissionais, users } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { hojeNoFuso, somarDias } from "../../src/domain/tempo";
import { definirProvedorEmail, EmailMemoria } from "../../src/server/email";
import { registrarAceite } from "../../src/server/aceites";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { criarAcordo, definirValorAgendamento } from "../../src/server/financeiro";
import { listarMembershipsDoUsuario } from "../../src/server/memberships";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade, definirHorarios } from "../../src/server/unidades";
import { ARQUIVO_DADOS, type DadosE2E, SENHA, usuario } from "./dados";

// Banco limpo + espaço "Coworking E2E", pelos mesmos serviços do app (papel salus_app, com RLS).
export default async function setup() {
  const migrador = process.env.TEST_DATABASE_MIGRATOR_URL ?? "postgres://salus_owner:salus_owner_dev@localhost:5433/salus_test";
  const app = process.env.TEST_DATABASE_URL ?? "postgres://salus_app:salus_app_dev@localhost:5433/salus_test";

  const client = new Client({ connectionString: migrador });
  try {
    await client.connect();
  } catch (erro) {
    throw new Error(`Não foi possível conectar ao Postgres de testes. Suba o banco com "npm run db:up".\n${erro}`);
  }
  try {
    await client.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS pgboss CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    `);
  } finally {
    await client.end();
  }
  await aplicarMigrations(migrador);

  const db = createDb(app);
  const auth = betterAuth(opcoesAuth(db));
  definirProvedorEmail(new EmailMemoria()); // o cadastro envia a confirmação; aqui não interessa
  try {
    const ids: Record<string, string> = {};
    for (const [role, nome] of [
      ["admin", "Admin E2E"],
      ["recepcao", "Recepção E2E"],
      ["profissional", "Dra. E2E"],
    ] as const) {
      const { user } = await auth.api.signUpEmail({ body: { name: nome, email: usuario(role), password: SENHA } });
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
      await registrarAceite(user.id, "script", {}, db);
      ids[role] = user.id;
    }

    await criarTenantComAdmin(ids.admin, { nomeTenant: "Coworking E2E", documento: "11.222.333/0001-81" }, db);
    const [membership] = await listarMembershipsDoUsuario(ids.admin, db);
    const admin: ContextoTenant = { tenantId: membership.tenantId, userId: ids.admin, role: "admin" };

    const profissionalId = await withTenant(
      admin,
      async (tx) => {
        await tx.insert(memberships).values([
          { userId: ids.recepcao, role: "recepcao" },
          { userId: ids.profissional, role: "profissional" },
        ]);
        const [m] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, ids.profissional), eq(memberships.role, "profissional")));
        const [p] = await tx
          .insert(profissionais)
          .values({ nome: "Dra. E2E", email: usuario("profissional"), conselho: "CRP", registro: "06/000001", membershipId: m.id })
          .returning({ id: profissionais.id });
        return p.id;
      },
      db,
    );

    const { id: unidadeId } = await criarUnidade(admin, { nome: "Unidade E2E", endereco: "Rua dos Testes, 1" }, db);
    await definirHorarios(admin, unidadeId, [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, abre: "06:00", fecha: "22:00" })), db);
    const { id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db);
    const { id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db);
    const { id: anaPaciente } = await criarPaciente(admin, { nome: "Ana Paciente", telefone: "11 90000-0001" }, new Date(), db);

    // Mês anterior: acordo por hora (R$ 45) e uma reserva de 2h, para o fechamento.
    const hoje = hojeNoFuso("America/Sao_Paulo");
    const mesAtual = `${hoje.slice(0, 7)}-01`;
    const mesAnterior = `${somarDias(mesAtual, -1).slice(0, 7)}-01`;
    await criarAcordo(admin, { profissionalId, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: mesAnterior }, db);
    const diaPassado = `${mesAnterior.slice(0, 7)}-10`;
    const criadaEm = new Date(`${mesAnterior.slice(0, 7)}-01T03:00:00Z`);
    const { id: reservaPassada } = await criarReserva(
      admin,
      { salaId: sala1, profissionalId, data: diaPassado, horaInicio: "09:00", horaFim: "11:00" },
      criadaEm,
      db,
    );
    // Atendimento realizado e pago (R$ 200) nessa reserva: base do recibo.
    const { id: atendimentoPago } = await criarAgendamento(
      admin,
      { pacienteId: anaPaciente, reservaId: reservaPassada, data: diaPassado, horaInicio: "09:00", horaFim: "10:00" },
      criadaEm,
      db,
    );
    const duranteAtendimento = new Date(`${diaPassado}T12:30:00Z`);
    await alterarStatusAgendamento(admin, atendimentoPago, "presente", null, duranteAtendimento, db);
    await alterarStatusAgendamento(admin, atendimentoPago, "realizado", null, duranteAtendimento, db);
    await definirValorAgendamento(admin, atendimentoPago, 20000, duranteAtendimento, db);

    // Amanhã: reserva na Sala 2 para a recepção encaixar um paciente.
    const amanha = somarDias(hoje, 1);
    const { id: reservaAmanha } = await criarReserva(
      admin,
      { salaId: sala2, profissionalId, data: amanha, horaInicio: "14:00", horaFim: "16:00" },
      new Date(),
      db,
    );

    const dados: DadosE2E = { profissionalId, reservaAmanha, amanha, competenciaAnterior: mesAnterior.slice(0, 7), sala1, atendimentoPago };
    writeFileSync(path.resolve(ARQUIVO_DADOS), JSON.stringify(dados, null, 2));
  } finally {
    await db.$client.end();
  }
}
