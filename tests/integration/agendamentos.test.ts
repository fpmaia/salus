import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { agendamentos, memberships, profissionais, reservasSala, tenantSettings } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { ErroAgendamento } from "../../src/domain/agendamentos";
import { ErroReserva } from "../../src/domain/reservas";
import { alterarStatusAgendamento, atendimentosDoDia, criarAgendamento } from "../../src/server/agendamentos";
import { ErroNegocio } from "../../src/server/erros";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente, listarPacientes, obterPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { cancelarReserva, criarRecorrencia, criarReserva, encerrarRecorrencia } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, codigoPg, criarDbApp, criarUsuario } from "./helpers";

// Critérios de pronto da Fase 2:
// - agendamento fora da reserva cria reserva ou é recusado (sala ocupada);
// - profissional não tem dois pacientes no mesmo horário;
// - transições de status inválidas são bloqueadas.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const TER = "2030-03-05";
const QUA = "2030-03-06";
const horasAntes = (iso: string, horas: number) => new Date(new Date(iso).getTime() - horas * 3_600_000);

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let ana: ContextoTenant; // profissional com login
let unidadeId: string;
let sala1: string;
let sala2: string;
let anaId: string;
let betoId: string;
let pacienteJoao: string;
let pacienteMaria: string;
let reservaAna: string;

async function codigoDe(promessa: Promise<unknown>): Promise<string | undefined> {
  const erro = await capturarErro(promessa);
  if (erro instanceof ErroAgendamento || erro instanceof ErroReserva) return erro.codigo;
  throw erro;
}

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Agenda");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Agenda", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };

  const recepcaoId = await criarUsuario(db, "Recepcao Agenda");
  const anaUserId = await criarUsuario(db, "Ana Agenda");
  ({ id: anaId } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
  ({ id: betoId } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db));
  await withTenant(
    admin,
    async (tx) => {
      await tx.insert(memberships).values({ userId: recepcaoId, role: "recepcao" });
      const [m] = await tx.insert(memberships).values({ userId: anaUserId, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, anaId));
    },
    db,
  );
  recepcao = { tenantId, userId: recepcaoId, role: "recepcao" };
  ana = { tenantId, userId: anaUserId, role: "profissional" };

  ({ id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db)); // seg–sex 08–18
  ({ id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  ({ id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db));
  ({ id: reservaAna } = await criarReserva(admin, { salaId: sala1, profissionalId: anaId, data: TER, horaInicio: "08:00", horaFim: "12:00" }, AGORA, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("pacientes", () => {
  it("recepção cadastra paciente", async () => {
    ({ id: pacienteJoao } = await criarPaciente(recepcao, { nome: "João Silva", cpf: "529.982.247-25", telefone: "11999990000" }, AGORA, db));
    ({ id: pacienteMaria } = await criarPaciente(recepcao, { nome: "Maria Souza", consentimentoLembretes: true }, AGORA, db));
    const maria = await obterPaciente(recepcao, pacienteMaria, db);
    expect(maria?.paciente.consentimentoEm?.toISOString()).toBe(AGORA.toISOString());
  });

  it("rejeita CPF inválido e duplicado", async () => {
    await expect(criarPaciente(recepcao, { nome: "Fulano", cpf: "123.456.789-00" }, AGORA, db)).rejects.toThrow("CPF inválido");
    const erro = await capturarErro(criarPaciente(recepcao, { nome: "Outro João", cpf: "52998224725" }, AGORA, db));
    expect(erro).toBeInstanceOf(ErroNegocio);
  });
});

describe("agendamento", () => {
  it("encaixa na reserva existente do profissional", async () => {
    const r = await criarAgendamento(
      recepcao,
      { pacienteId: pacienteJoao, profissionalId: anaId, data: TER, horaInicio: "09:00", horaFim: "10:00" },
      AGORA,
      db,
    );
    expect(r).toMatchObject({ reservaId: reservaAna, reservaCriada: false });
  });

  it("na reserva indicada, a recepção não precisa informar o profissional", async () => {
    const r = await criarAgendamento(
      recepcao,
      { pacienteId: pacienteMaria, reservaId: reservaAna, data: TER, horaInicio: "08:30", horaFim: "09:00" },
      AGORA,
      db,
    );
    expect(r).toMatchObject({ reservaId: reservaAna, reservaCriada: false });
  });

  it("sem reserva, cria a reserva na sala informada", async () => {
    const r = await criarAgendamento(
      recepcao,
      { pacienteId: pacienteMaria, profissionalId: betoId, salaId: sala2, data: TER, horaInicio: "14:00", horaFim: "15:00" },
      AGORA,
      db,
    );
    expect(r.reservaCriada).toBe(true);
    const [reserva] = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.id, r.reservaId)), db);
    expect(reserva).toMatchObject({ salaId: sala2, profissionalId: betoId, status: "ativa" });
  });

  it("recusa quando a sala está ocupada por outro profissional", async () => {
    expect(
      await codigoDe(
        criarAgendamento(
          recepcao,
          { pacienteId: pacienteMaria, profissionalId: betoId, salaId: sala1, data: TER, horaInicio: "10:00", horaFim: "11:00" },
          AGORA,
          db,
        ),
      ),
    ).toBe("conflito_sala");
  });

  it("recusa sem reserva e sem sala", async () => {
    expect(
      await codigoDe(
        criarAgendamento(recepcao, { pacienteId: pacienteMaria, profissionalId: anaId, data: QUA, horaInicio: "09:00", horaFim: "10:00" }, AGORA, db),
      ),
    ).toBe("fora_da_reserva");
  });

  it("profissional não tem dois pacientes no mesmo horário", async () => {
    expect(
      await codigoDe(
        criarAgendamento(recepcao, { pacienteId: pacienteMaria, profissionalId: anaId, data: TER, horaInicio: "09:30", horaFim: "10:30" }, AGORA, db),
      ),
    ).toBe("conflito_profissional");
  });

  it("paciente não está em dois atendimentos ao mesmo tempo", async () => {
    expect(
      await codigoDe(
        criarAgendamento(
          recepcao,
          { pacienteId: pacienteJoao, profissionalId: betoId, salaId: sala2, data: TER, horaInicio: "09:00", horaFim: "10:00" },
          AGORA,
          db,
        ),
      ),
    ).toBe("conflito_paciente");
  });

  it("o banco recusa agendamento fora do período da reserva", async () => {
    const erro = await capturarErro(
      withTenant(
        admin,
        (tx) =>
          tx.insert(agendamentos).values({
            reservaId: reservaAna,
            profissionalId: anaId,
            pacienteId: pacienteMaria,
            periodo: { inicio: new Date("2030-03-05T15:00:00Z"), fim: new Date("2030-03-05T16:00:00Z") }, // 12–13h local
          }),
        db,
      ),
    );
    expect(codigoPg(erro)).toBe("P0001");
  });

  it("reserva com paciente agendado não pode ser cancelada", async () => {
    expect(await codigoDe(cancelarReserva(admin, reservaAna, null, AGORA, db))).toBe("nao_permitido");
  });
});

describe("status", () => {
  let consulta: string;

  it("segue o fluxo agendado → confirmado → presente → realizado", async () => {
    ({ id: consulta } = await criarAgendamento(
      recepcao,
      { pacienteId: pacienteMaria, profissionalId: anaId, data: TER, horaInicio: "10:00", horaFim: "11:00" },
      AGORA,
      db,
    ));
    const inicio = "2030-03-05T13:00:00Z";
    await alterarStatusAgendamento(recepcao, consulta, "confirmado", null, AGORA, db);
    expect(await codigoDe(alterarStatusAgendamento(recepcao, consulta, "presente", null, AGORA, db))).toBe("cedo_demais");
    await alterarStatusAgendamento(recepcao, consulta, "presente", null, horasAntes(inicio, 0.5), db);
    expect(await codigoDe(alterarStatusAgendamento(recepcao, consulta, "cancelado", null, horasAntes(inicio, 0.5), db))).toBe(
      "transicao_invalida",
    );
    await alterarStatusAgendamento(ana, consulta, "realizado", null, horasAntes(inicio, -1), db);
    expect(await codigoDe(alterarStatusAgendamento(recepcao, consulta, "falta", null, horasAntes(inicio, -2), db))).toBe(
      "transicao_invalida",
    );
  });

  it("marca cancelamento tardio conforme a política do tenant", async () => {
    await withTenant(admin, (tx) => tx.update(tenantSettings).set({ antecedenciaCancelamentoHoras: 24 }), db);
    const [{ id: cedo }, { id: tarde }] = [
      await criarAgendamento(recepcao, { pacienteId: pacienteJoao, profissionalId: anaId, data: TER, horaInicio: "11:00", horaFim: "11:30" }, AGORA, db),
      await criarAgendamento(recepcao, { pacienteId: pacienteJoao, profissionalId: anaId, data: TER, horaInicio: "11:30", horaFim: "12:00" }, AGORA, db),
    ];
    expect(await alterarStatusAgendamento(recepcao, cedo, "cancelado", "Viagem", horasAntes("2030-03-05T14:00:00Z", 26), db)).toEqual({
      cancelamentoTardio: false,
    });
    expect(await alterarStatusAgendamento(recepcao, tarde, "cancelado", null, horasAntes("2030-03-05T14:30:00Z", 2), db)).toEqual({
      cancelamentoTardio: true,
    });
  });

  it("depois que o horário começa, só é possível registrar falta", async () => {
    const { id } = await criarAgendamento(
      recepcao,
      { pacienteId: pacienteMaria, profissionalId: betoId, salaId: sala2, data: TER, horaInicio: "16:00", horaFim: "17:00" },
      AGORA,
      db,
    );
    const depoisDoInicio = new Date("2030-03-05T19:10:00Z");
    expect(await codigoDe(alterarStatusAgendamento(recepcao, id, "cancelado", null, depoisDoInicio, db))).toBe("ja_comecou");
    await alterarStatusAgendamento(recepcao, id, "falta", null, depoisDoInicio, db);
  });
});

describe("visão do profissional", () => {
  it("vê só os pacientes vinculados e os que cadastra", async () => {
    const { id: proprio } = await criarPaciente(ana, { nome: "Paciente da Ana" }, AGORA, db);
    await criarPaciente(recepcao, { nome: "Paciente sem vínculo" }, AGORA, db);
    const nomes = (await listarPacientes(ana, {}, db)).map((p) => p.nome).sort();
    // João e Maria têm agendamento com a Ana; o terceiro foi cadastrado por ela.
    expect(nomes).toEqual(["João Silva", "Maria Souza", "Paciente da Ana"]);
    expect((await listarPacientes(recepcao, {}, db)).length).toBeGreaterThan(nomes.length);
    expect(await obterPaciente(ana, proprio, db)).not.toBeNull();
  });

  it("o histórico do paciente mostra ao profissional só os próprios atendimentos", async () => {
    const visaoAna = await obterPaciente(ana, pacienteMaria, db);
    const visaoRecepcao = await obterPaciente(recepcao, pacienteMaria, db);
    expect(new Set(visaoAna!.historico.map((h) => h.profissionalNome))).toEqual(new Set(["Dra. Ana"]));
    expect(new Set(visaoRecepcao!.historico.map((h) => h.profissionalNome))).toEqual(new Set(["Dra. Ana", "Dr. Beto"]));
  });

  it("agenda para si mesmo e não altera atendimentos de outro profissional", async () => {
    const { id } = await criarAgendamento(ana, { pacienteId: pacienteJoao, profissionalId: betoId, data: TER, horaInicio: "08:00", horaFim: "08:30" }, AGORA, db);
    const [linha] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, id)), db);
    expect(linha.profissionalId).toBe(anaId);

    const doBeto = (await atendimentosDoDia(recepcao, unidadeId, TER, db))!.atendimentos.find((a) => a.profissionalNome === "Dr. Beto")!;
    expect(await codigoDe(alterarStatusAgendamento(ana, doBeto.id, "confirmado", null, AGORA, db))).toBe("nao_permitido");
  });

  it("atendimentos do dia: recepção vê todos, profissional só os seus", async () => {
    const todos = (await atendimentosDoDia(recepcao, unidadeId, TER, db))!.atendimentos;
    const daAna = (await atendimentosDoDia(ana, unidadeId, TER, db))!.atendimentos;
    expect(new Set(todos.map((a) => a.profissionalNome))).toEqual(new Set(["Dra. Ana", "Dr. Beto"]));
    expect(daAna.length).toBeGreaterThan(0);
    expect(daAna.every((a) => a.profissionalNome === "Dra. Ana")).toBe(true);
  });
});

describe("recorrência com pacientes", () => {
  it("encerrar a série mantém as ocorrências com pacientes agendados", async () => {
    const { id: regra } = await criarRecorrencia(
      admin,
      { salaId: sala2, profissionalId: anaId, dataInicio: "2030-03-07", horaInicio: "08:00", horaFim: "10:00" },
      AGORA,
      db,
    );
    await criarAgendamento(recepcao, { pacienteId: pacienteMaria, profissionalId: anaId, data: "2030-03-14", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
    const { canceladas, mantidas } = await encerrarRecorrencia(admin, regra, "2030-03-07", AGORA, db);
    expect(mantidas).toBe(1);
    expect(canceladas).toBe(7);
  });
});
