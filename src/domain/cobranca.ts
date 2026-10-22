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

/** null = cabe no plano; texto = motivo para bloquear (uso atual + 1 passaria do limite). */
export function excedeLimite(limites: Record<string, number>, recurso: RecursoLimitado, usoAtual: number, plano: string): string | null {
  const limite = limites[recurso];
  if (limite === undefined) return null;
  if (usoAtual + 1 <= limite) return null;
  return `O plano ${plano} permite até ${limite} ${ROTULOS_RECURSO[recurso]} ativas(os). Faça upgrade em Assinatura.`;
}

/** Recursos cujo uso atual não cabe nos limites de outro plano (para bloquear downgrade). */
export function usoAcimaDosLimites(limites: Record<string, number>, uso: Record<RecursoLimitado, number>): RecursoLimitado[] {
  return RECURSOS_LIMITADOS.filter((r) => limites[r] !== undefined && uso[r] > limites[r]);
}
