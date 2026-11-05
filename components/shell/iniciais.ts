/** Iniciais para o avatar: "Dra. Ana Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome
    .replace(/^(dra?|sr|sra)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}
