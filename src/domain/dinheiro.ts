// Valores monetários em centavos (inteiros). Domínio puro: sem I/O.

const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarMoeda(centavos: number): string {
  return formatador.format(centavos / 100);
}

/** "1.234,56", "1234.56", "R$ 80" → centavos. null se vazio ou inválido. */
export function lerMoeda(texto: string): number | null {
  let limpo = texto.replace(/R\$|\s/g, "");
  if (!limpo) return null;
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/** Percentual em pontos-base (3000 = 30%) ↔ texto "30" / "12,5". */
export function lerPercentualBp(texto: string): number | null {
  const limpo = texto.replace(/%|\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

export function formatarPercentual(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Aplica pontos-base com arredondamento ao centavo mais próximo. */
export function aplicarBp(centavos: number, bp: number): number {
  return Math.round((centavos * bp) / 10_000);
}
