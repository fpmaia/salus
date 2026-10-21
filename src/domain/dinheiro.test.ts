import { describe, expect, it } from "vitest";
import { valorPorExtenso } from "./dinheiro";

describe("valorPorExtenso", () => {
  it.each([
    [100, "um real"],
    [9000, "noventa reais"],
    [15030, "cento e cinquenta reais e trinta centavos"],
    [10000, "cem reais"],
    [101, "um real e um centavo"],
    [45, "quarenta e cinco centavos"],
    [120000, "mil e duzentos reais"],
    [123456, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
    [2100000, "vinte e um mil reais"],
    [100000000, "um milhão de reais"],
    [210000000, "dois milhões e cem mil reais"],
  ])("%i → %s", (centavos, texto) => {
    expect(valorPorExtenso(centavos)).toBe(texto);
  });
});
