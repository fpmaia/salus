import { describe, expect, it } from "vitest";
import { formatarMoeda } from "./dinheiro";
import {
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

  it("gera minuta padrão completa preenchida com as variáveis", () => {
    const minuta = gerarMinutaContratoPadrao({
      clinicaNome: "Clínica Salus Bem Estar",
      clinicaDocumento: "12.345.678/0001-90",
      profissionalNome: "Dra. Camila Santos",
      profissionalConselho: "CRP",
      profissionalRegistro: "06/98765",
      salaNome: "Consultório 02 - Psicologia",
      valorMensalCentavos: 150000,
      diaVencimento: 10,
      dataInicio: "2026-11-01",
      dataFim: null,
      gradeHorarios: [
        { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
        { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" },
      ],
      cobrancaConsultaTipo: "fixo",
      cobrancaConsultaValorCentavos: 2000,
    });

    expect(minuta).toContain("CLÍNICA SALUS BEM ESTAR");
    expect(minuta).toContain("DRA. CAMILA SANTOS");
    expect(minuta).toContain("Consultório 02 - Psicologia");
    expect(minuta).toContain(formatarMoeda(150000));
    expect(minuta).toContain("dia **10**");
    expect(minuta).toContain(formatarMoeda(2000));
    expect(minuta).toContain("por tempo indeterminado");
  });
});
