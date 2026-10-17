// Regras do prontuário. Domínio puro: sem I/O.

export type ConteudoClinico = {
  /** Evolução / anotações clínicas. */
  anotacoes: string;
  /** Prescrição, orientações ou atestado em texto livre (sem validade de receita digital). */
  prescricao: string;
};

export const LIMITE_CONTEUDO = 20_000;
export const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
export const TIPOS_ANEXO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export function validarConteudo(c: ConteudoClinico): string | null {
  if (!c.anotacoes.trim() && !c.prescricao.trim()) return "Escreva a evolução ou a prescrição";
  if (c.anotacoes.length > LIMITE_CONTEUDO || c.prescricao.length > LIMITE_CONTEUDO) {
    return `Cada campo aceita até ${LIMITE_CONTEUDO} caracteres`;
  }
  return null;
}

export function validarAnexo(tipo: string, tamanho: number): string | null {
  if (!(TIPOS_ANEXO as readonly string[]).includes(tipo)) return "Formato não aceito (use PDF, JPG, PNG ou WebP)";
  if (tamanho <= 0) return "Arquivo vazio";
  if (tamanho > LIMITE_ANEXO_BYTES) return "Arquivo maior que 10 MB";
  return null;
}

/**
 * Representação canônica de um registro finalizado (base do hash de integridade).
 * Qualquer alteração em conteúdo, autoria, paciente, datas ou anexos muda o hash.
 */
export function canonicoDoRegistro(r: {
  id: string;
  pacienteId: string;
  profissionalId: string;
  agendamentoId: string | null;
  tipo: string;
  adendoDe: string | null;
  conteudo: ConteudoClinico;
  anexos: string[]; // hashes SHA-256
  finalizadoEm: Date;
}): string {
  return JSON.stringify([
    "salus.prontuario.v1",
    r.id,
    r.pacienteId,
    r.profissionalId,
    r.agendamentoId,
    r.tipo,
    r.adendoDe,
    r.conteudo.anotacoes,
    r.conteudo.prescricao,
    [...r.anexos].sort(),
    r.finalizadoEm.toISOString(),
  ]);
}

/** Nome de arquivo seguro para cabeçalho Content-Disposition. */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "_")
    .trim()
    .slice(0, 120);
  return limpo || "arquivo";
}
