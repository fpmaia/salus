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

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 0–999 por extenso ("cem", "cento e um", "duzentos e trinta e quatro"). */
function ateMil(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  if (n >= 100) partes.push(CENTENAS[Math.floor(n / 100)]);
  const resto = n % 100;
  if (resto >= 20) partes.push(DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ""));
  else if (resto > 0) partes.push(UNIDADES[resto]);
  return partes.join(" e ");
}

/** Inteiro por extenso, até a casa dos milhões ("mil e duzentos", "dois milhões e cem mil"). */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const grupos: { valor: number; texto: string }[] = [];
  if (milhoes) grupos.push({ valor: milhoes, texto: `${ateMil(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}` });
  if (milhares) grupos.push({ valor: milhares, texto: milhares === 1 ? "mil" : `${ateMil(milhares)} mil` });
  if (resto) grupos.push({ valor: resto, texto: ateMil(resto) });
  // "e" antes do grupo seguinte quando ele é menor que 100 ou uma centena redonda (mil e duzentos).
  return grupos
    .map((g, i) => (i === 0 ? g.texto : `${g.valor < 100 || g.valor % 100 === 0 ? "e " : ""}${g.texto}`))
    .join(" ");
}

/** Valor em centavos por extenso, como nos recibos: "cento e cinquenta reais e trinta centavos". */
export function valorPorExtenso(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const partes: string[] = [];
  if (reais > 0) {
    // "um milhão de reais", "dois milhões de reais".
    const deReais = reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${inteiroPorExtenso(reais)}${deReais} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cents > 0) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}
