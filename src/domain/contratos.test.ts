import { describe, expect, it } from "vitest";
import { formatarMoeda } from "./dinheiro";
import {
  descreverCondicoes,
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
