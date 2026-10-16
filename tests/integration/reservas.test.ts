import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { auditLog, memberships, regrasRecorrencia, reservasSala, users } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { ErroReserva } from "../../src/domain/reservas";
import { ErroNegocio } from "../../src/server/erros";
import { aceitarConvite, criarProfissional, gerarConvite, obterConvite } from "../../src/server/profissionais";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import {
  cancelarReserva,
  concluirReservasPassadas,
  criarRecorrencia,
  criarReserva,
  encerrarRecorrencia,
  listarAgenda,
  materializarRecorrencias,
} from "../../src/server/reservas";
import { adicionarFeriado, criarSala, criarUnidade, definirHorarios } from "../../src/server/unidades";
import { capturarErro, codigoPg, criarDbApp, criarUsuario } from "./helpers";

// Critérios de pronto da Fase 1:
// - duas reservas sobrepostas na mesma sala são rejeitadas pelo banco;
// - reserva fora do horário de funcionamento ou em feriado é recusada;
// - recorrência semanal materializa as próximas semanas.

// Segunda-feira, 07:00 em São Paulo. Datas fixas no futuro deixam o teste determinístico.
const AGORA = new Date("2030-03-04T10:00:00Z");
const SEG = "2030-03-04";
const TER = "2030-03-05";

let db: Database;
let admin: ContextoTenant;
let adminB: ContextoTenant;
let profissionalCtx: ContextoTenant;
let unidadeId: string;
let sala1: string;
let sala2: string;
let salaB: string;
let draAna: string;
let drBeto: string;

async function criarUsuarioComEmail(email: string, nome: string): Promise<string> {
  const [u] = await db.insert(users).values({ name: nome, email }).returning({ id: users.id });
  return u.id;
}

async function codigoReserva(promessa: Promise<unknown>): Promise<string | undefined> {
  const erro = await capturarErro(promessa);
  if (erro instanceof ErroReserva) return erro.codigo;
  throw erro;
}

beforeAll(async () => {
  db = criarDbApp();

  const adminId = await criarUsuario(db, "Admin Reservas");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Reservas", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };

  const adminBId = await criarUsuario(db, "Admin Outro");
  const { tenantId: tenantB } = await criarTenantComAdmin(adminBId, { nomeTenant: "Outro Espaço", documento: "529.982.247-25" }, db);
  adminB = { tenantId: tenantB, userId: adminBId, role: "admin" };

  ({ id: unidadeId } = await criarUnidade(admin, { nome: "Centro", timezone: "America/Sao_Paulo", slotMinutos: 30 }, db));
  // Seg–sex 08–12 e 14–18.
  await definirHorarios(
    admin,
    unidadeId,
    [1, 2, 3, 4, 5].flatMap((diaSemana) => [
      { diaSemana, abre: "08:00", fecha: "12:00" },
      { diaSemana, abre: "14:00", fecha: "18:00" },
    ]),
    db,
  );
  ({ id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1", recursos: ["Maca", "Pia"] }, db));
  ({ id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db));

  const { id: unidadeB } = await criarUnidade(adminB, { nome: "Beta" }, db);
  ({ id: salaB } = await criarSala(adminB, unidadeB, { nome: "Sala B" }, db));

  ({ id: draAna } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
  ({ id: drBeto } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("reserva avulsa", () => {
  it("cria reserva dentro do horário", async () => {
    const { id } = await criarReserva(admin, { salaId: sala1, profissionalId: draAna, data: SEG, horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
    const [linha] = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.id, id)), db);
    expect(linha.periodo.inicio.toISOString()).toBe("2030-03-04T11:00:00.000Z");
    expect(linha.periodo.fim.toISOString()).toBe("2030-03-04T13:00:00.000Z");
    expect(linha.criadoPor).toBe(admin.userId);
  });

  it("rejeita sobreposição na mesma sala", async () => {
    expect(
      await codigoReserva(criarReserva(admin, { salaId: sala1, profissionalId: drBeto, data: SEG, horaInicio: "09:30", horaFim: "11:00" }, AGORA, db)),
    ).toBe("conflito_sala");
  });

  it("o banco barra a sobreposição mesmo sem passar pelo serviço", async () => {
    const erro = await capturarErro(
      withTenant(
        admin,
        (tx) =>
          tx.insert(reservasSala).values({
            salaId: sala1,
            profissionalId: drBeto,
            periodo: { inicio: new Date("2030-03-04T12:00:00Z"), fim: new Date("2030-03-04T12:30:00Z") },
          }),
        db,
      ),
    );
    expect(codigoPg(erro)).toBe("23P01");
  });

  it("encostar no fim da outra reserva não é conflito (intervalo semiaberto)", async () => {
    await criarReserva(admin, { salaId: sala1, profissionalId: drBeto, data: SEG, horaInicio: "10:00", horaFim: "11:00" }, AGORA, db);
  });

  it("rejeita o mesmo profissional em duas salas ao mesmo tempo", async () => {
    expect(
      await codigoReserva(criarReserva(admin, { salaId: sala2, profissionalId: draAna, data: SEG, horaInicio: "09:00", horaFim: "09:30" }, AGORA, db)),
    ).toBe("conflito_profissional");
  });

  it("reserva cancelada libera o horário", async () => {
    const { id } = await criarReserva(admin, { salaId: sala2, profissionalId: drBeto, data: SEG, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db);
    await cancelarReserva(admin, id, "Teste", AGORA, db);
    await criarReserva(admin, { salaId: sala2, profissionalId: draAna, data: SEG, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db);
  });

  it.each([
    [{ data: SEG, horaInicio: "12:00", horaFim: "13:00" }, "fora_do_horario"],
    [{ data: "2030-03-03", horaInicio: "08:00", horaFim: "09:00" }, "fora_do_horario"], // domingo
    [{ data: SEG, horaInicio: "15:15", horaFim: "16:00" }, "fora_do_slot"],
    [{ data: "2030-03-01", horaInicio: "08:00", horaFim: "09:00" }, "no_passado"],
  ])("recusa %o com %s", async (janela, esperado) => {
    expect(await codigoReserva(criarReserva(admin, { salaId: sala2, profissionalId: drBeto, ...janela }, AGORA, db))).toBe(esperado);
  });

  it("recusa reserva em feriado", async () => {
    await adicionarFeriado(admin, { unidadeId, data: "2030-03-06", descricao: "Feriado municipal" }, db);
    expect(
      await codigoReserva(criarReserva(admin, { salaId: sala2, profissionalId: drBeto, data: "2030-03-06", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db)),
    ).toBe("feriado");
  });

  it("um tenant não consegue reservar a sala de outro (FK composta)", async () => {
    expect(
      await codigoReserva(criarReserva(admin, { salaId: salaB, profissionalId: draAna, data: SEG, horaInicio: "16:00", horaFim: "17:00" }, AGORA, db)),
    ).toBe("nao_encontrada");
    const erro = await capturarErro(
      withTenant(
        admin,
        (tx) =>
          tx.insert(reservasSala).values({
            salaId: salaB,
            profissionalId: draAna,
            periodo: { inicio: new Date("2030-03-04T19:00:00Z"), fim: new Date("2030-03-04T20:00:00Z") },
          }),
        db,
      ),
    );
    expect(codigoPg(erro)).toBe("23503");
  });
});

describe("recorrência", () => {
  it("materializa as próximas 8 semanas", async () => {
    const { id, ocorrencias } = await criarRecorrencia(
      admin,
      { salaId: sala2, profissionalId: draAna, dataInicio: TER, horaInicio: "08:00", horaFim: "12:00" },
      AGORA,
      db,
    );
    // Terças de 05/03 até o limite da janela (04/03 + 56 dias = 29/04): 8 ocorrências.
    expect(ocorrencias).toBe(8);
    const linhas = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.recorrenciaId, id)), db);
    expect(linhas.map((l) => l.dataOcorrencia).sort()).toEqual([
      "2030-03-05", "2030-03-12", "2030-03-19", "2030-03-26", "2030-04-02", "2030-04-09", "2030-04-16", "2030-04-23",
    ]);
  });

  it("conflito em qualquer ocorrência não grava nada", async () => {
    // Beto já ocupa a sala 1 numa quarta específica.
    await criarReserva(admin, { salaId: sala1, profissionalId: drBeto, data: "2030-03-20", horaInicio: "15:00", horaFim: "16:00" }, AGORA, db);
    const erro = await capturarErro(
      criarRecorrencia(admin, { salaId: sala1, profissionalId: draAna, dataInicio: "2030-03-13", horaInicio: "14:00", horaFim: "18:00" }, AGORA, db),
    );
    expect(erro).toBeInstanceOf(ErroReserva);
    expect((erro as ErroReserva).codigo).toBe("conflito_recorrencia");
    expect((erro as ErroReserva).detalhes).toEqual({ datas: ["2030-03-20"] });

    const regras = await withTenant(admin, (tx) => tx.select().from(regrasRecorrencia).where(eq(regrasRecorrencia.horaInicio, "14:00:00")), db);
    expect(regras).toEqual([]);
  });

  it("pula feriados", async () => {
    // Quarta 06/03 é feriado (teste anterior).
    const { ocorrencias } = await criarRecorrencia(
      admin,
      { salaId: sala2, profissionalId: drBeto, dataInicio: "2030-03-06", dataFim: "2030-03-13", horaInicio: "16:00", horaFim: "17:00" },
      AGORA,
      db,
    );
    expect(ocorrencias).toBe(1);
  });

  it("o worker estende a janela quando o tempo passa", async () => {
    const umaSemanaDepois = new Date(AGORA.getTime() + 7 * 86_400_000);
    const resultado = await withSistema(admin.tenantId, (tx) => materializarRecorrencias(tx, umaSemanaDepois), db);
    expect(resultado.criadas).toBe(1); // terça 30/04
    // Rodar de novo é idempotente.
    const repetido = await withSistema(admin.tenantId, (tx) => materializarRecorrencias(tx, umaSemanaDepois), db);
    expect(repetido).toEqual({ criadas: 0, conflitos: 0 });
  });

  it("cancelar uma ocorrência não faz o worker recriá-la", async () => {
    const [ocorrencia] = await withTenant(
      admin,
      (tx) => tx.select().from(reservasSala).where(and(eq(reservasSala.dataOcorrencia, "2030-03-12"), eq(reservasSala.salaId, sala2))),
      db,
    );
    await cancelarReserva(admin, ocorrencia.id, null, AGORA, db);
    const [regra] = await withTenant(admin, (tx) => tx.select().from(regrasRecorrencia).where(eq(regrasRecorrencia.id, ocorrencia.recorrenciaId!)), db);
    await withTenant(admin, (tx) => tx.update(regrasRecorrencia).set({ materializadaAte: null }).where(eq(regrasRecorrencia.id, regra.id)), db);
    await withSistema(admin.tenantId, (tx) => materializarRecorrencias(tx, AGORA), db);
    const [depois] = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.id, ocorrencia.id)), db);
    expect(depois.status).toBe("cancelada");
  });

  it("encerrar a série cancela as ocorrências futuras", async () => {
    const [regra] = await withTenant(
      admin,
      (tx) => tx.select().from(regrasRecorrencia).where(and(eq(regrasRecorrencia.salaId, sala2), eq(regrasRecorrencia.horaInicio, "08:00:00"))),
      db,
    );
    const { canceladas } = await encerrarRecorrencia(admin, regra.id, "2030-04-01", AGORA, db);
    expect(canceladas).toBe(5); // 02/04, 09/04, 16/04, 23/04, 30/04
    const ativas = await withTenant(
      admin,
      (tx) => tx.select().from(reservasSala).where(and(eq(reservasSala.recorrenciaId, regra.id), eq(reservasSala.status, "ativa"))),
      db,
    );
    expect(ativas.map((a) => a.dataOcorrencia).sort()).toEqual(["2030-03-05", "2030-03-19", "2030-03-26"]);
  });
});

describe("worker", () => {
  it("conclui reservas que já terminaram", async () => {
    const depois = new Date("2030-03-04T21:00:00Z"); // 18:00 em São Paulo
    const total = await withSistema(admin.tenantId, (tx) => concluirReservasPassadas(tx, depois), db);
    expect(total).toBeGreaterThan(0);
    const restantes = await withTenant(
      admin,
      (tx) =>
        tx
          .select()
          .from(reservasSala)
          .where(and(eq(reservasSala.status, "ativa"), sql`upper(${reservasSala.periodo}) <= ${depois.toISOString()}::timestamptz`)),
      db,
    );
    expect(restantes).toEqual([]);
  });
});

describe("convite e visão do profissional", () => {
  let emailCarla: string;
  let token: string;

  it("gera convite e mostra os dados no link público", async () => {
    emailCarla = `carla.${randomUUID()}@teste.dev`;
    const { id } = await criarProfissional(admin, { nome: "Dra. Carla", email: emailCarla, conselho: "CRP" }, db);
    ({ token } = await gerarConvite(admin, id, new Date(), db));
    expect(await obterConvite(token, db)).toEqual({
      tenantNome: "Coworking Reservas",
      profissionalNome: "Dra. Carla",
      email: emailCarla,
      situacao: "valido",
    });
    expect(await obterConvite("token-que-nao-existe-123456", db)).toBeNull();
  });

  it("recusa aceitar com outro e-mail", async () => {
    const outro = await criarUsuario(db, "Intrusa");
    const erro = await capturarErro(aceitarConvite(outro, token, db));
    expect(erro).toBeInstanceOf(ErroNegocio);
    expect((erro as Error).message).toMatch(/mesmo e-mail/);
  });

  it("aceita com o e-mail do convite e cria a membership de profissional", async () => {
    const carla = await criarUsuarioComEmail(emailCarla, "Carla");
    const { tenantId } = await aceitarConvite(carla, token, db);
    expect(tenantId).toBe(admin.tenantId);
    const [m] = await withTenant(admin, (tx) => tx.select().from(memberships).where(eq(memberships.userId, carla)), db);
    expect(m.role).toBe("profissional");
    const eventos = await withTenant(admin, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "convite.aceito")), db);
    expect(eventos).toHaveLength(1);
    expect((await obterConvite(token, db))?.situacao).toBe("aceito");
    profissionalCtx = { tenantId, userId: carla, role: "profissional" };

    const reuso = await capturarErro(aceitarConvite(carla, token, db));
    expect((reuso as Error).message).toMatch(/já foi aceito/);
  });

  it("profissional reserva só para si, mesmo informando outro profissional", async () => {
    const { id } = await criarReserva(
      profissionalCtx,
      { salaId: sala1, profissionalId: drBeto, data: "2030-03-07", horaInicio: "08:00", horaFim: "09:00" },
      AGORA,
      db,
    );
    const [reserva] = await withTenant(admin, (tx) => tx.select().from(reservasSala).where(eq(reservasSala.id, id)), db);
    expect(reserva.profissionalId).not.toBe(drBeto);
  });

  it("na agenda, reservas de terceiros aparecem sem nome para o profissional", async () => {
    const agenda = await listarAgenda(profissionalCtx, { unidadeId, de: SEG, dias: 7 }, db);
    const proprias = agenda!.reservas.filter((r) => r.propria);
    const terceiros = agenda!.reservas.filter((r) => !r.propria);
    expect(proprias.length).toBeGreaterThan(0);
    expect(terceiros.length).toBeGreaterThan(0);
    for (const r of proprias) expect(r.profissionalNome).toBe("Dra. Carla");
    for (const r of terceiros) expect(r.profissionalNome).toBeNull();

    const visaoAdmin = await listarAgenda(admin, { unidadeId, de: SEG, dias: 7 }, db);
    expect(visaoAdmin!.reservas.every((r) => r.profissionalNome)).toBe(true);
  });

  it("profissional não cancela reserva de outro", async () => {
    const agenda = await listarAgenda(profissionalCtx, { unidadeId, de: SEG, dias: 7 }, db);
    const deOutro = agenda!.reservas.find((r) => !r.propria && r.status === "ativa")!;
    expect(await codigoReserva(cancelarReserva(profissionalCtx, deOutro.id, null, AGORA, db))).toBe("nao_permitido");
  });

  it("recepção e profissional não gerenciam salas", async () => {
    const erro = await capturarErro(criarSala(profissionalCtx, unidadeId, { nome: "Sala X" }, db));
    expect((erro as Error).name).toBe("ErroPermissao");
  });
});
