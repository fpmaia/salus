import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { agendamentos, notificacoesOutbox, profissionais, regrasRecorrencia, reservasSala } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { criarAgendamento } from "../../src/server/agendamentos";
import { criarContrato } from "../../src/server/contratos";
import { ErroImpacto } from "../../src/server/impacto";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { atualizarProfissional, criarProfissional } from "../../src/server/profissionais";
import { criarRecorrencia, criarReserva, encerrarRecorrencia } from "../../src/server/reservas";
import { adicionarFeriado, atualizarSala, criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Recorrência quinzenal, mensal e com vários dias; feriado e desativação com a lista das
// reservas afetadas e a decisão do admin (manter ou cancelar pelo espaço, avisando).

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo

let db: Database;
let admin: ContextoTenant;
let unidadeId: string;
let sala1: string;
let sala2: string;
let ana: string;

const ocorrencias = (regraIds: string[]) =>
  withTenant(
    admin,
    async (tx) =>
      (
        await tx
          .select({ data: reservasSala.dataOcorrencia, status: reservasSala.status })
          .from(reservasSala)
          .where(inArray(reservasSala.recorrenciaId, regraIds))
          .orderBy(reservasSala.dataOcorrencia)
      ).map((r) => `${r.data}${r.status === "ativa" ? "" : `:${r.status}`}`),
    db,
  );
const regrasDoGrupo = (regraId: string) =>
  withTenant(
    admin,
    async (tx) => {
      const [r] = await tx.select().from(regrasRecorrencia).where(eq(regrasRecorrencia.id, regraId));
      return r.grupoId ? tx.select().from(regrasRecorrencia).where(eq(regrasRecorrencia.grupoId, r.grupoId)) : [r];
    },
    db,
  );
const reserva = (id: string) => withTenant(admin, async (tx) => (await tx.select().from(reservasSala).where(eq(reservasSala.id, id)))[0], db);

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Impacto");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Impacto", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  ({ id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db)); // seg–sex 08–18
  ({ id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  ({ id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db));
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev`, telefone: "11 98888-0001" }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("recorrência", () => {
  it("quinzenal: semana sim, semana não", async () => {
    const { id } = await criarRecorrencia(
      admin,
      { salaId: sala1, profissionalId: ana, dataInicio: "2030-03-05", dataFim: "2030-04-30", horaInicio: "08:00", horaFim: "09:00", frequencia: "quinzenal" },
      AGORA,
      db,
    );
    // A janela é de 8 semanas (até 29/04); o worker gera as seguintes.
    expect(await ocorrencias([id])).toEqual(["2030-03-05", "2030-03-19", "2030-04-02", "2030-04-16"]);
  });

  it("vários dias na mesma série; encerrar a série encerra todos os dias", async () => {
    const { id, ocorrencias: n } = await criarRecorrencia(
      admin,
      { salaId: sala1, profissionalId: ana, dataInicio: "2030-03-04", dataFim: "2030-03-17", horaInicio: "10:00", horaFim: "11:00", diasSemana: [1, 3, 5] },
      AGORA,
      db,
    );
    expect(n).toBe(6);
    const grupo = await regrasDoGrupo(id);
    expect(grupo.map((r) => r.diaSemana).sort()).toEqual([1, 3, 5]);
    expect(await ocorrencias(grupo.map((r) => r.id))).toEqual(["2030-03-04", "2030-03-06", "2030-03-08", "2030-03-11", "2030-03-13", "2030-03-15"]);

    expect(await encerrarRecorrencia(admin, id, "2030-03-10", AGORA, db)).toEqual({ canceladas: 3, mantidas: 0 });
    const depois = await regrasDoGrupo(id);
    expect(depois.every((r) => r.encerradaEm !== null)).toBe(true);
  });

  it("mensal: a mesma semana do mês da data inicial (1ª terça)", async () => {
    const { id } = await criarRecorrencia(
      admin,
      { salaId: sala2, profissionalId: ana, dataInicio: "2030-03-05", horaInicio: "14:00", horaFim: "15:00", frequencia: "mensal" },
      AGORA,
      db,
    );
    const [regra] = await regrasDoGrupo(id);
    expect(regra).toMatchObject({ frequencia: "mensal", semanaDoMes: 1, diaSemana: 2 });
    expect(await ocorrencias([id])).toEqual(["2030-03-05", "2030-04-02"]);
  });

  it("conflito em qualquer dia: nada é gravado", async () => {
    const erro = await capturarErro(
      criarRecorrencia(admin, { salaId: sala1, profissionalId: ana, dataInicio: "2030-03-05", horaInicio: "08:00", horaFim: "09:00", diasSemana: [2, 4] }, AGORA, db),
    );
    expect((erro as Error).message).toContain("conflito");
  });
});

describe("feriado com reservas marcadas", () => {
  let paciente: string;
  let reservaDia: string;
  let agendamentoDia: string;

  it("sem decisão, mostra a lista e não grava o feriado", async () => {
    // R$ 30 por consulta, falta integral: o cancelamento pelo espaço não pode cobrar.
    await criarContrato(admin, { profissionalId: ana, modelo: "consulta", valorConsultaCentavos: 3000, regraFalta: "integral", vigenteDe: "2030-03-01" }, { agora: AGORA }, db);
    ({ id: paciente } = await criarPaciente(admin, { nome: "Paciente Feriado", telefone: "11 97777-0001", consentimentoLembretes: true }, AGORA, db));
    ({ id: reservaDia } = await criarReserva(admin, { salaId: sala2, profissionalId: ana, data: "2030-03-20", horaInicio: "09:00", horaFim: "11:00" }, AGORA, db));
    ({ id: agendamentoDia } = await criarAgendamento(admin, { pacienteId: paciente, reservaId: reservaDia, data: "2030-03-20", horaInicio: "09:00", horaFim: "10:00" }, AGORA, db));

    const erro = await capturarErro(adicionarFeriado(admin, { unidadeId, data: "2030-03-20", descricao: "Aniversário da cidade" }, db, AGORA));
    expect(erro).toBeInstanceOf(ErroImpacto);
    expect((erro as ErroImpacto).afetadas).toMatchObject([{ reservaId: reservaDia, horaInicio: "09:00", horaFim: "11:00", salaNome: "Sala 2", pacientes: 1 }]);
    expect((erro as Error).message).toContain("20/03 09:00–11:00 Sala 2 · Dra. Ana (1 paciente)");
  });

  it("manter: grava o feriado e a reserva continua", async () => {
    const { canceladas } = await adicionarFeriado(admin, { unidadeId, data: "2030-03-20", descricao: "Aniversário da cidade", decisaoReservas: "manter" }, db, AGORA);
    expect(canceladas).toBe(0);
    expect((await reserva(reservaDia)).status).toBe("ativa");
  });

  it("cancelar: reserva e atendimento saem pelo espaço, sem cobrança, com aviso ao paciente e à profissional", async () => {
    const { canceladas } = await adicionarFeriado(admin, { unidadeId: null, data: "2030-03-20", descricao: "Ponto facultativo", decisaoReservas: "cancelar" }, db, AGORA);
    expect(canceladas).toBe(1);
    expect(await reserva(reservaDia)).toMatchObject({ status: "cancelada", canceladaPor: "espaco" });
    const [a] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, agendamentoDia)), db);
    expect(a).toMatchObject({ status: "cancelado", canceladoPor: "espaco" });
    const avisos = await withTenant(
      admin,
      (tx) =>
        tx
          .select({ tipo: notificacoesOutbox.tipo, para: notificacoesOutbox.destinatario, parametros: notificacoesOutbox.parametros })
          .from(notificacoesOutbox)
          .where(inArray(notificacoesOutbox.tipo, ["cancelamento_agendamento", "cancelamento_reserva"])),
      db,
    );
    expect(avisos.map((x) => `${x.tipo}:${x.para}`).sort()).toEqual(["cancelamento_agendamento:+5511977770001", "cancelamento_reserva:+5511988880001"]);
    expect(avisos.find((x) => x.tipo === "cancelamento_agendamento")?.parametros).toMatchObject({ data: "20/03/2030", hora: "09:00", motivo: "feriado: Ponto facultativo" });
  });
});

describe("desativar sala ou profissional", () => {
  it("sala: lista as reservas futuras e cancela se o admin decidir", async () => {
    const { id: salaNova } = await criarSala(admin, unidadeId, { nome: "Sala 3" }, db);
    const { id: r } = await criarReserva(admin, { salaId: salaNova, profissionalId: ana, data: "2030-03-21", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
    expect(await capturarErro(atualizarSala(admin, salaNova, { nome: "Sala 3", ativo: false }, db, AGORA))).toBeInstanceOf(ErroImpacto);
    expect(await atualizarSala(admin, salaNova, { nome: "Sala 3", ativo: false, decisaoReservas: "cancelar" }, db, AGORA)).toEqual({ canceladas: 1 });
    expect((await reserva(r)).status).toBe("cancelada");
    // Já inativa: salvar de novo não pergunta nada.
    await atualizarSala(admin, salaNova, { nome: "Sala 3 (reforma)", ativo: false }, db, AGORA);
  });

  it("profissional: manter deixa as reservas futuras", async () => {
    const { id: beto } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db);
    const { id: r } = await criarReserva(admin, { salaId: sala2, profissionalId: beto, data: "2030-03-22", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
    const email = (await withTenant(admin, (tx) => tx.select({ email: profissionais.email }).from(profissionais).where(and(eq(profissionais.id, beto))), db))[0].email!;
    const erro = await capturarErro(atualizarProfissional(admin, beto, { nome: "Dr. Beto", email, ativo: false }, db, AGORA));
    expect((erro as Error).message).toContain("Dr. Beto tem reservas futuras");
    expect(await atualizarProfissional(admin, beto, { nome: "Dr. Beto", email, ativo: false, decisaoReservas: "manter" }, db, AGORA)).toEqual({ canceladas: 0 });
    expect((await reserva(r)).status).toBe("ativa");
  });
});
