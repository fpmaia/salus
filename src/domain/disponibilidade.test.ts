import { describe, expect, it } from "vitest";
import { agruparPorDia, gerarSlug, horariosLivres } from "./disponibilidade";

const d = (iso: string) => new Date(iso);
const base = {
  duracaoMin: 60,
  passoMin: 30,
  agora: d("2030-03-04T10:00:00Z"), // 07:00 em SP
  antecedenciaMinHoras: 2,
  janelaDias: 7,
};

describe("horários livres", () => {
  it("dentro das reservas, no passo do slot, sem os ocupados", () => {
    const livres = horariosLivres({
      ...base,
      reservas: [{ inicio: d("2030-03-05T11:00:00Z"), fim: d("2030-03-05T14:00:00Z") }], // 08–11 local
      ocupados: [{ inicio: d("2030-03-05T12:00:00Z"), fim: d("2030-03-05T13:00:00Z") }], // 09–10
    });
    // 08:00 cabe (08–09); 08:30 e 09:00/09:30 colidem; 10:00 cabe (10–11).
    expect(livres.map((x) => x.toISOString())).toEqual(["2030-03-05T11:00:00.000Z", "2030-03-05T13:00:00.000Z"]);
  });

  it("respeita antecedência mínima e janela", () => {
    const livres = horariosLivres({
      ...base,
      reservas: [
        { inicio: d("2030-03-04T11:00:00Z"), fim: d("2030-03-04T13:00:00Z") }, // hoje 08–10: antes de agora+2h
        { inicio: d("2030-03-20T11:00:00Z"), fim: d("2030-03-20T12:00:00Z") }, // fora da janela de 7 dias
      ],
      ocupados: [],
    });
    expect(livres.map((x) => x.toISOString())).toEqual(["2030-03-04T12:00:00.000Z"]);
  });

  it("reservas sobrepostas não duplicam horários", () => {
    const livres = horariosLivres({
      ...base,
      duracaoMin: 30,
      reservas: [
        { inicio: d("2030-03-05T11:00:00Z"), fim: d("2030-03-05T12:00:00Z") },
        { inicio: d("2030-03-05T11:00:00Z"), fim: d("2030-03-05T11:30:00Z") },
      ],
      ocupados: [],
    });
    expect(livres).toHaveLength(2);
  });

  it("agrupa por dia local", () => {
    expect(agruparPorDia([d("2030-03-05T11:00:00Z"), d("2030-03-05T13:00:00Z"), d("2030-03-06T02:30:00Z")], "America/Sao_Paulo")).toEqual([
      { data: "2030-03-05", horas: ["08:00", "10:00", "23:30"] },
    ]);
  });

  it("gera slug sem acentos", () => {
    expect(gerarSlug("Dra. Ângela Ribeiro", "x7k2")).toBe("dra-angela-ribeiro-x7k2");
  });
});
