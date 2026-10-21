// CSV para abrir no Excel em português: ponto e vírgula, BOM UTF-8 e CRLF. Domínio puro: sem I/O.

function celula(valor: string | number | null): string {
  const texto = valor === null ? "" : String(valor);
  // Fórmulas viram texto (injeção de CSV ao abrir no Excel); números negativos ficam números.
  const numero = /^-?\d+(,\d+)?$/.test(texto);
  const seguro = !numero && /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function gerarCsv(linhas: (string | number | null)[][]): string {
  return `\uFEFF${linhas.map((l) => l.map(celula).join(";")).join("\r\n")}\r\n`;
}

/** Centavos no formato do Excel brasileiro (1234,56), sem símbolo. */
export function decimalBr(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
