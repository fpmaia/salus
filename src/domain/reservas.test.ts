import { describe, expect, it } from "vitest";
import { datasDaRecorrencia, descreverRecorrencia, limiteDaJanela, semanaDoMesDe } from "./recorrencia";
import { calcularHorariosVagos, ErroReserva, segmentarReserva, slotAberto, slotsDaGrade, validarJanela, type ConfigUnidade } from "./reservas";

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

describe("calcularHorariosVagos", () => {
  it("retorna todo o período da reserva quando não há agendamentos", () => {
    const vagos = calcularHorariosVagos(
      { horaInicio: "08:00", horaFim: "12:00" },
      [],
    );
    expect(vagos).toEqual([
      { inicio: "08:00", fim: "12:00", duracaoMinutos: 240 },
    ]);
  });

  it("calcula intervalos livres antes, entre e após agendamentos", () => {
    const vagos = calcularHorariosVagos(
      { horaInicio: "08:00", horaFim: "12:00" },
      [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:30", horaFim: "11:30" },
      ],
    );
    expect(vagos).toEqual([
      { inicio: "08:00", fim: "09:00", duracaoMinutos: 60 },
      { inicio: "10:00", fim: "10:30", duracaoMinutos: 30 },
      { inicio: "11:30", fim: "12:00", duracaoMinutos: 30 },
    ]);
  });

  it("retorna lista vazia quando toda a reserva está ocupada", () => {
    const vagos = calcularHorariosVagos(
      { horaInicio: "08:00", horaFim: "12:00" },
      [{ horaInicio: "08:00", horaFim: "12:00" }],
    );
    expect(vagos).toEqual([]);
  });

  it("funde agendamentos sobrepostos ou contíguos", () => {
    const vagos = calcularHorariosVagos(
      { horaInicio: "08:00", horaFim: "12:00" },
      [
        { horaInicio: "08:30", horaFim: "09:30" },
        { horaInicio: "09:00", horaFim: "10:00" },
      ],
    );
    expect(vagos).toEqual([
      { inicio: "08:00", fim: "08:30", duracaoMinutos: 30 },
      { inicio: "10:00", fim: "12:00", duracaoMinutos: 120 },
    ]);
  });
});

describe("segmentarReserva", () => {
  it("devolve 1 segmento vago quando reserva não possui agendamentos", () => {
    const segmentos = segmentarReserva({
      id: "res-1",
      horaInicio: "08:00",
      horaFim: "10:00",
      atendimentos: [],
    });
    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].tipo).toBe("vago");
    expect(segmentos[0].horaInicio).toBe("08:00");
    expect(segmentos[0].horaFim).toBe("10:00");
  });

  it("segmenta corretamente reserva de 08:00 às 10:00 com agendamento das 08:00 às 09:00", () => {
    const segmentos = segmentarReserva({
      id: "res-2",
      horaInicio: "08:00",
      horaFim: "10:00",
      atendimentos: [
        {
          id: "ag-1",
          pacienteNome: "Carlos Silva",
          horaInicio: "08:00",
          horaFim: "09:00",
          status: "confirmado",
        },
      ],
    });

    expect(segmentos).toHaveLength(2);

    // Bloco 1: Ocupado com o paciente das 08:00 às 09:00
    expect(segmentos[0].tipo).toBe("ocupado");
    expect(segmentos[0].horaInicio).toBe("08:00");
    expect(segmentos[0].horaFim).toBe("09:00");
    expect(segmentos[0].pacienteNome).toBe("Carlos Silva");
    expect(segmentos[0].statusAtendimento).toBe("confirmado");

    // Bloco 2: Vago/disponível das 09:00 às 10:00
    expect(segmentos[1].tipo).toBe("vago");
    expect(segmentos[1].horaInicio).toBe("09:00");
    expect(segmentos[1].horaFim).toBe("10:00");
    expect(segmentos[1].pacienteNome).toBeUndefined();
  });

  it("segmenta agendamento no meio do período da reserva", () => {
    const segmentos = segmentarReserva({
      id: "res-3",
      horaInicio: "08:00",
      horaFim: "12:00",
      atendimentos: [
        {
          id: "ag-2",
          pacienteNome: "Ana Paula",
          horaInicio: "09:00",
          horaFim: "10:00",
          status: "agendado",
        },
      ],
    });

    expect(segmentos).toHaveLength(3);
    expect(segmentos[0]).toMatchObject({ tipo: "vago", horaInicio: "08:00", horaFim: "09:00" });
    expect(segmentos[1]).toMatchObject({ tipo: "ocupado", horaInicio: "09:00", horaFim: "10:00", pacienteNome: "Ana Paula" });
    expect(segmentos[2]).toMatchObject({ tipo: "vago", horaInicio: "10:00", horaFim: "12:00" });
  });

  it("segmenta múltiplos agendamentos com horários vagos intercalados", () => {
    const segmentos = segmentarReserva({
      id: "res-4",
      horaInicio: "08:00",
      horaFim: "12:00",
      atendimentos: [
        {
          id: "ag-3",
          pacienteNome: "Paciente 1",
          horaInicio: "08:00",
          horaFim: "09:00",
          status: "atendido",
        },
        {
          id: "ag-4",
          pacienteNome: "Paciente 2",
          horaInicio: "10:00",
          horaFim: "11:30",
          status: "confirmado",
        },
      ],
    });

    expect(segmentos).toHaveLength(4);
    expect(segmentos[0]).toMatchObject({ tipo: "ocupado", horaInicio: "08:00", horaFim: "09:00", pacienteNome: "Paciente 1" });
    expect(segmentos[1]).toMatchObject({ tipo: "vago", horaInicio: "09:00", horaFim: "10:00" });
    expect(segmentos[2]).toMatchObject({ tipo: "ocupado", horaInicio: "10:00", horaFim: "11:30", pacienteNome: "Paciente 2" });
    expect(segmentos[3]).toMatchObject({ tipo: "vago", horaInicio: "11:30", horaFim: "12:00" });
  });

  it("devolve 1 segmento ocupado quando o agendamento cobre toda a reserva", () => {
    const segmentos = segmentarReserva({
      id: "res-5",
      horaInicio: "08:00",
      horaFim: "09:00",
      atendimentos: [
        {
          id: "ag-5",
          pacienteNome: "Paciente Total",
          horaInicio: "08:00",
          horaFim: "09:00",
          status: "confirmado",
        },
      ],
    });

    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]).toMatchObject({ tipo: "ocupado", horaInicio: "08:00", horaFim: "09:00", pacienteNome: "Paciente Total" });
  });
});


describe("recorrência quinzenal e mensal", () => {
  // 2026-10-05 é segunda-feira.
  it("quinzenal alterna semanas a partir da semana de início, mesmo materializando depois", () => {
    const regra = { diaSemana: 3, dataInicio: "2026-10-05", dataFim: null, frequencia: "quinzenal" as const };
    expect(datasDaRecorrencia(regra, "2026-10-05", "2026-11-05")).toEqual(["2026-10-07", "2026-10-21", "2026-11-04"]);
    // Continuação a partir de uma semana "ímpar": a paridade não muda.
    expect(datasDaRecorrencia(regra, "2026-10-12", "2026-10-25")).toEqual(["2026-10-21"]);
  });

  it("mensal: N-ª ocorrência do dia da semana, e a última", () => {
    const primeiraSegunda = { diaSemana: 1, dataInicio: "2026-10-01", dataFim: null, frequencia: "mensal" as const, semanaDoMes: 1 };
    expect(datasDaRecorrencia(primeiraSegunda, "2026-10-01", "2026-12-31")).toEqual(["2026-10-05", "2026-11-02", "2026-12-07"]);
    const ultimaSexta = { ...primeiraSegunda, diaSemana: 5, semanaDoMes: 5 };
    expect(datasDaRecorrencia(ultimaSexta, "2026-10-01", "2026-12-31")).toEqual(["2026-10-30", "2026-11-27", "2026-12-25"]);
  });

  it("semana do mês e descrição", () => {
    expect(semanaDoMesDe("2026-10-05")).toBe(1);
    expect(semanaDoMesDe("2026-10-21")).toBe(3);
    expect(semanaDoMesDe("2026-10-26")).toBe(4);
    expect(semanaDoMesDe("2026-10-30")).toBe(5);
    expect(descreverRecorrencia({ diaSemana: 1, frequencia: "mensal", semanaDoMes: 1 })).toBe("toda 1ª segunda do mês");
    expect(descreverRecorrencia({ diaSemana: 6, frequencia: "mensal", semanaDoMes: 5 })).toBe("todo último sábado do mês");
    expect(descreverRecorrencia({ diaSemana: 3, frequencia: "quinzenal" })).toBe("a cada 2 semanas, na quarta");
    expect(descreverRecorrencia({ diaSemana: 0, frequencia: "semanal" })).toBe("todo domingo");
  });
});
