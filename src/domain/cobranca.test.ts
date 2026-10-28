import { describe, expect, it } from "vitest";
import {
  calcularItensFaturaSaas,
  estaEmTrialProntuario,
  estadoLicencaProntuario,
  estenderPagamentoProntuario,
  excedeLimite,
  licencaFaturavelNoEspaco,
  licencaPermiteEscrita,
  formaDaBaixa,
  mapearStatusAsaas,
  situacaoDaAssinatura,
  statusParaExibir,
  usoAcimaDosLimites,
  vencimentoDaFaturaSaas,
} from "./cobranca";

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
    const limites = { unidades: 1, salas: 5, profissionais: 15 };
    // Unidade sem permissão extra bloqueia ao tentar ultrapassar:
    expect(excedeLimite(limites, "unidades", 0, "Básico", false)).toBeNull();
    expect(excedeLimite(limites, "unidades", 1, "Básico", false)).toMatch(/permite apenas 1 unidade/);
    // Unidade com permissão extra (Pro) não bloqueia (vai para overage):
    expect(excedeLimite(limites, "unidades", 1, "Pro", true)).toBeNull();
    // Salas e profissionais não bloqueiam (cobrados via overage):
    expect(excedeLimite(limites, "salas", 5, "Básico")).toBeNull();
    expect(excedeLimite(limites, "profissionais", 15, "Básico")).toBeNull();
    // Downgrade: só unidade acima do limite (em plano sem unidade extra) impede a troca;
    // salas e profissionais acima viram excedente na fatura.
    expect(usoAcimaDosLimites(limites, { unidades: 2, salas: 9, profissionais: 40 })).toEqual(["unidades"]);
    expect(usoAcimaDosLimites(limites, { unidades: 1, salas: 9, profissionais: 40 })).toEqual([]);
    expect(usoAcimaDosLimites(limites, { unidades: 3, salas: 9, profissionais: 40 }, true)).toEqual([]);
  });

  describe("cálculo de faturas com overages e prontuário", () => {
    it("calcula fatura base sem excedentes", () => {
      const res = calcularItensFaturaSaas({
        planoNome: "Básico",
        precoBaseCentavos: 19900,
        limites: { unidades: 1, salas: 5, profissionais: 15 },
        precoSalaExtraCentavos: 3990,
        precoProfissionalExtraCentavos: 1990,
        precoUnidadeExtraCentavos: 14900,
        precoProntuarioCentavos: 4990,
        unidadesAtivas: 1,
        salasAtivas: 5,
        profissionaisAtivos: 15,
        profissionaisProntuarioFaturaveis: 0,
      });

      expect(res.valorTotalCentavos).toBe(19900);
      expect(res.itens).toHaveLength(1);
      expect(res.itens[0].tipo).toBe("base");
    });

    it("calcula overages de salas, profissionais extras e licenças de prontuário", () => {
      const res = calcularItensFaturaSaas({
        planoNome: "Básico",
        precoBaseCentavos: 19900, // R$ 199,00
        limites: { unidades: 1, salas: 5, profissionais: 15 },
        precoSalaExtraCentavos: 3990, // R$ 39,90
        precoProfissionalExtraCentavos: 1990, // R$ 19,90
        precoUnidadeExtraCentavos: 14900, // R$ 149,00
        precoProntuarioCentavos: 4990, // R$ 49,90
        unidadesAtivas: 1,
        salasAtivas: 7, // 2 extras -> 2 * 3990 = 7980
        profissionaisAtivos: 17, // 2 extras -> 2 * 1990 = 3980
        profissionaisProntuarioFaturaveis: 3, // 3 * 4990 = 14970
      });

      // Total esperado: 19900 + 7980 + 3980 + 14970 = 46830 (R$ 468,30)
      expect(res.valorTotalCentavos).toBe(46830);
      expect(res.itens).toHaveLength(4);
      expect(res.itens.map((i) => i.tipo)).toEqual(["base", "sala_extra", "profissional_extra", "prontuario_licenca"]);
    });

    it("verifica período de trial do prontuário (15 dias)", () => {
      const agora = new Date("2030-05-10T12:00:00Z");
      const dentroDoTrial = new Date("2030-05-20T12:00:00Z");
      const expirado = new Date("2030-05-09T12:00:00Z");

      expect(estaEmTrialProntuario(dentroDoTrial, agora)).toBe(true);
      expect(estaEmTrialProntuario(expirado, agora)).toBe(false);
      expect(estaEmTrialProntuario(null, agora)).toBe(false);
    });
  });

  describe("situação da assinatura", () => {
    const abril = { status: "pendente" as const, vencimento: "2030-04-10" };

    it("em dia até o vencimento; paga ou com erro de envio não conta", () => {
      expect(situacaoDaAssinatura([abril], "2030-04-10")).toEqual({ estado: "em_dia" });
      expect(situacaoDaAssinatura([{ ...abril, status: "paga" }, { ...abril, status: "erro" }], "2030-05-30")).toEqual({ estado: "em_dia" });
    });

    it("15 dias de carência: suspende no dia 26, com aviso no dia 21", () => {
      expect(situacaoDaAssinatura([abril], "2030-04-11")).toEqual({
        estado: "atrasada",
        vencimento: "2030-04-10",
        suspensaoEm: "2030-04-26",
        avisarEm: "2030-04-21",
      });
      expect(situacaoDaAssinatura([abril], "2030-04-25").estado).toBe("atrasada");
      expect(situacaoDaAssinatura([abril], "2030-04-26").estado).toBe("suspensa");
    });

    it("vale a fatura vencida mais antiga", () => {
      const maio = { status: "vencida" as const, vencimento: "2030-05-10" };
      expect(situacaoDaAssinatura([maio, abril], "2030-05-12")).toMatchObject({ estado: "suspensa", vencimento: "2030-04-10" });
    });
  });

  describe("licença do prontuário", () => {
    const agora = new Date("2030-04-20T12:00:00Z");
    const dia = 24 * 60 * 60 * 1000;
    const antes = new Date(agora.getTime() - dia);
    const depois = new Date(agora.getTime() + dia);

    it("sem licença ou desligada: inativa e sem escrita", () => {
      expect(estadoLicencaProntuario(null, agora)).toBe("inativa");
      expect(estadoLicencaProntuario({ ativo: false, trialFimEm: depois, responsavel: "espaco", pagoAte: null }, agora)).toBe("inativa");
      expect(licencaPermiteEscrita(null, agora)).toBe(false);
    });

    it("no teste escreve e não entra na fatura", () => {
      const l = { ativo: true, trialFimEm: depois, responsavel: "espaco" as const, pagoAte: null };
      expect(estadoLicencaProntuario(l, agora)).toBe("teste");
      expect(licencaPermiteEscrita(l, agora)).toBe(true);
      expect(licencaFaturavelNoEspaco(l, agora)).toBe(false);
    });

    it("paga pelo espaço: segue ativa depois do teste e entra na fatura", () => {
      const l = { ativo: true, trialFimEm: antes, responsavel: "espaco" as const, pagoAte: null };
      expect(estadoLicencaProntuario(l, agora)).toBe("ativa");
      expect(licencaFaturavelNoEspaco(l, agora)).toBe(true);
    });

    it("paga pelo profissional: depois do teste exige pagamento em dia e nunca entra na fatura do espaço", () => {
      const vencida = { ativo: true, trialFimEm: antes, responsavel: "profissional" as const, pagoAte: null };
      expect(estadoLicencaProntuario(vencida, agora)).toBe("aguardando_pagamento");
      expect(licencaPermiteEscrita(vencida, agora)).toBe(false);
      expect(licencaFaturavelNoEspaco(vencida, agora)).toBe(false);
      const paga = { ...vencida, pagoAte: depois };
      expect(estadoLicencaProntuario(paga, agora)).toBe("ativa");
      expect(estadoLicencaProntuario({ ...vencida, pagoAte: antes }, agora)).toBe("aguardando_pagamento");
    });

    it("pagamento soma 30 dias ao que resta, ou conta de hoje se já venceu", () => {
      expect(estenderPagamentoProntuario(null, agora).getTime()).toBe(agora.getTime() + 30 * dia);
      expect(estenderPagamentoProntuario(antes, agora).getTime()).toBe(agora.getTime() + 30 * dia);
      expect(estenderPagamentoProntuario(depois, agora).getTime()).toBe(depois.getTime() + 30 * dia);
    });
  });

  describe("situação da assinatura nos limites", () => {
    const fatura = { status: "vencida" as const, vencimento: "2030-04-10" };
    it("dia 25 ainda está em atraso; dia 26 suspende; aviso a partir do dia 21", () => {
      expect(situacaoDaAssinatura([fatura], "2030-04-25")).toMatchObject({ estado: "atrasada", suspensaoEm: "2030-04-26", avisarEm: "2030-04-21" });
      expect(situacaoDaAssinatura([fatura], "2030-04-26").estado).toBe("suspensa");
    });
    it("pendente no dia do vencimento ainda está em dia; fatura com erro não conta", () => {
      expect(situacaoDaAssinatura([{ status: "pendente", vencimento: "2030-04-10" }], "2030-04-10").estado).toBe("em_dia");
      expect(situacaoDaAssinatura([{ status: "erro", vencimento: "2030-01-10" }], "2030-04-10").estado).toBe("em_dia");
    });
  });

  it("pendente depois do vencimento aparece como vencida", () => {
    expect(statusParaExibir("pendente", "2030-04-10", "2030-04-11")).toBe("vencida");
    expect(statusParaExibir("pendente", "2030-04-10", "2030-04-10")).toBe("pendente");
    expect(statusParaExibir("paga", "2030-04-10", "2030-05-01")).toBe("paga");
  });
});
