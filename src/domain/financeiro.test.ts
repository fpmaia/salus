import { describe, expect, it } from "vitest";
import { aplicarBp, formatarMoeda, lerMoeda, lerPercentualBp } from "./dinheiro";
import {
  acordoVigente,
  competenciaDe,
  conciliar,
  lancamentosDaMensalidade,
  lancamentosDaReserva,
  lancamentosDoAgendamento,
  proximaCompetencia,
  saldo,
  ultimoDiaDaCompetencia,
  type Acordo,
  type FatoAgendamento,
} from "./financeiro";

const base: Acordo = {
  id: "a",
  salaId: null,
  modelo: "consulta",
  fluxoRecebimento: "direto",
  valorHoraCentavos: null,
  valorConsultaCentavos: null,
  percentualBp: null,
  mensalidadeCentavos: null,
  horasIncluidas: null,
  regraFalta: "isenta",
  faltaPercentualBp: null,
  vigenteDe: "2030-01-01",
  vigenteAte: null,
};

const hora: Acordo = { ...base, modelo: "hora", valorHoraCentavos: 4000 };
const consulta: Acordo = { ...base, modelo: "consulta", valorConsultaCentavos: 3000 };
const percentual: Acordo = { ...base, modelo: "percentual", percentualBp: 3000 };
const mensalidade: Acordo = { ...base, modelo: "mensalidade", mensalidadeCentavos: 80000, horasIncluidas: 20, valorHoraCentavos: 3500 };
const salaFixaPura: Acordo = { ...base, modelo: "sala_fixa", salaId: "s1", mensalidadeCentavos: 150000 };
const salaFixaComConsulta: Acordo = { ...base, modelo: "sala_fixa", salaId: "s1", mensalidadeCentavos: 150000, valorConsultaCentavos: 2500 };
const salaFixaComPercentual: Acordo = { ...base, modelo: "sala_fixa", salaId: "s1", mensalidadeCentavos: 150000, percentualBp: 1500 };

const realizado = (valor: number | null = null): FatoAgendamento => ({ status: "realizado", cancelamentoTardio: false, valorCentavos: valor });
const falta = (valor: number | null = null): FatoAgendamento => ({ status: "falta", cancelamentoTardio: false, valorCentavos: valor });
const cancelado = (tardio: boolean): FatoAgendamento => ({ status: "cancelado", cancelamentoTardio: tardio, valorCentavos: null });

const resumo = (lista: { tipo: string; natureza: string; valorCentavos: number }[]) =>
  lista.map((l) => `${l.tipo}:${l.natureza}:${l.valorCentavos}`);

describe("dinheiro", () => {
  it("lê e formata valores", () => {
    expect(lerMoeda("1.234,56")).toBe(123456);
    expect(lerMoeda("R$ 80")).toBe(8000);
    expect(lerMoeda("80.5")).toBe(8050);
    expect(lerMoeda("abc")).toBeNull();
    expect(lerPercentualBp("12,5")).toBe(1250);
    expect(aplicarBp(10001, 3000)).toBe(3000);
    expect(formatarMoeda(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});

describe("reserva", () => {
  it.each([
    [hora, 90, ["locacao_hora:debito:6000"]],
    [hora, 30, ["locacao_hora:debito:2000"]],
    [consulta, 120, []],
    [percentual, 120, []],
    [mensalidade, 120, []],
    [null, 120, []],
  ] as const)("%#: modelo %o, %i min", (acordo, minutos, esperado) => {
    expect(resumo(lancamentosDaReserva(acordo, minutos))).toEqual(esperado);
  });
});

describe("agendamento: modelo × fato × fluxo", () => {
  const centralizado = (a: Acordo): Acordo => ({ ...a, fluxoRecebimento: "centralizado" });
  const faltaIntegral = (a: Acordo): Acordo => ({ ...a, regraFalta: "integral" });
  const falta50 = (a: Acordo): Acordo => ({ ...a, regraFalta: "percentual", faltaPercentualBp: 5000 });

  it.each([
    // consulta
    ["consulta realizado", consulta, realizado(), ["locacao_consulta:debito:3000"]],
    ["consulta realizado centralizado", centralizado(consulta), realizado(20000), ["locacao_consulta:debito:3000", "recebimento_paciente:credito:20000"]],
    ["consulta centralizado sem valor", centralizado(consulta), realizado(), ["locacao_consulta:debito:3000"]],
    ["consulta falta isenta", consulta, falta(), []],
    ["consulta falta integral", faltaIntegral(consulta), falta(), ["falta:debito:3000"]],
    ["consulta falta 50%", falta50(consulta), falta(), ["falta:debito:1500"]],
    ["consulta cancelado no prazo", faltaIntegral(consulta), cancelado(false), []],
    ["consulta cancelado tardio", faltaIntegral(consulta), cancelado(true), ["falta:debito:3000"]],
    // percentual
    ["percentual realizado com valor", percentual, realizado(25000), ["locacao_percentual:debito:7500"]],
    ["percentual realizado sem valor", percentual, realizado(), []],
    ["percentual centralizado", centralizado(percentual), realizado(25000), ["locacao_percentual:debito:7500", "recebimento_paciente:credito:25000"]],
    ["percentual falta integral com valor", faltaIntegral(percentual), falta(25000), ["falta:debito:7500"]],
    ["percentual falta sem valor", faltaIntegral(percentual), falta(), []],
    // hora e mensalidade não cobram por atendimento, mas repassam no caixa centralizado
    ["hora realizado", hora, realizado(20000), []],
    ["hora centralizado", centralizado(hora), realizado(20000), ["recebimento_paciente:credito:20000"]],
    ["hora falta integral", faltaIntegral(hora), falta(20000), []],
    ["mensalidade centralizado", centralizado(mensalidade), realizado(15000), ["recebimento_paciente:credito:15000"]],
    // sala fixa pura (não cobra consulta)
    ["sala fixa pura realizado", salaFixaPura, realizado(20000), []],
    ["sala fixa pura centralizado", centralizado(salaFixaPura), realizado(20000), ["recebimento_paciente:credito:20000"]],
    // sala fixa com consulta fixa
    ["sala fixa com consulta", salaFixaComConsulta, realizado(20000), ["locacao_consulta:debito:2500"]],
    // sala fixa com percentual por consulta
    ["sala fixa com percentual", salaFixaComPercentual, realizado(20000), ["locacao_percentual:debito:3000"]],
    // ativos não geram nada
    ["agendado", faltaIntegral(consulta), { status: "agendado", cancelamentoTardio: false, valorCentavos: 100 }, []],
    ["sem acordo", null, realizado(20000), []],
  ] as const)("%s", (_nome, acordo, fato, esperado) => {
    expect(resumo(lancamentosDoAgendamento(acordo, fato))).toEqual(esperado);
  });
});

describe("mensalidade", () => {
  it.each([
    [10 * 60, ["mensalidade:debito:80000"]],
    [20 * 60, ["mensalidade:debito:80000"]],
    [22.5 * 60, ["mensalidade:debito:80000", "excedente_horas:debito:8750"]],
  ])("%i min usados", (minutos, esperado) => {
    expect(resumo(lancamentosDaMensalidade(mensalidade, minutos))).toEqual(esperado);
  });

  it("sala fixa gera mensalidade fixa sem excedente de horas", () => {
    expect(resumo(lancamentosDaMensalidade(salaFixaPura, 6000))).toEqual(["mensalidade:debito:150000"]);
  });

  it("outros modelos não geram mensalidade", () => {
    expect(lancamentosDaMensalidade(hora, 6000)).toEqual([]);
  });
});

describe("vigência e competência", () => {
  const acordos = [
    { vigenteDe: "2030-01-01", vigenteAte: "2030-03-31", id: "v1" },
    { vigenteDe: "2030-04-01", vigenteAte: null, id: "v2" },
  ];

  it("escolhe o acordo vigente na data do fato", () => {
    expect(acordoVigente(acordos, "2030-03-31")?.id).toBe("v1");
    expect(acordoVigente(acordos, "2030-04-01")?.id).toBe("v2");
    expect(acordoVigente(acordos, "2029-12-31")).toBeNull();
  });

  it("calcula competências", () => {
    expect(competenciaDe("2030-03-17")).toBe("2030-03-01");
    expect(proximaCompetencia("2030-12-01")).toBe("2031-01-01");
    expect(ultimoDiaDaCompetencia("2030-02-01")).toBe("2030-02-28");
  });
});

describe("conciliação", () => {
  const l = (id: string, tipo: "falta" | "locacao_consulta", valor: number) => ({
    id,
    tipo,
    natureza: "debito" as const,
    valorCentavos: valor,
    descricao: "",
  });

  it("é idempotente quando nada mudou", () => {
    const ativos = [l("1", "locacao_consulta", 3000)];
    expect(conciliar([l("x", "locacao_consulta", 3000)], ativos)).toEqual({ estornar: [], criar: [] });
  });

  it("estorna e recria quando o valor muda", () => {
    const r = conciliar([l("x", "locacao_consulta", 3500)], [l("1", "locacao_consulta", 3000)]);
    expect(r.estornar.map((e) => e.id)).toEqual(["1"]);
    expect(resumo(r.criar)).toEqual(["locacao_consulta:debito:3500"]);
  });

  it("estorna o que não deve mais existir", () => {
    expect(conciliar([], [l("1", "falta", 3000)]).estornar.map((e) => e.id)).toEqual(["1"]);
  });

  it("saldo positivo = profissional deve ao espaço", () => {
    expect(saldo([{ natureza: "debito", valorCentavos: 5000 }, { natureza: "credito", valorCentavos: 2000 }])).toBe(3000);
  });
});
