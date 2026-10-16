import { describe, expect, it } from "vitest";
import { excedeLimite, formaDaBaixa, mapearStatusAsaas, usoAcimaDosLimites, vencimentoDaFaturaSaas } from "./cobranca";

describe("cobrança", () => {
  it.each([
    ["PENDING", "pendente"],
    ["AWAITING_RISK_ANALYSIS", "pendente"],
    ["RECEIVED", "paga"],
    ["CONFIRMED", "paga"],
    ["RECEIVED_IN_CASH", "paga"],
    ["OVERDUE", "vencida"],
    ["REFUNDED", "estornada"],
    ["CHARGEBACK_REQUESTED", "estornada"],
    ["ALGO_NOVO", "pendente"],
  ])("Asaas %s → %s", (status, esperado) => {
    expect(mapearStatusAsaas(status)).toBe(esperado);
  });

  it("cobrança removida no Asaas conta como cancelada", () => {
    expect(mapearStatusAsaas("PENDING", true)).toBe("cancelada");
  });

  it("mapeia a forma da baixa", () => {
    expect([formaDaBaixa("PIX"), formaDaBaixa("BOLETO"), formaDaBaixa("CREDIT_CARD"), formaDaBaixa(null)]).toEqual(["pix", "boleto", "cartao", "outro"]);
  });

  it("vence no dia 10 da competência", () => {
    expect(vencimentoDaFaturaSaas("2030-03-01")).toBe("2030-03-10");
  });

  it("limites do plano", () => {
    const limites = { unidades: 1, salas: 5 };
    expect(excedeLimite(limites, "unidades", 0, "Básico")).toBeNull();
    expect(excedeLimite(limites, "unidades", 1, "Básico")).toMatch(/até 1 unidades/);
    expect(excedeLimite(limites, "profissionais", 999, "Básico")).toBeNull(); // sem limite definido
    expect(usoAcimaDosLimites(limites, { unidades: 2, salas: 5, profissionais: 40 })).toEqual(["unidades"]);
  });
});
