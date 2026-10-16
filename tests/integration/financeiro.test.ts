import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { acordosFinanceiros, lancamentos, memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { ErroNegocio } from "../../src/server/erros";
import {
  criarAcordo,
  definirValorAgendamento,
  extrato,
  fecharCompetencia,
  lancarAjuste,
  ocupacaoSalas,
  receitaPorUnidade,
  registrarPagamento,
  reprocessar,
  resumoCompetencia,
} from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { concluirReservasPassadas, criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";

// Critérios de pronto da Fase 3:
// - tabela de casos cobre modelos × no-show × fluxo (src/domain/financeiro.test.ts + abaixo, ponta a ponta);
// - reprocessar eventos não altera saldos;
// - fechamento fechado não aceita novos lançamentos na competência.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const MARCO = "2030-03-01";
const ABRIL = "2030-04-01";
const FIM_DE_MARCO = new Date("2030-03-31T23:00:00Z");
const ABRIL_DIA_2 = new Date("2030-04-02T12:00:00Z");

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let paulaCtx: ContextoTenant;
let unidadeId: string;
let sala1: string;
let sala2: string;
const prof: Record<"hugo" | "clara" | "paula" | "marcos", string> = { hugo: "", clara: "", paula: "", marcos: "" };
let paciente: string[] = [];
let agendamentoPaula: string;

/** Leva o agendamento até "realizado" (check-in 30 min antes, realizado no fim). */
async function realizar(id: string, inicioIso: string) {
  const inicio = new Date(inicioIso).getTime();
  await alterarStatusAgendamento(recepcao, id, "presente", null, new Date(inicio - 30 * 60_000), db);
  await alterarStatusAgendamento(recepcao, id, "realizado", null, new Date(inicio + 60 * 60_000), db);
}

async function lancamentosDe(profissionalId: string) {
  return withTenant(
    admin,
    (tx) =>
      tx
        .select({ tipo: lancamentos.tipo, natureza: lancamentos.natureza, valor: lancamentos.valorCentavos, competencia: lancamentos.competencia, estorno: sql<boolean>`${lancamentos.estornoDe} is not null` })
        .from(lancamentos)
        .where(eq(lancamentos.profissionalId, profissionalId))
        .orderBy(lancamentos.criadoEm),
    db,
  );
}

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Financeiro");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Financeiro", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const recepcaoId = await criarUsuario(db, "Recepcao Financeiro");
  const paulaUser = await criarUsuario(db, "Paula Financeiro");

  ({ id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db)); // seg–sex 08–18
  ({ id: sala1 } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  ({ id: sala2 } = await criarSala(admin, unidadeId, { nome: "Sala 2" }, db));
  for (const nome of ["hugo", "clara", "paula", "marcos"] as const) {
    ({ id: prof[nome] } = await criarProfissional(admin, { nome, email: `${nome}.${randomUUID()}@teste.dev` }, db));
  }
  await withTenant(
    admin,
    async (tx) => {
      await tx.insert(memberships).values({ userId: recepcaoId, role: "recepcao" });
      const [m] = await tx.insert(memberships).values({ userId: paulaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, prof.paula));
    },
    db,
  );
  recepcao = { tenantId, userId: recepcaoId, role: "recepcao" };
  paulaCtx = { tenantId, userId: paulaUser, role: "profissional" };

  paciente = [];
  for (const nome of ["P1", "P2", "P3", "P4", "P5"]) paciente.push((await criarPaciente(recepcao, { nome }, AGORA, db)).id);

  const desde = "2030-01-01";
  await criarAcordo(admin, { profissionalId: prof.hugo, modelo: "hora", valorHoraCentavos: 4000, vigenteDe: desde }, db);
  await criarAcordo(
    admin,
    { profissionalId: prof.clara, modelo: "consulta", valorConsultaCentavos: 3000, fluxoRecebimento: "centralizado", regraFalta: "integral", vigenteDe: desde },
    db,
  );
  await criarAcordo(admin, { profissionalId: prof.paula, modelo: "percentual", percentualBp: 3000, vigenteDe: desde }, db);
  await criarAcordo(
    admin,
    { profissionalId: prof.marcos, modelo: "mensalidade", mensalidadeCentavos: 80000, horasIncluidas: 1, valorHoraCentavos: 3500, vigenteDe: desde },
    db,
  );
});

afterAll(async () => {
  await db?.$client.end();
});

describe("acordos", () => {
  it("valida campos obrigatórios do modelo", async () => {
    await expect(criarAcordo(admin, { profissionalId: prof.hugo, modelo: "hora", vigenteDe: "2031-01-01" }, db)).rejects.toThrow(
      "Informe o valor da hora",
    );
  });

  it("o banco recusa acordo sem o valor do modelo", async () => {
    const erro = await capturarErro(
      withTenant(admin, (tx) => tx.insert(acordosFinanceiros).values({ profissionalId: prof.hugo, modelo: "consulta", vigenteDe: "2035-01-01" }), db),
    );
    expect(codigoPg(erro)).toBe("23514");
  });
});

describe("fatos geradores", () => {
  it("modelo hora: reserva concluída gera a locação", async () => {
    await criarReserva(admin, { salaId: sala1, profissionalId: prof.hugo, data: "2030-03-05", horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => concluirReservasPassadas(tx, new Date("2030-03-05T20:00:00Z")), db);
    expect(await lancamentosDe(prof.hugo)).toEqual([{ tipo: "locacao_hora", natureza: "debito", valor: 8000, competencia: MARCO, estorno: false }]);
  });

  it("modelo consulta + centralizado + falta integral", async () => {
    await criarReserva(admin, { salaId: sala2, profissionalId: prof.clara, data: "2030-03-06", horaInicio: "08:00", horaFim: "12:00" }, AGORA, db);
    const ag = async (i: number, ini: string, fim: string) =>
      (await criarAgendamento(recepcao, { pacienteId: paciente[i], profissionalId: prof.clara, data: "2030-03-06", horaInicio: ini, horaFim: fim }, AGORA, db)).id;
    const realizado = await ag(0, "08:00", "09:00");
    const faltou = await ag(1, "09:00", "10:00");
    const tardio = await ag(2, "10:00", "11:00");
    const noPrazo = await ag(3, "11:00", "12:00");

    await definirValorAgendamento(recepcao, realizado, 20000, AGORA, db);
    await realizar(realizado, "2030-03-06T11:00:00Z");
    await alterarStatusAgendamento(recepcao, faltou, "falta", null, new Date("2030-03-06T12:30:00Z"), db);
    await alterarStatusAgendamento(recepcao, tardio, "cancelado", null, new Date("2030-03-06T11:00:00Z"), db); // 2h antes
    await alterarStatusAgendamento(recepcao, noPrazo, "cancelado", null, AGORA, db); // 2 dias antes

    const resumo = (await lancamentosDe(prof.clara)).map((l) => `${l.tipo}:${l.natureza}:${l.valor}`);
    expect(resumo.sort()).toEqual(
      ["falta:debito:3000", "falta:debito:3000", "locacao_consulta:debito:3000", "recebimento_paciente:credito:20000"].sort(),
    );
  });

  it("modelo percentual: valor informado depois e corrigido gera estorno", async () => {
    await criarReserva(admin, { salaId: sala1, profissionalId: prof.paula, data: "2030-03-07", horaInicio: "14:00", horaFim: "16:00" }, AGORA, db);
    // Recepção agenda (o paciente foi cadastrado por ela); depois a Paula informa o valor.
    ({ id: agendamentoPaula } = await criarAgendamento(
      recepcao,
      { pacienteId: paciente[4], profissionalId: prof.paula, data: "2030-03-07", horaInicio: "14:00", horaFim: "15:00" },
      AGORA,
      db,
    ));
    await realizar(agendamentoPaula, "2030-03-07T17:00:00Z");
    expect(await lancamentosDe(prof.paula)).toEqual([]); // sem valor ainda

    await definirValorAgendamento(paulaCtx, agendamentoPaula, 25000, AGORA, db);
    await definirValorAgendamento(paulaCtx, agendamentoPaula, 30000, AGORA, db);
    expect((await lancamentosDe(prof.paula)).map((l) => `${l.natureza}:${l.valor}:${l.estorno}`)).toEqual([
      "debito:7500:false",
      "credito:7500:true",
      "debito:9000:false",
    ]);
  });

  it("modelo mensalidade: só gera no fechamento", async () => {
    await criarReserva(admin, { salaId: sala2, profissionalId: prof.marcos, data: "2030-03-08", horaInicio: "14:00", horaFim: "16:00" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => concluirReservasPassadas(tx, new Date("2030-03-08T20:00:00Z")), db);
    expect(await lancamentosDe(prof.marcos)).toEqual([]);
  });
});

describe("reprocessamento", () => {
  it("reprocessar a competência não altera saldos nem cria lançamentos", async () => {
    const antes = await resumoCompetencia(admin, MARCO, db);
    const [{ total: linhasAntes }] = await withTenant(admin, (tx) => tx.select({ total: sql<number>`count(*)::int` }).from(lancamentos), db);
    expect(await reprocessar(admin, "2030-03", db)).toEqual({ criados: 0, estornados: 0 });
    expect(await reprocessar(admin, "2030-03", db)).toEqual({ criados: 0, estornados: 0 });
    expect(await resumoCompetencia(admin, MARCO, db)).toEqual(antes);
    const [{ total: linhasDepois }] = await withTenant(admin, (tx) => tx.select({ total: sql<number>`count(*)::int` }).from(lancamentos), db);
    expect(linhasDepois).toBe(linhasAntes);
  });
});

describe("fechamento", () => {
  it("não fecha um mês que ainda não terminou", async () => {
    const erro = await capturarErro(fecharCompetencia(admin, prof.marcos, "2030-03", FIM_DE_MARCO, db));
    expect(erro).toBeInstanceOf(ErroNegocio);
  });

  it("gera mensalidade e excedente e congela os totais", async () => {
    const totais = await fecharCompetencia(admin, prof.marcos, "2030-03", ABRIL_DIA_2, db);
    // R$ 800 + 1h excedente × R$ 35.
    expect(totais).toEqual({ saldoAnterior: 0, debitos: 83500, creditos: 0, saldoFinal: 83500 });
    await expect(fecharCompetencia(admin, prof.marcos, "2030-03", ABRIL_DIA_2, db)).rejects.toThrow("já está fechada");
  });

  it("competência fechada não aceita lançamentos novos (banco)", async () => {
    const erro = await capturarErro(
      withTenant(
        admin,
        (tx) =>
          tx.insert(lancamentos).values({
            profissionalId: prof.marcos,
            competencia: MARCO,
            dataReferencia: "2030-03-10",
            natureza: "debito",
            tipo: "ajuste",
            valorCentavos: 100,
            descricao: "x",
            origem: "ajuste:x",
            idempotencyKey: `ajuste:${randomUUID()}`,
          }),
        db,
      ),
    );
    expect(codigoPg(erro)).toBe("P0001");
  });

  it("correções de um mês fechado caem na próxima competência", async () => {
    await fecharCompetencia(admin, prof.paula, "2030-03", ABRIL_DIA_2, db);
    const marcoAntes = await extrato(admin, { profissionalId: prof.paula, competencia: "2030-03" }, db);
    await definirValorAgendamento(admin, agendamentoPaula, 20000, ABRIL_DIA_2, db);

    const marcoDepois = await extrato(admin, { profissionalId: prof.paula, competencia: "2030-03" }, db);
    expect(marcoDepois.saldoFinal).toBe(marcoAntes.saldoFinal);
    const abril = await extrato(admin, { profissionalId: prof.paula, competencia: "2030-04" }, db);
    expect(abril.saldoAnterior).toBe(9000);
    expect(abril.linhas.map((l) => `${l.natureza}:${l.valorCentavos}`)).toEqual(["credito:9000", "debito:6000"]);
    expect(abril.saldoFinal).toBe(6000);
  });

  it("feche os meses em ordem", async () => {
    await expect(fecharCompetencia(admin, prof.hugo, "2030-04", new Date("2030-05-02T12:00:00Z"), db)).rejects.toThrow("Feche antes");
  });
});

describe("pagamentos, ajustes e acordos", () => {
  it("baixa manual abate o saldo", async () => {
    await registrarPagamento(recepcao, { profissionalId: prof.hugo, data: "2030-04-05", valorCentavos: 8000, direcao: "profissional_para_espaco", forma: "pix" }, db);
    const abril = await extrato(admin, { profissionalId: prof.hugo, competencia: "2030-04" }, db);
    expect(abril.saldoAnterior).toBe(8000);
    expect(abril.saldoFinal).toBe(0);
  });

  it("repasse do caixa centralizado reduz o crédito do profissional", async () => {
    const marco = await extrato(admin, { profissionalId: prof.clara, competencia: "2030-03" }, db);
    expect(marco.saldoFinal).toBe(9000 - 20000); // o espaço deve R$ 110 à Clara
    await registrarPagamento(admin, { profissionalId: prof.clara, data: "2030-04-03", valorCentavos: 11000, direcao: "espaco_para_profissional", forma: "transferencia" }, db);
    expect((await extrato(admin, { profissionalId: prof.clara, competencia: "2030-04" }, db)).saldoFinal).toBe(0);
  });

  it("ajuste manual só pelo admin", async () => {
    await lancarAjuste(admin, { profissionalId: prof.hugo, data: "2030-04-10", natureza: "credito", valorCentavos: 500, descricao: "Desconto de boas-vindas" }, db);
    const erro = await capturarErro(
      lancarAjuste(recepcao, { profissionalId: prof.hugo, data: "2030-04-10", natureza: "credito", valorCentavos: 500, descricao: "Indevido" }, db),
    );
    expect((erro as Error).name).toBe("ErroPermissao");
  });

  it("reajuste encerra o acordo anterior e vale para os fatos seguintes", async () => {
    await criarAcordo(admin, { profissionalId: prof.hugo, modelo: "hora", valorHoraCentavos: 5000, vigenteDe: ABRIL }, db);
    const acordos = await withTenant(admin, (tx) => tx.select().from(acordosFinanceiros).where(eq(acordosFinanceiros.profissionalId, prof.hugo)), db);
    expect(acordos.map((a) => [a.vigenteDe, a.vigenteAte, a.valorHoraCentavos]).sort()).toEqual([
      ["2030-01-01", "2030-03-31", 4000],
      [ABRIL, null, 5000],
    ]);
    await criarReserva(admin, { salaId: sala1, profissionalId: prof.hugo, data: "2030-04-09", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => concluirReservasPassadas(tx, new Date("2030-04-09T20:00:00Z")), db);
    const abril = await extrato(admin, { profissionalId: prof.hugo, competencia: "2030-04" }, db);
    expect(abril.linhas.find((l) => l.tipo === "locacao_hora")?.valorCentavos).toBe(5000);
  });
});

describe("acesso e integridade", () => {
  it("profissional vê só o próprio extrato", async () => {
    const proprio = await extrato(paulaCtx, { profissionalId: prof.hugo, competencia: "2030-03" }, db);
    expect(proprio.profissional.id).toBe(prof.paula);
    await expect(resumoCompetencia(paulaCtx, MARCO, db)).rejects.toThrow();
  });

  it("o ledger é append-only para a aplicação", async () => {
    const update = await capturarErro(withTenant(admin, (tx) => tx.update(lancamentos).set({ valorCentavos: 1 }), db));
    const remocao = await capturarErro(withTenant(admin, (tx) => tx.delete(lancamentos).where(and(eq(lancamentos.profissionalId, prof.hugo))), db));
    expect(codigoPg(update)).toBe(SEM_PRIVILEGIO);
    expect(codigoPg(remocao)).toBe(SEM_PRIVILEGIO);
  });

  it("relatórios: receita por unidade e ocupação", async () => {
    const receita = await receitaPorUnidade(admin, "2030-03", db);
    const centro = receita.find((r) => r.unidade === "Centro")!;
    // Hugo 80 + Clara 30+30+30 + Paula 90 (líquido) = 260
    expect(centro.receitaCentavos).toBe(26000);
    expect(receita.find((r) => r.unidade === null)?.receitaCentavos).toBe(83500); // mensalidade do Marcos

    const ocupacao = await ocupacaoSalas(admin, unidadeId, "2030-03", db);
    const s1 = ocupacao.find((o) => o.nome === "Sala 1")!;
    expect(s1.minutosReservados).toBe(4 * 60); // Hugo 2h + Paula 2h
    expect(s1.minutosAbertos).toBe(21 * 10 * 60); // 21 dias úteis × 10h
  });
});
