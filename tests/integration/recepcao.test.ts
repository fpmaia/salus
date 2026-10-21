import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { agendamentos, lancamentos, listaEspera, memberships, notificacoesOutbox, profissionais, reservasSala } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { ErroAgendamento } from "../../src/domain/agendamentos";
import { ErroPermissao } from "../../src/domain/rbac";
import { ErroReserva } from "../../src/domain/reservas";
import { alterarStatusAgendamento, criarAgendamento, desfazerStatus, remarcarAgendamento } from "../../src/server/agendamentos";
import { criarContrato } from "../../src/server/contratos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { adicionarNaEspera, listarEspera, removerDaEspera, sugestoesDaEspera } from "../../src/server/lista-espera";
import { buscarPacientes, criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Ferramentas da recepção: remarcar (nunca cobra), desfazer status (equipe, até 24h) e a
// liberação da reserva criada sozinha pelo agendamento.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const TER = "2030-03-05";
const QUA = "2030-03-06";
const horasDepois = (base: Date, horas: number) => new Date(base.getTime() + horas * 3_600_000);

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let ana: ContextoTenant;
let anaId: string;
let sala1: string;
let sala2: string;
let joao: string;
let maria: string;

async function codigoDe(promessa: Promise<unknown>): Promise<string | undefined> {
  const erro = await capturarErro(promessa);
  if (erro instanceof ErroAgendamento || erro instanceof ErroReserva) return erro.codigo;
  throw erro;
}

const agendamento = (id: string) =>
  withTenant(admin, async (tx) => (await tx.select().from(agendamentos).where(eq(agendamentos.id, id)))[0], db);
const reserva = (id: string) =>
  withTenant(admin, async (tx) => (await tx.select().from(reservasSala).where(eq(reservasSala.id, id)))[0], db);
const saldoDaOrigem = (origem: string) =>
  withTenant(
    admin,
    async (tx) => {
      const [{ saldo }] = await tx
        .select({ saldo: sql<number>`coalesce(sum(case when ${lancamentos.natureza} = 'debito' then ${lancamentos.valorCentavos} else -${lancamentos.valorCentavos} end), 0)::int` })
        .from(lancamentos)
        .where(eq(lancamentos.origem, origem));
      return saldo;
    },
    db,
  );

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Recepcao");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Recepção", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const recepcaoId = await criarUsuario(db, "Recepcao Ferramentas");
  const anaUserId = await criarUsuario(db, "Ana Ferramentas");
  ({ id: anaId } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
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

  const { id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db);
  ({ id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  ({ id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db));
  ({ id: joao } = await criarPaciente(recepcao, { nome: "João Recepção" }, AGORA, db));
  ({ id: maria } = await criarPaciente(recepcao, { nome: "Maria Recepção" }, AGORA, db));
  // R$ 30 por consulta; falta e cancelamento tardio cobram integral; prazo de 24h.
  await criarContrato(
    admin,
    { profissionalId: anaId, modelo: "consulta", valorConsultaCentavos: 3000, regraFalta: "integral", prazoCancelamentoHoras: 24, vigenteDe: "2030-03-01" },
    { agora: AGORA },
    db,
  );
});

afterAll(async () => {
  await db?.$client.end();
});

describe("remarcar", () => {
  it("move para outro dia e sala, volta a agendado e libera a reserva automática antiga", async () => {
    const criado = await criarAgendamento(recepcao, { pacienteId: joao, profissionalId: anaId, salaId: sala1, data: TER, horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    expect(criado.reservaCriada).toBe(true);
    expect((await reserva(criado.reservaId)).criadaPeloAgendamento).toBe(true);
    await alterarStatusAgendamento(recepcao, criado.id, "confirmado", null, AGORA, db);
    await withTenant(
      admin,
      (tx) =>
        tx.insert(notificacoesOutbox).values({
          tipo: "lembrete_agendamento",
          destinatario: "+5511999990000",
          agendamentoId: criado.id,
          agendarPara: AGORA,
          parametros: {},
          idempotencyKey: `teste:${criado.id}`,
        }),
      db,
    );

    const novo = await remarcarAgendamento(recepcao, criado.id, { data: QUA, horaInicio: "15:00", horaFim: "16:00", salaId: sala2 }, AGORA, db);
    expect(novo.reservaCriada).toBe(true);
    const depois = await agendamento(criado.id);
    expect(depois).toMatchObject({ status: "agendado", reservaId: novo.reservaId, statusAnterior: null });
    expect(depois.remarcadoEm?.toISOString()).toBe(AGORA.toISOString());
    expect(depois.periodo.inicio.toISOString()).toBe("2030-03-06T18:00:00.000Z");
    expect(await reserva(criado.reservaId)).toMatchObject({ status: "cancelada", canceladaPor: "espaco" });
    const [lembrete] = await withTenant(admin, (tx) => tx.select().from(notificacoesOutbox).where(eq(notificacoesOutbox.agendamentoId, criado.id)), db);
    expect(lembrete.status).toBe("cancelado");
    // Remarcar nunca cobra.
    expect(await saldoDaOrigem(`agendamento:${criado.id}`)).toBe(0);
    expect(await saldoDaOrigem(`reserva:${criado.reservaId}`)).toBe(0);
  });

  it("sem sala informada, fica na mesma sala; reserva manual não é liberada", async () => {
    const manual = await criarReserva(admin, { salaId: sala1, profissionalId: anaId, data: TER, horaInicio: "13:00", horaFim: "15:00" }, AGORA, db);
    const { id } = await criarAgendamento(recepcao, { pacienteId: maria, reservaId: manual.id, data: TER, horaInicio: "13:00", horaFim: "14:00" }, AGORA, db);
    // Dentro da mesma reserva: só muda o horário.
    expect((await remarcarAgendamento(recepcao, id, { data: TER, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db)).reservaId).toBe(manual.id);
    // Para fora dela: nova reserva na mesma sala e a manual continua ativa.
    const fora = await remarcarAgendamento(ana, id, { data: TER, horaInicio: "16:00", horaFim: "17:00" }, AGORA, db);
    expect(fora.reservaCriada).toBe(true);
    expect((await reserva(fora.reservaId)).salaId).toBe(sala1);
    expect((await reserva(manual.id)).status).toBe("ativa");
  });

  it("recusa atendimento já encerrado e horário no passado", async () => {
    const { id } = await criarAgendamento(recepcao, { pacienteId: maria, profissionalId: anaId, salaId: sala2, data: TER, horaInicio: "10:00", horaFim: "11:00" }, AGORA, db);
    expect(await codigoDe(remarcarAgendamento(recepcao, id, { data: "2030-03-01", horaInicio: "10:00", horaFim: "11:00" }, AGORA, db))).toBe("no_passado");
    await alterarStatusAgendamento(recepcao, id, "falta", null, new Date("2030-03-05T13:30:00Z"), db);
    expect(await codigoDe(remarcarAgendamento(recepcao, id, { data: QUA, horaInicio: "10:00", horaFim: "11:00" }, AGORA, db))).toBe("transicao_invalida");
  });
});

describe("cancelar libera a reserva automática", () => {
  it("cancelado com antecedência: a sala fica livre", async () => {
    const { id, reservaId } = await criarAgendamento(recepcao, { pacienteId: joao, profissionalId: anaId, salaId: sala2, data: QUA, horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    expect(await alterarStatusAgendamento(recepcao, id, "cancelado", null, AGORA, db, "paciente")).toEqual({ cancelamentoTardio: false });
    expect((await reserva(reservaId)).status).toBe("cancelada");
  });

  it("cancelado tarde pelo paciente: a reserva fica e a falta é cobrada", async () => {
    const { id, reservaId } = await criarAgendamento(recepcao, { pacienteId: joao, profissionalId: anaId, salaId: sala2, data: TER, horaInicio: "15:00", horaFim: "16:00" }, AGORA, db);
    expect(await alterarStatusAgendamento(recepcao, id, "cancelado", null, new Date("2030-03-05T12:00:00Z"), db, "paciente")).toEqual({ cancelamentoTardio: true });
    expect((await reserva(reservaId)).status).toBe("ativa");
    expect(await saldoDaOrigem(`agendamento:${id}`)).toBe(3000);
  });

  it("cancelado tarde pelo espaço: libera e não cobra", async () => {
    const { id, reservaId } = await criarAgendamento(recepcao, { pacienteId: maria, profissionalId: anaId, salaId: sala2, data: TER, horaInicio: "17:00", horaFim: "18:00" }, AGORA, db);
    await alterarStatusAgendamento(recepcao, id, "cancelado", null, AGORA, db, "espaco");
    expect((await reserva(reservaId)).status).toBe("cancelada");
    expect(await saldoDaOrigem(`agendamento:${id}`)).toBe(0);
  });
});

describe("desfazer status", () => {
  it("desfaz uma falta registrada por engano e estorna a cobrança", async () => {
    const { id } = await criarAgendamento(recepcao, { pacienteId: joao, profissionalId: anaId, salaId: sala1, data: TER, horaInicio: "11:00", horaFim: "12:00" }, AGORA, db);
    const depois = new Date("2030-03-05T14:10:00Z");
    await alterarStatusAgendamento(recepcao, id, "falta", null, depois, db);
    expect(await saldoDaOrigem(`agendamento:${id}`)).toBe(3000);

    expect(await desfazerStatus(recepcao, id, horasDepois(depois, 1), db)).toEqual({ status: "agendado" });
    expect(await agendamento(id)).toMatchObject({ status: "agendado", statusAnterior: null });
    expect(await saldoDaOrigem(`agendamento:${id}`)).toBe(0);
    // Só uma vez: o status anterior foi consumido.
    expect(await codigoDe(desfazerStatus(recepcao, id, horasDepois(depois, 1), db))).toBe("nao_permitido");
    // E o fluxo segue normal.
    await alterarStatusAgendamento(recepcao, id, "presente", null, depois, db);
  });

  it("desfaz um cancelamento: limpa os dados, reativa a reserva liberada e devolve o lembrete", async () => {
    const { id, reservaId } = await criarAgendamento(recepcao, { pacienteId: maria, profissionalId: anaId, salaId: sala1, data: QUA, horaInicio: "11:00", horaFim: "12:00" }, AGORA, db);
    await withTenant(
      admin,
      (tx) =>
        tx.insert(notificacoesOutbox).values({
          tipo: "lembrete_agendamento",
          destinatario: "+5511999990001",
          agendamentoId: id,
          agendarPara: AGORA,
          parametros: {},
          idempotencyKey: `teste:${id}`,
        }),
      db,
    );
    await alterarStatusAgendamento(recepcao, id, "cancelado", "Engano", AGORA, db, "paciente");
    expect((await reserva(reservaId)).status).toBe("cancelada");

    await desfazerStatus(admin, id, horasDepois(AGORA, 2), db);
    expect(await agendamento(id)).toMatchObject({ status: "agendado", canceladoEm: null, canceladoPor: null, motivoCancelamento: null, cancelamentoTardio: false });
    expect(await reserva(reservaId)).toMatchObject({ status: "ativa", canceladaEm: null, motivoCancelamento: null });
    const [lembrete] = await withTenant(admin, (tx) => tx.select().from(notificacoesOutbox).where(eq(notificacoesOutbox.agendamentoId, id)), db);
    expect(lembrete.status).toBe("pendente");
  });

  it("não reativa se outra pessoa ocupou a sala", async () => {
    const { id } = await criarAgendamento(recepcao, { pacienteId: joao, profissionalId: anaId, salaId: sala2, data: QUA, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db);
    await alterarStatusAgendamento(recepcao, id, "cancelado", null, AGORA, db, "paciente");
    const { id: betoId } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db);
    await criarReserva(admin, { salaId: sala2, profissionalId: betoId, data: QUA, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db);
    expect(await codigoDe(desfazerStatus(recepcao, id, AGORA, db))).toBe("sala_ocupada");
    expect((await agendamento(id)).status).toBe("cancelado");
  });

  it("só a equipe, e só até 24h depois", async () => {
    const { id } = await criarAgendamento(recepcao, { pacienteId: maria, profissionalId: anaId, salaId: sala2, data: QUA, horaInicio: "16:00", horaFim: "17:00" }, AGORA, db);
    await alterarStatusAgendamento(recepcao, id, "confirmado", null, AGORA, db);
    expect(await capturarErro(desfazerStatus(ana, id, AGORA, db))).toBeInstanceOf(ErroPermissao);
    expect(await codigoDe(desfazerStatus(recepcao, id, horasDepois(AGORA, 25), db))).toBe("nao_permitido");
    expect(await desfazerStatus(recepcao, id, horasDepois(AGORA, 23), db)).toEqual({ status: "agendado" });
  });
});

describe("busca de pacientes", () => {
  it("pagina com o total e acha telefone pelos dígitos, ignorando a formatação", async () => {
    for (let i = 1; i <= 5; i++) await criarPaciente(recepcao, { nome: `Paginado ${i}`, telefone: `(21) 98888-000${i}` }, AGORA, db);
    const p1 = await buscarPacientes(recepcao, { busca: "Paginado", porPagina: 2 }, db);
    expect(p1).toMatchObject({ total: 5, paginas: 3, pagina: 1 });
    expect(p1.itens.map((p) => p.nome)).toEqual(["Paginado 1", "Paginado 2"]);
    const p3 = await buscarPacientes(recepcao, { busca: "Paginado", porPagina: 2, pagina: 3 }, db);
    expect(p3.itens.map((p) => p.nome)).toEqual(["Paginado 5"]);
    expect((await buscarPacientes(recepcao, { busca: "21988880003" }, db)).itens.map((p) => p.nome)).toEqual(["Paginado 3"]);
    expect((await buscarPacientes(recepcao, { busca: "98888-0004" }, db)).itens.map((p) => p.nome)).toEqual(["Paginado 4"]);
  });
});

describe("lista de espera", () => {
  it("sugere quem espera pelo profissional (e por qualquer um) e sai da lista ao agendar", async () => {
    const { id: carla } = await criarPaciente(recepcao, { nome: "Carla Espera" }, AGORA, db);
    const { id: davi } = await criarPaciente(recepcao, { nome: "Davi Espera" }, AGORA, db);
    await adicionarNaEspera(recepcao, { pacienteId: carla, profissionalId: anaId, preferencia: "manhãs" }, db);
    await adicionarNaEspera(recepcao, { pacienteId: davi }, db);
    await expect(adicionarNaEspera(recepcao, { pacienteId: carla, profissionalId: anaId }, db)).rejects.toThrow("já está na lista");
    expect(await capturarErro(adicionarNaEspera(ana, { pacienteId: davi }, db))).toBeInstanceOf(ErroPermissao);

    const sugestoes = await sugestoesDaEspera(recepcao, [anaId], 3, db);
    expect(sugestoes.get(anaId)?.map((i) => i.pacienteNome)).toEqual(["Carla Espera", "Davi Espera"]);

    const { id } = await criarAgendamento(recepcao, { pacienteId: carla, profissionalId: anaId, salaId: sala1, data: "2030-03-07", horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
    const restantes = await listarEspera(recepcao, db);
    expect(restantes.map((i) => i.pacienteNome)).toEqual(["Davi Espera"]);
    const [baixado] = await withTenant(admin, (tx) => tx.select().from(listaEspera).where(eq(listaEspera.pacienteId, carla)), db);
    expect(baixado).toMatchObject({ status: "agendado", agendamentoId: id });

    await removerDaEspera(recepcao, restantes[0].id, db);
    expect(await listarEspera(recepcao, db)).toEqual([]);
  });
});
