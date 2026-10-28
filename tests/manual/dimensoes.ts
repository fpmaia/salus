import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Largura e altura de cada print (lidas do cabeçalho do PNG) para o next/image do manual
// reservar o espaço certo. Gera components/manual/dimensoes-telas.json.
export function gravarDimensoesDasTelas(pasta = path.resolve("public/manual/telas")) {
  const dimensoes: Record<string, { largura: number; altura: number }> = {};
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith(".png")).sort()) {
    const cabecalho = readFileSync(path.join(pasta, arquivo)).subarray(16, 24);
    dimensoes[arquivo.replace(/\.png$/, "")] = { largura: cabecalho.readUInt32BE(0), altura: cabecalho.readUInt32BE(4) };
  }
  writeFileSync(path.resolve("components/manual/dimensoes-telas.json"), `${JSON.stringify(dimensoes, null, 2)}\n`);
}
