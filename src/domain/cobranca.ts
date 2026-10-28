// Cobranças (Asaas) e limites de plano do SaaS. Domínio puro: sem I/O.
import { somarDias, type DataLocal } from "./tempo";

export type StatusCobranca = "pendente" | "vencida" | "paga" | "estornada" | "cancelada" | "erro";

/**
 * Status do pagamento no Asaas → status interno. CONFIRMED (cartão/PIX com bloqueio
 * cautelar) já conta como pago; estornos e chargebacks contam como estornada.
 */
export function mapearStatusAsaas(status: string, removida = false): StatusCobranca {
  if (removida) return "cancelada";
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
    case "DUNNING_RECEIVED":
      return "paga";
    case "OVERDUE":
    case "DUNNING_REQUESTED":
      return "vencida";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "estornada";
    default:
      // PENDING, AWAITING_RISK_ANALYSIS e desconhecidos.
      return "pendente";
  }
}

/** Forma de pagamento do Asaas → forma da baixa manual (pagamentos.forma). */
export function formaDaBaixa(billingType: string | null | undefined): "pix" | "boleto" | "cartao" | "transferencia" | "outro" {
  switch (billingType) {
    case "PIX":
      return "pix";
    case "BOLETO":
      return "boleto";
    case "CREDIT_CARD":
    case "DEBIT_CARD":
      return "cartao";
    case "TRANSFER":
    case "DEPOSIT":
      return "transferencia";
    default:
      return "outro";
  }
}

export function vencimentoPadrao(hoje: DataLocal, dias: number): DataLocal {
  return somarDias(hoje, dias);
}

/** Vencimento da fatura do SaaS: dia 10 da competência. */
export function vencimentoDaFaturaSaas(competencia: DataLocal): DataLocal {
  return somarDias(competencia, 9);
}

// Inadimplência do SaaS: 15 dias de carência depois do vencimento (fatura do dia 10 →
// suspensão no dia 26). Cobre um boleto pago com atraso e a compensação, e o Asaas ainda
// manda os próprios lembretes nesse meio-tempo. Suspenso, o espaço fica só para consulta
// e volta sozinho quando a fatura é paga. O aviso por e-mail sai 5 dias antes.
export const DIAS_DE_CARENCIA_SAAS = 15;
export const DIAS_DE_AVISO_SAAS = 5;

export type SituacaoAssinatura =
  | { estado: "em_dia" }
  | { estado: "atrasada" | "suspensa"; vencimento: DataLocal; suspensaoEm: DataLocal; avisarEm: DataLocal };

/**
 * Situação pela fatura em aberto mais antiga já vencida. "pendente" depois do vencimento
 * também conta (o OVERDUE do Asaas pode chegar atrasado); "erro" não: a fatura nem chegou
 * ao Asaas, então a falha é nossa.
 */
export function situacaoDaAssinatura(faturas: { status: StatusCobranca; vencimento: DataLocal }[], hoje: DataLocal): SituacaoAssinatura {
  const vencidas = faturas
    .filter((f) => f.status === "vencida" || (f.status === "pendente" && f.vencimento < hoje))
    .map((f) => f.vencimento)
    .sort();
  if (vencidas.length === 0) return { estado: "em_dia" };
  const vencimento = vencidas[0];
  const suspensaoEm = somarDias(vencimento, DIAS_DE_CARENCIA_SAAS + 1);
  return {
    estado: hoje >= suspensaoEm ? "suspensa" : "atrasada",
    vencimento,
    suspensaoEm,
    avisarEm: somarDias(suspensaoEm, -DIAS_DE_AVISO_SAAS),
  };
}

export const RECURSOS_LIMITADOS = ["unidades", "salas", "profissionais"] as const;
export type RecursoLimitado = (typeof RECURSOS_LIMITADOS)[number];

export const ROTULOS_RECURSO: Record<RecursoLimitado, string> = {
  unidades: "unidades",
  salas: "salas",
  profissionais: "profissionais",
};

export const DIAS_DE_TRIAL_PRONTUARIO = 15;

/** null = cabe no plano ou é coberto por overage; texto = motivo para bloquear criação. */
export function excedeLimite(
  limites: Record<string, number>,
  recurso: RecursoLimitado,
  usoAtual: number,
  plano: string,
  permiteUnidadeExtra = false,
): string | null {
  const limite = limites[recurso];
  if (limite === undefined) return null;

  // Unidade no Básico não permite overage: exige upgrade obrigatório para Pro.
  if (recurso === "unidades" && !permiteUnidadeExtra) {
    if (usoAtual + 1 <= limite) return null;
    return `O plano ${plano} permite apenas ${limite} unidade. Para gerenciar múltiplas unidades/clínicas, faça upgrade para o plano Pro.`;
  }

  // Salas, profissionais e unidades em planos superiores são flexíveis (cobrados via overage no fechamento).
  return null;
}

/**
 * Recursos que impedem a troca para outro plano. Salas e profissionais acima do limite viram
 * excedente na fatura (não bloqueiam); unidades bloqueiam só onde o plano não aceita unidade extra.
 */
export function usoAcimaDosLimites(
  limites: Record<string, number>,
  uso: Record<RecursoLimitado, number>,
  permiteUnidadeExtra = false,
): RecursoLimitado[] {
  if (permiteUnidadeExtra) return [];
  return limites.unidades !== undefined && uso.unidades > limites.unidades ? ["unidades"] : [];
}

export type TipoItemFatura = "base" | "sala_extra" | "profissional_extra" | "unidade_extra" | "prontuario_licenca";

export type ItemCalculadoFaturaSaas = {
  tipo: TipoItemFatura;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  valorTotalCentavos: number;
};

/** Verifica se a licença de prontuário ainda está dentro do período de 15 dias de teste grátis. */
export function estaEmTrialProntuario(trialFimEm: Date | string | null | undefined, agora = new Date()): boolean {
  if (!trialFimEm) return false;
  const fim = typeof trialFimEm === "string" ? new Date(trialFimEm) : trialFimEm;
  return agora.getTime() <= fim.getTime();
}

export const DIAS_POR_PAGAMENTO_PRONTUARIO = 30;

export type ResponsavelLicenca = "espaco" | "profissional";

/**
 * - inativa: nunca ativada ou desligada pelo admin;
 * - teste: dentro dos 15 dias grátis;
 * - ativa: paga pelo espaço (entra na fatura do Salus) ou pelo profissional com pagamento em dia;
 * - aguardando_pagamento: do profissional, teste acabou e o último pagamento venceu. Só leitura.
 */
export type EstadoLicencaProntuario = "inativa" | "teste" | "ativa" | "aguardando_pagamento";

export type LicencaProntuario = {
  ativo: boolean;
  trialFimEm: Date | null;
  responsavel: ResponsavelLicenca;
  pagoAte: Date | null;
};

export function estadoLicencaProntuario(l: LicencaProntuario | null | undefined, agora = new Date()): EstadoLicencaProntuario {
  if (!l || !l.ativo) return "inativa";
  if (estaEmTrialProntuario(l.trialFimEm, agora)) return "teste";
  if (l.responsavel === "espaco") return "ativa";
  return l.pagoAte && agora.getTime() <= l.pagoAte.getTime() ? "ativa" : "aguardando_pagamento";
}

/** Escreve no prontuário (evolução, adendo, anexo)? Ler o que já existe é sempre permitido. */
export function licencaPermiteEscrita(l: LicencaProntuario | null | undefined, agora = new Date()): boolean {
  const estado = estadoLicencaProntuario(l, agora);
  return estado === "teste" || estado === "ativa";
}

/** Entra na fatura mensal do espaço: ativa, fora do teste e paga pelo espaço. */
export function licencaFaturavelNoEspaco(l: LicencaProntuario, agora = new Date()): boolean {
  return l.ativo && l.responsavel === "espaco" && !estaEmTrialProntuario(l.trialFimEm, agora);
}

/** Novo "pago até" de um pagamento do profissional: soma 30 dias ao que ainda resta (não perde dias). */
export function estenderPagamentoProntuario(pagoAte: Date | null, agora = new Date()): Date {
  const base = pagoAte && pagoAte.getTime() > agora.getTime() ? pagoAte : agora;
  return new Date(base.getTime() + DIAS_POR_PAGAMENTO_PRONTUARIO * 24 * 60 * 60 * 1000);
}

/** Calcula a fatura composta do mês: valor base + overages de salas/profs/unidades + prontuário. */
export function calcularItensFaturaSaas(dados: {
  planoNome: string;
  precoBaseCentavos: number;
  limites: Record<string, number>;
  precoSalaExtraCentavos: number;
  precoProfissionalExtraCentavos: number;
  precoUnidadeExtraCentavos: number;
  precoProntuarioCentavos: number;
  unidadesAtivas: number;
  salasAtivas: number;
  profissionaisAtivos: number;
  profissionaisProntuarioFaturaveis: number;
}): { itens: ItemCalculadoFaturaSaas[]; valorTotalCentavos: number } {
  const itens: ItemCalculadoFaturaSaas[] = [
    {
      tipo: "base",
      descricao: `Assinatura Salus — Plano ${dados.planoNome}`,
      quantidade: 1,
      valorUnitarioCentavos: dados.precoBaseCentavos,
      valorTotalCentavos: dados.precoBaseCentavos,
    },
  ];

  const limiteSalas = dados.limites.salas ?? 0;
  if (dados.salasAtivas > limiteSalas && dados.precoSalaExtraCentavos > 0) {
    const qtd = dados.salasAtivas - limiteSalas;
    const total = qtd * dados.precoSalaExtraCentavos;
    itens.push({
      tipo: "sala_extra",
      descricao: `Salas adicionais (${qtd}x além do limite de ${limiteSalas})`,
      quantidade: qtd,
      valorUnitarioCentavos: dados.precoSalaExtraCentavos,
      valorTotalCentavos: total,
    });
  }

  const limiteProfissionais = dados.limites.profissionais ?? 0;
  if (dados.profissionaisAtivos > limiteProfissionais && dados.precoProfissionalExtraCentavos > 0) {
    const qtd = dados.profissionaisAtivos - limiteProfissionais;
    const total = qtd * dados.precoProfissionalExtraCentavos;
    itens.push({
      tipo: "profissional_extra",
      descricao: `Profissionais adicionais (${qtd}x além do limite de ${limiteProfissionais})`,
      quantidade: qtd,
      valorUnitarioCentavos: dados.precoProfissionalExtraCentavos,
      valorTotalCentavos: total,
    });
  }

  const limiteUnidades = dados.limites.unidades ?? 0;
  if (dados.unidadesAtivas > limiteUnidades && dados.precoUnidadeExtraCentavos > 0) {
    const qtd = dados.unidadesAtivas - limiteUnidades;
    const total = qtd * dados.precoUnidadeExtraCentavos;
    itens.push({
      tipo: "unidade_extra",
      descricao: `Unidades adicionais (${qtd}x além do limite de ${limiteUnidades})`,
      quantidade: qtd,
      valorUnitarioCentavos: dados.precoUnidadeExtraCentavos,
      valorTotalCentavos: total,
    });
  }

  if (dados.profissionaisProntuarioFaturaveis > 0 && dados.precoProntuarioCentavos > 0) {
    const qtd = dados.profissionaisProntuarioFaturaveis;
    const total = qtd * dados.precoProntuarioCentavos;
    itens.push({
      tipo: "prontuario_licenca",
      descricao: `Licenças do Módulo Prontuário Eletrônico (${qtd}x)`,
      quantidade: qtd,
      valorUnitarioCentavos: dados.precoProntuarioCentavos,
      valorTotalCentavos: total,
    });
  }

  const valorTotalCentavos = itens.reduce((soma, i) => soma + i.valorTotalCentavos, 0);
  return { itens, valorTotalCentavos };
}
