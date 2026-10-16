import { describe, expect, it } from "vitest";
import {
  dataValida,
  diaSemana,
  hojeNoFuso,
  inicioDaSemana,
  instanteLocal,
  minutosDoDia,
  partesLocais,
  somarDias,
  timezoneValido,
} from "./tempo";

describe("tempo", () => {
  it("valida datas reais", () => {
    expect(dataValida("2026-10-16")).toBe(true);
    expect(dataValida("2026-02-29")).toBe(false);
    expect(dataValida("16/10/2026")).toBe(false);
  });

  it("converte horas em minutos", () => {
    expect(minutosDoDia("08:30")).toBe(510);
    expect(minutosDoDia("08:30:00")).toBe(510);
    expect(minutosDoDia("24:00")).toBe(1440);
    expect(() => minutosDoDia("25:00")).toThrow();
  });

  it("calcula dia da semana, soma de dias e início da semana", () => {
    expect(diaSemana("2026-10-16")).toBe(5); // sexta
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(inicioDaSemana("2026-10-18")).toBe("2026-10-12"); // domingo → segunda anterior
    expect(inicioDaSemana("2026-10-12")).toBe("2026-10-12");
  });

  it.each([
    ["America/Sao_Paulo", "2026-10-16", "08:00", "2026-10-16T11:00:00.000Z"],
    ["America/Manaus", "2026-10-16", "08:00", "2026-10-16T12:00:00.000Z"],
    ["America/Sao_Paulo", "2026-10-16", "23:30", "2026-10-17T02:30:00.000Z"],
    // Horário de verão: 08:00 em Nova York antes e depois da mudança de março.
    ["America/New_York", "2026-03-07", "08:00", "2026-03-07T13:00:00.000Z"],
    ["America/New_York", "2026-03-09", "08:00", "2026-03-09T12:00:00.000Z"],
  ])("instanteLocal(%s, %s %s) = %s", (tz, data, hora, esperado) => {
    expect(instanteLocal(data, hora, tz).toISOString()).toBe(esperado);
  });

  it("partesLocais é o inverso de instanteLocal", () => {
    const instante = instanteLocal("2026-10-16", "14:30", "America/Sao_Paulo");
    expect(partesLocais(instante, "America/Sao_Paulo")).toEqual({
      data: "2026-10-16",
      hora: "14:30",
      minutos: 870,
      diaSemana: 5,
    });
  });

  it("hoje depende do fuso", () => {
    const agora = new Date("2026-10-17T01:00:00Z");
    expect(hojeNoFuso("America/Sao_Paulo", agora)).toBe("2026-10-16");
    expect(hojeNoFuso("UTC", agora)).toBe("2026-10-17");
  });

  it("reconhece fusos inválidos", () => {
    expect(timezoneValido("America/Sao_Paulo")).toBe(true);
    expect(timezoneValido("Marte/Base")).toBe(false);
  });
});
