// Acordo de renegociação de faturas do SaaS: soma das faturas em aberto, desconto opcional e
// divisão em parcelas mensais. Domínio puro: sem I/O.

export const MAXIMO_PARCELAS_ACORDO = 24;

export type ParcelaAcordo = { numero: number; valorCentavos: number; vencimento: string };

/** Mesmo dia nos meses seguintes; dia que não existe no mês cai no último dia (31/01 → 28/02). */
export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/** Desconto do acordo em centavos: percentual (1 a 99) sobre o total ou valor fixo. */
export function descontoDoAcordo(valorOriginalCentavos: number, desconto: { tipo: "percentual" | "valor"; valor: number } | null): number {
  if (!desconto || desconto.valor <= 0) return 0;
  return desconto.tipo === "percentual" ? Math.round((valorOriginalCentavos * desconto.valor) / 100) : desconto.valor;
}

/** Parcelas iguais e mensais; os centavos que sobram vão para a última. */
export function simularAcordo(dados: {
  valorOriginalCentavos: number;
  descontoCentavos: number;
  parcelas: number;
  primeiroVencimento: string;
}): { valorFinalCentavos: number; parcelas: ParcelaAcordo[] } {
  const valorFinalCentavos = dados.valorOriginalCentavos - dados.descontoCentavos;
  const n = Math.trunc(dados.parcelas);
  const base = Math.floor(valorFinalCentavos / n);
  const parcelas = Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valorCentavos: i === n - 1 ? valorFinalCentavos - base * (n - 1) : base,
    vencimento: somarMeses(dados.primeiroVencimento, i),
  }));
  return { valorFinalCentavos, parcelas };
}

/** Motivo para recusar o acordo, ou null se as parcelas fecham com o total e as datas sobem. */
export function validarAcordo(dados: {
  valorOriginalCentavos: number;
  descontoCentavos: number;
  parcelas: { valorCentavos: number; vencimento: string }[];
  hoje: string;
}): string | null {
  if (dados.valorOriginalCentavos <= 0) return "Escolha ao menos uma fatura em aberto";
  if (dados.descontoCentavos < 0 || dados.descontoCentavos >= dados.valorOriginalCentavos) {
    return "O desconto precisa ser menor que o total (para perdoar tudo, cancele as faturas)";
  }
  if (dados.parcelas.length < 1 || dados.parcelas.length > MAXIMO_PARCELAS_ACORDO) return `De 1 a ${MAXIMO_PARCELAS_ACORDO} parcelas`;
  if (dados.parcelas.some((p) => !Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0)) return "Toda parcela precisa ter valor";
  const soma = dados.parcelas.reduce((t, p) => t + p.valorCentavos, 0);
  if (soma !== dados.valorOriginalCentavos - dados.descontoCentavos) return "A soma das parcelas precisa fechar com o total do acordo";
  let anterior = "";
  for (const p of dados.parcelas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) return "Data de parcela inválida";
    if (p.vencimento < dados.hoje) return "As parcelas não podem vencer no passado";
    if (anterior && p.vencimento <= anterior) return "Cada parcela precisa vencer depois da anterior";
    anterior = p.vencimento;
  }
  return null;
}
