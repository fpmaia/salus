import { describe, expect, it } from "vitest";
import { atrasoRetentativaMs, normalizarTelefoneBr, primeiroNome, textoDaMensagem } from "./notificacoes";

describe("notificações", () => {
  it.each([
    ["(11) 99999-0000", "+5511999990000"],
    ["11 3333-4444", "+551133334444"],
    ["+55 11 99999-0000", "+5511999990000"],
    ["005511999990000", "+5511999990000"],
    ["99999-0000", null],
    ["011999990000", null],
    ["", null],
    [null, null],
  ])("normaliza %s → %s", (entrada, esperado) => {
    expect(normalizarTelefoneBr(entrada)).toBe(esperado);
  });

  it("espera cresce exponencialmente até 1h", () => {
    expect([1, 2, 3, 4, 10].map((t) => atrasoRetentativaMs(t) / 60_000)).toEqual([1, 2, 4, 8, 60]);
  });

  it("monta o texto do lembrete com o link", () => {
    expect(primeiroNome("  Maria  Souza ")).toBe("Maria");
    const texto = textoDaMensagem("lembrete_agendamento", {
      paciente: "Maria",
      profissional: "Dra. Ana",
      data: "05/03/2030",
      hora: "09:00",
      local: "Centro",
      link: "https://x/c/abc",
    });
    expect(texto).toContain("Dra. Ana");
    expect(texto).toContain("https://x/c/abc");
  });
});
