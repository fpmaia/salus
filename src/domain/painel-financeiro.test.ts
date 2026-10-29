import { describe, expect, it } from "vitest";
import { faixaDeAtraso, resumoFinanceiro, type FaturaDoPainel } from "./painel-financeiro";

const f = (d: Partial<FaturaDoPainel>): FaturaDoPainel => ({
  status: "pendente",
  valorCentavos: 10000,
  vencimento: "2027-03-10",
  competencia: "2027-03-01",
  pagoEmData: null,
  itens: [],
  ...d,
});

describe("painel financeiro da plataforma", () => {
  it("faixas de atraso", () => {
    expect([faixaDeAtraso("2027-03-10", "2027-03-10"), faixaDeAtraso("2027-03-10", "2027-03-25"), faixaDeAtraso("2027-03-10", "2027-04-09"), faixaDeAtraso("2027-01-10", "2027-03-10")]).toEqual([
      null,
      "1-15",
      "16-30",
      "31+",
    ]);
  });

  it("recebido e a receber no mês, atraso por faixa e descontos concedidos", () => {
    const r = resumoFinanceiro(
      [
        f({ status: "paga", pagoEmData: "2027-03-12", itens: [{ tipo: "base", valorTotalCentavos: 12000 }, { tipo: "desconto", valorTotalCentavos: -2000 }] }),
        f({ status: "paga", pagoEmData: "2027-02-28" }),
        f({ status: "pendente", vencimento: "2027-03-30" }),
        f({ status: "vencida", vencimento: "2027-01-10", valorCentavos: 49900, competencia: "2027-01-01" }),
        f({ status: "cancelada", itens: [{ tipo: "desconto", valorTotalCentavos: -5000 }] }),
      ],
      "2027-03-20",
    );
    expect(r).toMatchObject({ recebidoNoMesCentavos: 10000, aReceberNoMesCentavos: 10000, emAtrasoCentavos: 49900, descontosNoMesCentavos: 2000 });
    expect(r.atraso["31+"]).toEqual({ quantidade: 1, valorCentavos: 49900 });
    expect(r.porTipo.base).toBe(12000);
  });
});
