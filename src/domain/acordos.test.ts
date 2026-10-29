import { describe, expect, it } from "vitest";
import { descontoDoAcordo, simularAcordo, somarMeses, validarAcordo } from "./acordos";

describe("acordo de renegociação", () => {
  it("parcelas mensais iguais; o resto dos centavos vai na última", () => {
    const r = simularAcordo({ valorOriginalCentavos: 100000, descontoCentavos: 0, parcelas: 3, primeiroVencimento: "2027-01-31" });
    expect(r.parcelas).toEqual([
      { numero: 1, valorCentavos: 33333, vencimento: "2027-01-31" },
      { numero: 2, valorCentavos: 33333, vencimento: "2027-02-28" },
      { numero: 3, valorCentavos: 33334, vencimento: "2027-03-31" },
    ]);
    expect(somarMeses("2027-12-15", 1)).toBe("2028-01-15");
  });

  it("desconto percentual ou fixo", () => {
    expect(descontoDoAcordo(99800, { tipo: "percentual", valor: 10 })).toBe(9980);
    expect(descontoDoAcordo(99800, { tipo: "valor", valor: 5000 })).toBe(5000);
    expect(descontoDoAcordo(99800, null)).toBe(0);
  });

  it("valida soma, desconto e datas", () => {
    const base = { valorOriginalCentavos: 10000, descontoCentavos: 1000, hoje: "2027-01-10" };
    expect(validarAcordo({ ...base, parcelas: [{ valorCentavos: 9000, vencimento: "2027-01-10" }] })).toBeNull();
    expect(validarAcordo({ ...base, parcelas: [{ valorCentavos: 8000, vencimento: "2027-01-10" }] })).toContain("soma");
    expect(validarAcordo({ ...base, descontoCentavos: 10000, parcelas: [] })).toContain("desconto");
    expect(validarAcordo({ ...base, parcelas: [{ valorCentavos: 9000, vencimento: "2027-01-09" }] })).toContain("passado");
    expect(
      validarAcordo({
        ...base,
        parcelas: [
          { valorCentavos: 4500, vencimento: "2027-02-10" },
          { valorCentavos: 4500, vencimento: "2027-02-10" },
        ],
      }),
    ).toContain("depois da anterior");
  });
});
