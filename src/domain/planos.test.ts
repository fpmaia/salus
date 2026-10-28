import { describe, expect, it } from "vitest";
import { PLANOS_PUBLICOS, planoMaisBarato, simularPlano } from "./planos";

const [basico, pro] = PLANOS_PUBLICOS;

describe("simulação de planos", () => {
  it("Básico não comporta a segunda unidade", () => {
    expect(simularPlano(basico, { unidades: 2, salas: 1, profissionais: 1, prontuarios: 0 })).toBeNull();
  });

  it("soma excedentes e prontuários ao preço base", () => {
    const s = simularPlano(basico, { unidades: 1, salas: 7, profissionais: 16, prontuarios: 2 })!;
    expect(s).toMatchObject({ salasExtras: 2, profissionaisExtras: 1, unidadesExtras: 0 });
    expect(s.totalCentavos).toBe(19900 + 2 * 3990 + 1990 + 2 * 4990);
  });

  it("recomenda o mais barato: Básico com poucos excedentes, Pro quando eles passam do preço do Pro", () => {
    expect(planoMaisBarato({ unidades: 1, salas: 6, profissionais: 10, prontuarios: 0 }).plano.codigo).toBe("basico");
    expect(planoMaisBarato({ unidades: 1, salas: 15, profissionais: 30, prontuarios: 0 }).plano.codigo).toBe("pro");
    expect(planoMaisBarato({ unidades: 2, salas: 2, profissionais: 2, prontuarios: 0 }).plano).toBe(pro);
  });
});
