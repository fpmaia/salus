import { describe, expect, it } from "vitest";
import { datasDaRecorrencia, limiteDaJanela } from "./recorrencia";
import { ErroReserva, slotAberto, slotsDaGrade, validarJanela, type ConfigUnidade } from "./reservas";

// Segunda a sexta 08–12 e 14–18; sábado 08–12; domingo fechado.
const config: ConfigUnidade = {
  timezone: "America/Sao_Paulo",
  slotMinutos: 30,
  horarios: [
    ...[1, 2, 3, 4, 5].flatMap((dia) => [
      { diaSemana: dia, abre: "08:00:00", fecha: "12:00:00" },
      { diaSemana: dia, abre: "14:00", fecha: "18:00" },
    ]),
    { diaSemana: 6, abre: "08:00", fecha: "12:00" },
  ],
  feriados: ["2026-11-02"],
};

const agora = new Date("2026-10-16T10:00:00Z"); // sexta, 07:00 em São Paulo

function codigo(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof ErroReserva) return erro.codigo;
    throw erro;
  }
  return undefined;
}

describe("validarJanela", () => {
  it("aceita janela válida e devolve o intervalo em UTC", () => {
    const { inicio, fim } = validarJanela({ data: "2026-10-19", horaInicio: "08:00", horaFim: "12:00" }, config, agora);
    expect(inicio.toISOString()).toBe("2026-10-19T11:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-10-19T15:00:00.000Z");
  });

  it.each([
    [{ data: "2026-10-19", horaInicio: "8h", horaFim: "12:00" }, "dados_invalidos"],
    [{ data: "2026-10-19", horaInicio: "12:00", horaFim: "08:00" }, "dados_invalidos"],
    [{ data: "2026-10-19", horaInicio: "08:15", horaFim: "09:00" }, "fora_do_slot"],
    [{ data: "2026-10-19", horaInicio: "11:00", horaFim: "15:00" }, "fora_do_horario"], // atravessa o almoço
    [{ data: "2026-10-19", horaInicio: "17:30", horaFim: "18:30" }, "fora_do_horario"],
    [{ data: "2026-10-18", horaInicio: "08:00", horaFim: "09:00" }, "fora_do_horario"], // domingo
    [{ data: "2026-11-02", horaInicio: "08:00", horaFim: "09:00" }, "feriado"],
    [{ data: "2026-10-15", horaInicio: "08:00", horaFim: "09:00" }, "no_passado"],
  ] as const)("%o → %s", (janela, esperado) => {
    expect(codigo(() => validarJanela(janela, config, agora))).toBe(esperado);
  });

  it("respeita slot de 60 minutos", () => {
    const porHora = { ...config, slotMinutos: 60 };
    expect(codigo(() => validarJanela({ data: "2026-10-19", horaInicio: "08:30", horaFim: "09:30" }, porHora, agora))).toBe(
      "fora_do_slot",
    );
  });
});

describe("grade", () => {
  it("vai do primeiro abre ao último fecha", () => {
    const slots = slotsDaGrade(config, "2026-10-19");
    expect(slots[0]).toBe("08:00");
    expect(slots.at(-1)).toBe("17:30");
    expect(slots).toHaveLength(20);
  });

  it("domingo e feriado não têm grade", () => {
    expect(slotsDaGrade(config, "2026-10-18")).toEqual([]);
    expect(slotsDaGrade(config, "2026-11-02")).toEqual([]);
  });

  it("marca o intervalo de almoço como fechado", () => {
    expect(slotAberto(config, "2026-10-19", "11:30")).toBe(true);
    expect(slotAberto(config, "2026-10-19", "12:30")).toBe(false);
  });
});

describe("recorrência", () => {
  const regra = { diaSemana: 2, dataInicio: "2026-10-16", dataFim: null }; // terças

  it("lista as datas do dia da semana dentro da janela", () => {
    expect(datasDaRecorrencia(regra, "2026-10-16", "2026-11-03")).toEqual([
      "2026-10-20",
      "2026-10-27",
      "2026-11-03",
    ]);
  });

  it("respeita início e fim da regra", () => {
    expect(datasDaRecorrencia({ ...regra, dataInicio: "2026-10-21", dataFim: "2026-10-31" }, "2026-10-01", "2026-12-31")).toEqual([
      "2026-10-27",
    ]);
    expect(datasDaRecorrencia({ ...regra, dataFim: "2026-10-01" }, "2026-10-16", "2026-12-31")).toEqual([]);
  });

  it("janela de materialização é de 8 semanas", () => {
    expect(limiteDaJanela("2026-10-16")).toBe("2026-12-11");
  });
});
