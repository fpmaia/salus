import { describe, expect, it } from "vitest";
import { formatarMoeda } from "./dinheiro";
import {
  descreverCondicoes,
  estimarReserva,
  formatarGradeHorariosTexto,
  gerarMinutaContratoPadrao,
  gradeHorariosSchema,
  itemGradeSchema,
} from "./contratos";

describe("domínio: contratos", () => {
  it("valida itens individuais da grade", () => {
    // Horário inválido (fim antes do início)
    const invalido = itemGradeSchema.safeParse({
      diaSemana: 1,
      horaInicio: "14:00",
      horaFim: "12:00",
    });
    expect(invalido.success).toBe(false);

    // Horário válido
    const valido = itemGradeSchema.safeParse({
      diaSemana: 1,
      horaInicio: "08:00",
      horaFim: "12:00",
    });
    expect(valido.success).toBe(true);
  });

  it("detecta sobreposição de horários no mesmo dia da semana", () => {
    const conflito = gradeHorariosSchema.safeParse([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "10:00", horaFim: "14:00" },
    ]);
    expect(conflito.success).toBe(false);

    const semConflito = gradeHorariosSchema.safeParse([
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
      { diaSemana: 1, horaInicio: "14:00", horaFim: "18:00" },
      { diaSemana: 3, horaInicio: "08:00", horaFim: "12:00" },
    ]);
    expect(semConflito.success).toBe(true);
  });

  it("formata grade de horários em texto descritivo", () => {
    const texto = formatarGradeHorariosTexto([
      { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" },
      { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
    ]);
    expect(texto).toContain("Segunda-feira: das 08:00 às 12:00");
    expect(texto).toContain("Quarta-feira: das 14:00 às 18:00");
  });

  it("gera a minuta com as condições do contrato e a grade fixa", () => {
    const minuta = gerarMinutaContratoPadrao({
      clinicaNome: "Clínica Salus Bem Estar",
      clinicaDocumento: "12.345.678/0001-90",
      profissionalNome: "Dra. Camila Santos",
      profissionalConselho: "CRP",
      profissionalRegistro: "06/98765",
      codigo: "CTR-2026-0007",
      salaNome: "Consultório 02 - Psicologia",
      condicoes: descreverCondicoes({
        modelo: "mensalidade",
        fluxoRecebimento: "direto",
        valorHoraCentavos: 0,
        valorConsultaCentavos: 2000,
        percentualBp: null,
        mensalidadeCentavos: 150000,
        horasIncluidas: null,
        regraFalta: "isenta",
        faltaPercentualBp: null,
        prazoCancelamentoHoras: 24,
        multaCancelamentoReservaBp: null,
      }),
      dataInicio: "2026-11-01",
      dataFim: null,
      gradeHorarios: [
        { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
        { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" },
      ],
    });

    expect(minuta).toContain("CLÍNICA SALUS BEM ESTAR");
    expect(minuta).toContain("DRA. CAMILA SANTOS");
    expect(minuta).toContain("CTR-2026-0007");
    expect(minuta).toContain("Consultório 02 - Psicologia");
    expect(minuta).toContain(`Mensalidade de ${formatarMoeda(150000)} pelo turno fixo`);
    expect(minuta).toContain(`Mais ${formatarMoeda(2000)} por consulta realizada`);
    expect(minuta).toContain("Segunda-feira: das 08:00 às 12:00");
    expect(minuta).toContain("01/11/2026");
    expect(minuta).toContain("por tempo indeterminado");
  });

  it("descreve contrato por hora com multa de turno fixo e prazo", () => {
    const linhas = descreverCondicoes({
      modelo: "hora",
      fluxoRecebimento: "centralizado",
      valorHoraCentavos: 4500,
      valorConsultaCentavos: null,
      percentualBp: null,
      mensalidadeCentavos: null,
      horasIncluidas: null,
      regraFalta: "integral",
      faltaPercentualBp: null,
      prazoCancelamentoHoras: 48,
      multaCancelamentoReservaBp: 5000,
    });
    expect(linhas).toContain(`${formatarMoeda(4500)} por hora reservada`);
    expect(linhas).toContain("Cancelamento sem custo até 48h antes");
    expect(linhas.join(" ")).toMatch(/Turno fixo cancelado depois do prazo: 50/);
  });
});

describe("estimarReserva", () => {
  const base = { valorHoraCentavos: null, valorConsultaCentavos: null, percentualBp: null, mensalidadeCentavos: null, horasIncluidas: null, minutosUsadosNoMes: 0 };

  it("por hora: valor proporcional ao tempo", () => {
    expect(estimarReserva({ ...base, modelo: "hora", valorHoraCentavos: 4500 }, 90)).toEqual({
      valorCentavos: 6750,
      texto: expect.stringContaining("1,5h"),
    });
  });

  it("por consulta ou percentual: a reserva não tem preço por hora", () => {
    expect(estimarReserva({ ...base, modelo: "consulta", valorConsultaCentavos: 3000 }, 60).valorCentavos).toBeNull();
    expect(estimarReserva({ ...base, modelo: "percentual", percentualBp: 2000 }, 60).texto).toContain("20");
  });

  it("pacote de horas: coberta enquanto há saldo, depois cobra o excedente", () => {
    const pacote = { ...base, modelo: "mensalidade" as const, mensalidadeCentavos: 100000, horasIncluidas: 10, valorHoraCentavos: 5000 };
    expect(estimarReserva({ ...pacote, minutosUsadosNoMes: 8 * 60 }, 120)).toMatchObject({ valorCentavos: 0 });
    expect(estimarReserva({ ...pacote, minutosUsadosNoMes: 9 * 60 }, 120)).toMatchObject({ valorCentavos: 5000 });
  });

  it("turno fixo: avulsa paga a hora do contrato, se houver", () => {
    const fixo = { ...base, modelo: "mensalidade" as const, mensalidadeCentavos: 200000 };
    expect(estimarReserva(fixo, 60)).toMatchObject({ valorCentavos: 0 });
    expect(estimarReserva({ ...fixo, valorHoraCentavos: 4000 }, 60)).toMatchObject({ valorCentavos: 4000 });
  });

  it("sem contrato ou sem horário", () => {
    expect(estimarReserva(null, 60).valorCentavos).toBeNull();
    expect(estimarReserva({ ...base, modelo: "hora", valorHoraCentavos: 4500 }, 0).valorCentavos).toBeNull();
  });
});
