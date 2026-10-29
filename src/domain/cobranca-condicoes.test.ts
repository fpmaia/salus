import { describe, expect, it } from "vitest";
import {
  aplicarAbatimentos,
  descontoVigente,
  precosEfetivos,
  situacaoDaAssinatura,
  vencimentoDaFaturaSaas,
  type DescontoFatura,
} from "./cobranca";

// Condições negociadas, descontos e créditos aplicados na fatura do SaaS.

const fatura = {
  itens: [{ tipo: "base" as const, descricao: "Plano", quantidade: 1, valorUnitarioCentavos: 20000, valorTotalCentavos: 20000 }],
  valorTotalCentavos: 20000,
};

const desconto = (d: Partial<DescontoFatura>): DescontoFatura => ({
  id: "d",
  tipo: "percentual",
  valor: 10,
  competenciaInicio: "2026-01-01",
  competenciaFim: null,
  motivo: "teste",
  ...d,
});

describe("abatimentos na fatura", () => {
  it("percentual sobre o subtotal, depois valor fixo, depois créditos", () => {
    const r = aplicarAbatimentos(fatura, [desconto({ id: "v", tipo: "valor", valor: 3000 }), desconto({ id: "p", valor: 20 })], [
      { id: "c1", saldoCentavos: 5000, motivo: "compensação" },
    ]);
    expect(r.itens.slice(1).map((i) => [i.tipo, i.valorTotalCentavos, i.referenciaId])).toEqual([
      ["desconto", -4000, "p"],
      ["desconto", -3000, "v"],
      ["credito", -5000, "c1"],
    ]);
    expect(r.valorTotalCentavos).toBe(8000);
    expect(r.creditosUsados).toEqual([{ id: "c1", valorCentavos: 5000 }]);
  });

  it("nunca abaixo de zero: o crédito usa só o que cabe e guarda o resto", () => {
    const r = aplicarAbatimentos(fatura, [desconto({ valor: 90 })], [
      { id: "c1", saldoCentavos: 1500, motivo: "a" },
      { id: "c2", saldoCentavos: 900, motivo: "b" },
    ]);
    expect(r.valorTotalCentavos).toBe(0);
    expect(r.creditosUsados).toEqual([
      { id: "c1", valorCentavos: 1500 },
      { id: "c2", valorCentavos: 500 },
    ]);
  });

  it("100% zera a fatura e não consome crédito", () => {
    const r = aplicarAbatimentos(fatura, [desconto({ valor: 100 })], [{ id: "c1", saldoCentavos: 1000, motivo: "a" }]);
    expect(r.valorTotalCentavos).toBe(0);
    expect(r.creditosUsados).toEqual([]);
  });

  it("vigência por competência, inclusiva; revogado não vale", () => {
    const d = desconto({ competenciaInicio: "2026-03-01", competenciaFim: "2026-05-01" });
    expect(["2026-02-01", "2026-03-01", "2026-05-01", "2026-06-01"].map((c) => descontoVigente(d, c))).toEqual([false, true, true, false]);
    expect(descontoVigente(desconto({}), "2030-01-01")).toBe(true);
    expect(descontoVigente(desconto({ revogadoEm: new Date() }), "2026-03-01")).toBe(false);
  });
});

describe("condições negociadas", () => {
  const plano = {
    precoMensalCentavos: 49900,
    precoSalaExtraCentavos: 3990,
    precoProfissionalExtraCentavos: 1990,
    precoUnidadeExtraCentavos: 14900,
    precoProntuarioCentavos: 4990,
  };

  it("o preço negociado substitui só o que foi definido", () => {
    const p = precosEfetivos(plano, { precoMensalCentavos: 39900, precoSalaExtraCentavos: 0 });
    expect(p).toMatchObject({ precoMensalCentavos: 39900, precoSalaExtraCentavos: 0, precoProntuarioCentavos: 4990, negociado: true });
    expect(precosEfetivos(plano, null).negociado).toBe(false);
    expect(precosEfetivos(plano, { diaVencimento: 5 }).negociado).toBe(false);
  });

  it("dia de vencimento negociado e carência própria", () => {
    expect(vencimentoDaFaturaSaas("2026-11-01")).toBe("2026-11-10");
    expect(vencimentoDaFaturaSaas("2026-11-01", 25)).toBe("2026-11-25");
    const aberta = [{ status: "vencida" as const, vencimento: "2026-11-10" }];
    expect(situacaoDaAssinatura(aberta, "2026-11-26").estado).toBe("suspensa");
    expect(situacaoDaAssinatura(aberta, "2026-11-26", 30)).toMatchObject({ estado: "atrasada", suspensaoEm: "2026-12-11" });
  });
});
