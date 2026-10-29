// Números do painel financeiro da plataforma a partir das faturas do SaaS. Domínio puro.

export type FaturaDoPainel = {
  /** Status para exibir: "pendente" já vencida conta como "vencida". */
  status: string;
  valorCentavos: number;
  vencimento: string;
  competencia: string;
  /** Data do pagamento no fuso de São Paulo (AAAA-MM-DD). */
  pagoEmData: string | null;
  itens: { tipo: string; valorTotalCentavos: number }[];
};

export type FaixaAtraso = "1-15" | "16-30" | "31+";

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

export function faixaDeAtraso(vencimento: string, hoje: string): FaixaAtraso | null {
  const dias = diasEntre(vencimento, hoje);
  if (dias <= 0) return null;
  return dias <= 15 ? "1-15" : dias <= 30 ? "16-30" : "31+";
}

export function resumoFinanceiro(faturas: FaturaDoPainel[], hoje: string) {
  const mes = hoje.slice(0, 7);
  const atraso: Record<FaixaAtraso, { quantidade: number; valorCentavos: number }> = {
    "1-15": { quantidade: 0, valorCentavos: 0 },
    "16-30": { quantidade: 0, valorCentavos: 0 },
    "31+": { quantidade: 0, valorCentavos: 0 },
  };
  const porTipo: Record<string, number> = {};
  let recebidoNoMesCentavos = 0;
  let aReceberNoMesCentavos = 0;
  let emAtrasoCentavos = 0;
  let descontosNoMesCentavos = 0;

  for (const f of faturas) {
    if (f.status === "paga" && f.pagoEmData?.startsWith(mes)) recebidoNoMesCentavos += f.valorCentavos;
    const aberta = f.status === "pendente" || f.status === "vencida" || f.status === "erro";
    if (aberta && f.vencimento.startsWith(mes)) aReceberNoMesCentavos += f.valorCentavos;
    if (aberta) {
      const faixa = faixaDeAtraso(f.vencimento, hoje);
      if (faixa) {
        atraso[faixa].quantidade++;
        atraso[faixa].valorCentavos += f.valorCentavos;
        emAtrasoCentavos += f.valorCentavos;
      }
    }
    if (f.status === "cancelada") continue;
    for (const i of f.itens) {
      if (i.valorTotalCentavos < 0) {
        if (f.competencia.startsWith(mes)) descontosNoMesCentavos -= i.valorTotalCentavos;
      } else {
        porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + i.valorTotalCentavos;
      }
    }
  }
  return { recebidoNoMesCentavos, aReceberNoMesCentavos, emAtrasoCentavos, descontosNoMesCentavos, atraso, porTipo };
}
