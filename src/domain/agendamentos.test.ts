import { describe, expect, it } from "vitest";
import { cancelamentoTardio, ErroAgendamento, validarTransicao, type StatusAgendamento } from "./agendamentos";

const periodo = { inicio: new Date("2030-03-04T13:00:00Z"), fim: new Date("2030-03-04T14:00:00Z") };
const antes = (min: number) => new Date(periodo.inicio.getTime() - min * 60_000);

function codigo(de: StatusAgendamento, para: StatusAgendamento, agora: Date): string | undefined {
  try {
    validarTransicao(de, para, periodo, agora);
  } catch (erro) {
    if (erro instanceof ErroAgendamento) return erro.codigo;
    throw erro;
  }
  return undefined;
}

describe("validarTransicao", () => {
  it.each([
    ["agendado", "confirmado", antes(600), undefined],
    ["confirmado", "presente", antes(30), undefined],
    ["agendado", "presente", antes(90), "cedo_demais"],
    ["presente", "realizado", antes(-10), undefined],
    ["confirmado", "falta", antes(-5), undefined],
    ["confirmado", "falta", antes(5), "cedo_demais"],
    ["agendado", "cancelado", antes(1), undefined],
    ["agendado", "cancelado", antes(0), "ja_comecou"],
    ["presente", "cancelado", antes(30), "transicao_invalida"],
    ["realizado", "falta", antes(-60), "transicao_invalida"],
    ["cancelado", "agendado", antes(600), "transicao_invalida"],
    ["agendado", "realizado", antes(-10), "transicao_invalida"],
  ] as const)("%s → %s", (de, para, agora, esperado) => {
    expect(codigo(de, para, agora)).toBe(esperado);
  });
});

describe("cancelamentoTardio", () => {
  it("compara a antecedência com a política", () => {
    expect(cancelamentoTardio(periodo.inicio, antes(25 * 60), 24)).toBe(false);
    expect(cancelamentoTardio(periodo.inicio, antes(23 * 60), 24)).toBe(true);
    expect(cancelamentoTardio(periodo.inicio, antes(10), 0)).toBe(false);
  });
});
