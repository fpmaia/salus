import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { ErroPermissao } from "../../src/domain/rbac";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { criarAcordo, lancarAjuste } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { minhaSemana, painelHoje, resumoDoMes } from "../../src/server/painel";
import { criarProfissional } from "../../src/server/profissionais";
import { criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Início por papel: o dia da recepção, a semana do profissional e o mês do admin.

const CRIACAO = new Date("2030-03-04T10:00:00Z"); // segunda
const AGORA = new Date("2030-03-05T12:00:00Z"); // terça, 09:00 em São Paulo

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let anaCtx: ContextoTenant;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Painel");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Painel", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const recepcaoId = await criarUsuario(db, "Recepcao Painel");
  const anaUser = await criarUsuario(db, "Ana Painel");
  const { id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db);
  await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db);
  await withTenant(
    admin,
    async (tx) => {
      await tx.insert(memberships).values({ userId: recepcaoId, role: "recepcao" });
      const [m] = await tx.insert(memberships).values({ userId: anaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, ana));
    },
    db,
  );
  recepcao = { tenantId, userId: recepcaoId, role: "recepcao" };
  anaCtx = { tenantId, userId: anaUser, role: "profissional" };

  const { id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db); // seg–sex 08–18
  const { id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db);
  await criarSala(admin, unidadeId, { nome: "Sala 2" }, db);
  await criarAcordo(admin, { profissionalId: ana, modelo: "hora", valorHoraCentavos: 4000, vigenteDe: "2030-02-01" }, db);
  const { id: reserva } = await criarReserva(admin, { salaId: sala1, profissionalId: ana, data: "2030-03-05", horaInicio: "08:00", horaFim: "12:00" }, CRIACAO, db);
  const paciente = async (nome: string) => (await criarPaciente(admin, { nome }, CRIACAO, db)).id;
  const agendar = async (nome: string, inicio: string, fim: string) =>
    (await criarAgendamento(admin, { pacienteId: await paciente(nome), reservaId: reserva, data: "2030-03-05", horaInicio: inicio, horaFim: fim }, CRIACAO, db)).id;
  await agendar("Atrasado", "08:30", "09:00");
  const chegou = await agendar("Chegou", "09:00", "09:30");
  await alterarStatusAgendamento(admin, chegou, "presente", null, AGORA, db);
  await agendar("Sem confirmar", "10:00", "10:30");
  const confirmado = await agendar("Confirmado", "11:00", "11:30");
  await alterarStatusAgendamento(admin, confirmado, "confirmado", null, CRIACAO, db);
  // Fevereiro ficou aberto para a Ana (um ajuste lá).
  await lancarAjuste(admin, { profissionalId: ana, data: "2030-02-10", natureza: "debito", valorCentavos: 1500, descricao: "Armário" }, db);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("início por papel", () => {
  it("recepção: o dia com chegadas, atrasos, a confirmar e salas livres", async () => {
    const hoje = await painelHoje(recepcao, AGORA, db);
    expect(hoje.total).toBe(4);
    expect(hoje.naRecepcao.map((a) => a.pacienteNome)).toEqual(["Chegou"]);
    expect(hoje.atrasados.map((a) => a.pacienteNome)).toEqual(["Atrasado"]);
    expect(hoje.aConfirmar.map((a) => a.pacienteNome)).toEqual(["Sem confirmar"]);
    expect(hoje.proximos.map((a) => a.pacienteNome)).toEqual(["Sem confirmar", "Confirmado"]);
    expect(hoje.salasLivres.map((s) => s.nome)).toEqual(["Sala 2"]);
    expect(hoje.salasOcupadas).toBe(1);
    expect(await capturarErro(painelHoje(anaCtx, AGORA, db))).toBeInstanceOf(ErroPermissao);
  });

  it("profissional: a semana e o saldo", async () => {
    const semana = await minhaSemana(anaCtx, AGORA, db);
    expect(semana.consultas.map((c) => `${c.horaInicio} ${c.pacienteNome}`)).toEqual(["09:00 Chegou", "10:00 Sem confirmar", "11:00 Confirmado"]);
    expect(semana.reservas).toHaveLength(1);
    expect(semana.saldo).toBe(1500);
    expect(semana.pagamentoOnline).toBe(false);
  });

  it("admin: o mês, quem está sem contrato e o mês anterior em aberto", async () => {
    const mes = await resumoDoMes(admin, AGORA, db);
    expect(mes.competencia).toBe("2030-03-01");
    expect(mes.semContrato.map((p) => p.nome)).toEqual(["Dr. Beto"]);
    expect(mes.anterior).toEqual({ competencia: "2030-02-01", abertos: 2 });
    expect(mes.aReceberCentavos).toBe(1500);
    expect(mes.ocupacao).toBeGreaterThan(0);
    expect(await capturarErro(resumoDoMes(recepcao, AGORA, db))).toBeInstanceOf(ErroPermissao);
  });
});
