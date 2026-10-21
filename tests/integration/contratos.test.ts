import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { lancamentos, memberships, profissionais, regrasRecorrencia, reservasSala } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { criarContrato, encerrarContrato, listarContratos, obterContrato } from "../../src/server/contratos";
import { fecharCompetencia } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { cancelarReserva, criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade, definirHorarios } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";

// Contrato unificado: o contrato do profissional é a versão do acordo financeiro, com código,
// prazo de cancelamento, multa de turno fixo, termos e grade fixa que gera as reservas.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const TERCA = 2;

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let outroEspaco: ContextoTenant;
let sala: string;
let sala2: string;
const prof: Record<"ana" | "bia" | "caio" | "duda", string> = { ana: "", bia: "", caio: "", duda: "" };
let anaCtx: ContextoTenant;

async function reservasDaRegra(acordoId: string) {
  return withTenant(
    admin,
    (tx) =>
      tx
        .select({ id: reservasSala.id, status: reservasSala.status, data: reservasSala.dataOcorrencia, canceladaPor: reservasSala.canceladaPor })
        .from(reservasSala)
        .innerJoin(regrasRecorrencia, eq(regrasRecorrencia.id, reservasSala.recorrenciaId))
        .where(eq(regrasRecorrencia.acordoId, acordoId)),
    db,
  );
}

async function lancamentosDe(profissionalId: string) {
  return withTenant(admin, (tx) => tx.select().from(lancamentos).where(eq(lancamentos.profissionalId, profissionalId)), db);
}

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Contratos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Contratos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  recepcao = { ...admin, role: "recepcao" };
  const outroId = await criarUsuario(db, "Admin Outro");
  const { tenantId: t2 } = await criarTenantComAdmin(outroId, { nomeTenant: "Outro Espaço", documento: "529.982.247-25" }, db);
  outroEspaco = { tenantId: t2, userId: outroId, role: "admin" };

  const { id: unidade } = await criarUnidade(admin, { nome: "Centro", endereco: "Rua A, 1" }, db);
  await definirHorarios(admin, unidade, [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, abre: "06:00", fecha: "22:00" })), db);
  ({ id: sala } = await criarSala(admin, unidade, { nome: "Sala 1" }, db));
  ({ id: sala2 } = await criarSala(admin, unidade, { nome: "Sala 2" }, db));
  for (const nome of ["ana", "bia", "caio", "duda"] as const) {
    ({ id: prof[nome] } = await criarProfissional(admin, { nome: `Dra. ${nome}`, email: `${nome}.${randomUUID()}@teste.dev` }, db));
  }
  // Ana tem login (para o "meu contrato").
  const anaUser = await criarUsuario(db, "Ana Profissional");
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId: anaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, prof.ana));
    },
    db,
  );
  anaCtx = { tenantId, userId: anaUser, role: "profissional" };
});

afterAll(async () => {
  await db?.$client.end();
});

describe("criação com grade fixa", () => {
  let contratoAna: string;

  it("gera código, reserva as datas da grade e descreve as condições", async () => {
    // A Bia já ocupa a Sala 1 numa terça: essa data entra como conflito (sem "adotar" a reserva dela).
    await criarReserva(admin, { salaId: sala, profissionalId: prof.bia, data: "2030-03-12", horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    const r = await criarContrato(
      admin,
      { profissionalId: prof.ana, modelo: "hora", valorHoraCentavos: 4000, multaCancelamentoReservaBp: 5000, prazoCancelamentoHoras: 48, vigenteDe: "2030-03-01" },
      { grade: { salaId: sala, itens: [{ diaSemana: TERCA, horaInicio: "08:00", horaFim: "12:00" }] }, agora: AGORA },
      db,
    );
    contratoAna = r.id;
    expect(r.codigo).toBe("CTR-2030-0001");
    expect(r.datasEmConflito.join()).toContain("2030-03-12");
    expect(r.reservasCriadas).toBeGreaterThanOrEqual(6);

    const d = await obterContrato(admin, r.id, AGORA, db);
    expect(d.grade).toEqual([expect.objectContaining({ diaSemana: TERCA, horaInicio: "08:00", horaFim: "12:00", salaNome: "Sala 1" })]);
    expect(d.condicoes.join(" ")).toMatch(/por hora reservada.*Cancelamento sem custo até 48h antes.*50/);
    expect(d.situacao).toBe("vigente");

    const daBia = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.profissionalId, prof.bia)), db);
    expect(daBia[0].recorrenciaId).toBeNull();
  });

  it("reajuste mantém a grade e encerra a versão anterior na véspera", async () => {
    const r = await criarContrato(admin, { profissionalId: prof.ana, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: "2030-04-01" }, { agora: AGORA }, db);
    expect(r.codigo).toBe("CTR-2030-0002");
    const antiga = await obterContrato(admin, contratoAna, AGORA, db);
    expect(antiga.contrato.vigenteAte).toBe("2030-03-31");
    expect(antiga.grade).toEqual([]);
    const nova = await obterContrato(admin, r.id, AGORA, db);
    expect(nova.grade).toHaveLength(1);
    expect(nova.versoes.map((v) => v.codigo)).toEqual(["CTR-2030-0002", "CTR-2030-0001"]);
    contratoAna = r.id;
  });

  it("trocar a grade libera as datas antigas sem pacientes e reserva as novas", async () => {
    const r = await criarContrato(
      admin,
      { profissionalId: prof.ana, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: "2030-05-01" },
      { grade: { salaId: sala2, itens: [{ diaSemana: 4, horaInicio: "14:00", horaFim: "18:00" }] }, agora: AGORA },
      db,
    );
    const antigas = await reservasDaRegra(contratoAna);
    expect(antigas.filter((x) => x.data! >= "2030-05-01").every((x) => x.status === "cancelada" && x.canceladaPor === "espaco")).toBe(true);
    expect((await obterContrato(admin, r.id, AGORA, db)).grade[0]).toMatchObject({ diaSemana: 4, salaNome: "Sala 2" });
  });

  it("o banco recusa duas versões no mesmo período", async () => {
    await expect(
      criarContrato(admin, { profissionalId: prof.ana, modelo: "consulta", valorConsultaCentavos: 3000, vigenteDe: "2030-04-15", vigenteAte: "2030-04-20" }, {}, db),
    ).rejects.toThrow("Já existe um contrato");
  });
});

describe("permissões e isolamento", () => {
  it("recepção consulta mas não cria; o profissional só vê os próprios", async () => {
    await expect(criarContrato(recepcao, { profissionalId: prof.bia, modelo: "hora", valorHoraCentavos: 1, vigenteDe: "2030-03-01" }, {}, db)).rejects.toThrow();
    expect((await listarContratos(recepcao, {}, AGORA, db)).length).toBeGreaterThan(0);
    const meus = await listarContratos(anaCtx, {}, AGORA, db);
    expect(new Set(meus.map((c) => c.profissionalId))).toEqual(new Set([prof.ana]));
  });

  it("outro espaço não vê os contratos", async () => {
    expect(await listarContratos(outroEspaco, {}, AGORA, db)).toEqual([]);
  });
});

describe("cancelamentos e cobrança", () => {
  it("turno fixo por hora: profissional que cancela tarde paga a multa; o espaço, não; com antecedência, ninguém", async () => {
    const r = await criarContrato(
      admin,
      { profissionalId: prof.caio, modelo: "hora", valorHoraCentavos: 4000, multaCancelamentoReservaBp: 5000, prazoCancelamentoHoras: 24, vigenteDe: "2030-03-01" },
      { grade: { salaId: sala2, itens: [{ diaSemana: TERCA, horaInicio: "08:00", horaFim: "12:00" }] }, agora: AGORA },
      db,
    );
    const datas = (await reservasDaRegra(r.id)).sort((a, b) => a.data!.localeCompare(b.data!));
    // Terça 05/03 08:00 (SP) = 11:00Z: às 14:00Z de segunda faltam 21h (dentro do prazo de 24h).
    await cancelarReserva(admin, datas[0].id, "pedido do Caio", new Date("2030-03-04T14:00:00Z"), db, "profissional");
    await cancelarReserva(admin, datas[1].id, "sala em manutenção", new Date("2030-03-11T14:00:00Z"), db, "espaco");
    await cancelarReserva(admin, datas[2].id, "com antecedência", new Date("2030-03-10T10:00:00Z"), db, "profissional");
    const multas = (await lancamentosDe(prof.caio)).filter((l) => l.tipo === "multa_cancelamento");
    expect(multas.map((l) => l.valorCentavos)).toEqual([8000]); // 4h × R$ 40 × 50%
  });

  it("consulta cancelada tarde: cobra se foi o paciente; se foi o espaço, não", async () => {
    await criarContrato(
      admin,
      { profissionalId: prof.bia, modelo: "consulta", valorConsultaCentavos: 3000, regraFalta: "integral", prazoCancelamentoHoras: 24, vigenteDe: "2030-03-01" },
      {},
      db,
    );
    const { id: paciente } = await criarPaciente(admin, { nome: "Paciente Teste" }, AGORA, db);
    await criarReserva(admin, { salaId: sala2, profissionalId: prof.bia, data: "2030-03-06", horaInicio: "08:00", horaFim: "12:00" }, AGORA, db);
    const a1 = await criarAgendamento(admin, { pacienteId: paciente, profissionalId: prof.bia, data: "2030-03-06", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
    const a2 = await criarAgendamento(admin, { pacienteId: paciente, profissionalId: prof.bia, data: "2030-03-06", horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    const tarde = new Date("2030-03-05T20:00:00Z");
    expect((await alterarStatusAgendamento(admin, a1.id, "cancelado", null, tarde, db, "paciente")).cancelamentoTardio).toBe(true);
    await alterarStatusAgendamento(admin, a2.id, "cancelado", null, tarde, db, "espaco");
    const faltas = (await lancamentosDe(prof.bia)).filter((l) => l.tipo === "falta");
    expect(faltas.map((l) => l.valorCentavos)).toEqual([3000]);
  });

  it("turno fixo mensal: a mensalidade cobre a grade e as avulsas fora dela pagam a hora", async () => {
    await criarContrato(
      admin,
      { profissionalId: prof.duda, modelo: "mensalidade", mensalidadeCentavos: 150000, horasIncluidas: null, valorHoraCentavos: 5000, vigenteDe: "2030-03-01" },
      { grade: { salaId: sala, itens: [{ diaSemana: 3, horaInicio: "13:00", horaFim: "17:00" }] }, agora: AGORA },
      db,
    );
    await criarReserva(admin, { salaId: sala2, profissionalId: prof.duda, data: "2030-03-07", horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
    await fecharCompetencia(admin, prof.duda, "2030-03", new Date("2030-04-02T12:00:00Z"), db);
    const doMes = (await lancamentosDe(prof.duda)).filter((l) => l.competencia === "2030-03-01");
    expect(doMes.map((l) => `${l.tipo}:${l.valorCentavos}`).sort()).toEqual(["excedente_horas:10000", "mensalidade:150000"]);
  });
});

describe("encerramento", () => {
  it("encerra na data e libera a grade a partir do dia seguinte", async () => {
    const [aberto] = (await listarContratos(admin, { profissionalId: prof.caio }, AGORA, db)).filter((c) => c.situacao === "vigente");
    const r = await encerrarContrato(admin, aberto.id, "2030-03-20", AGORA, db);
    expect(r.reservasLiberadas).toBeGreaterThan(0);
    const d = await obterContrato(admin, aberto.id, AGORA, db);
    expect(d.contrato.vigenteAte).toBe("2030-03-20");
    const restantes = await withTenant(
      admin,
      (tx) => tx.select().from(reservasSala).where(and(eq(reservasSala.profissionalId, prof.caio), eq(reservasSala.status, "ativa"))),
      db,
    );
    expect(restantes.every((x) => (x.dataOcorrencia ?? "") <= "2030-03-20")).toBe(true);
    await expect(encerrarContrato(admin, aberto.id, "2030-03-25", AGORA, db)).rejects.toThrow("já termina");
  });
});
