// Papel timbrado dos documentos impressos (cabeçalho, rodapé e logo). Domínio puro.

export const LIMITE_LOGO_BYTES = 500 * 1024;
export const LIMITE_TEXTO_TIMBRADO = 600;
export const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"] as const;
export type TipoLogo = (typeof TIPOS_LOGO)[number];

export const ALINHAMENTOS = ["centro", "esquerda"] as const;
export type Alinhamento = (typeof ALINHAMENTOS)[number];

/** Variáveis aceitas nos textos, com a descrição mostrada no editor. */
export const VARIAVEIS_TIMBRADO = [
  ["{clinica}", "Nome da clínica"],
  ["{profissional}", "Nome do profissional"],
  ["{especialidade}", "Especialidade"],
  ["{conselho}", "Conselho e registro (ex.: CRM 12345)"],
  ["{email}", "E-mail do profissional"],
  ["{telefone}", "Telefone do profissional"],
  ["{endereco}", "Endereço da unidade"],
] as const;

export type DadosTimbrado = {
  clinica: string;
  profissional?: string | null;
  especialidade?: string | null;
  conselho?: string | null;
  registro?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
};

export const CABECALHO_PADRAO = "{clinica}\n{profissional} · {especialidade} · {conselho}";
export const RODAPE_PADRAO = "{clinica} · {endereco}";

/**
 * Troca as variáveis pelos dados. Linhas que ficarem vazias somem, e separadores (·, -, |, ,)
 * soltos nas pontas ou repetidos são limpos: "{a} · {b}" sem `b` vira só "a".
 */
export function aplicarVariaveis(texto: string, dados: DadosTimbrado): string {
  const conselho = [dados.conselho, dados.registro].filter((v) => v && v.trim()).join(" ");
  const valores: Record<string, string> = {
    clinica: dados.clinica ?? "",
    profissional: dados.profissional ?? "",
    especialidade: dados.especialidade ?? "",
    conselho,
    email: dados.email ?? "",
    telefone: dados.telefone ?? "",
    endereco: dados.endereco ?? "",
  };
  return texto
    .split(/\r?\n/)
    .map((linha) => {
      const temVariavel = /\{(\w+)\}/.test(linha);
      const trocada = linha.replace(/\{(\w+)\}/g, (inteiro, nome: string) => (nome in valores ? valores[nome].trim() : inteiro));
      if (!temVariavel) return trocada.trim();
      return trocada
        .replace(/\s*([·|\-,])\s*(?:[·|\-,]\s*)+/g, " $1 ") // separadores repetidos
        .replace(/^\s*[·|\-,]\s*|\s*[·|\-,]\s*$/g, "") // separadores nas pontas
        .replace(/\s{2,}/g, " ")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** Tipo real da imagem pelos primeiros bytes (não confia na extensão nem no Content-Type). */
export function tipoDaImagem(bytes: Uint8Array): TipoLogo | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Erro de validação da logo, ou null se estiver ok. */
export function validarLogo(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "Arquivo vazio";
  if (bytes.length > LIMITE_LOGO_BYTES) return "A logo deve ter no máximo 500 KB";
  if (!tipoDaImagem(bytes)) return "Envie a logo em PNG, JPG ou WebP";
  return null;
}

export function logoComoDataUrl(bytes: Uint8Array, tipo: string): string {
  return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
}
