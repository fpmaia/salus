// Termos de Uso e Política de Privacidade: versão única para os dois documentos. Ao mudar o
// texto de forma relevante, troque a versão: todo usuário precisa aceitar de novo ao entrar
// (src/server/aceites.ts). Os textos são um modelo e precisam de revisão jurídica antes de
// valerem com clientes reais (docs/deploy.md, checklist).

export const VERSAO_DOCUMENTOS = "2026-10-21";

export type Controlador = {
  /** Razão social de quem opera o Salus. */
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  /** Encarregado pelo tratamento de dados pessoais (DPO, art. 41 da LGPD). */
  encarregadoNome: string | null;
  encarregadoEmail: string;
};

/** Identificação da empresa e do encarregado (variáveis SALUS_EMPRESA_* e SALUS_ENCARREGADO_*). */
export function controlador(): Controlador {
  return {
    nome: process.env.SALUS_EMPRESA_NOME || "LS Code",
    cnpj: process.env.SALUS_EMPRESA_CNPJ || null,
    endereco: process.env.SALUS_EMPRESA_ENDERECO || null,
    encarregadoNome: process.env.SALUS_ENCARREGADO_NOME || null,
    encarregadoEmail: process.env.SALUS_ENCARREGADO_EMAIL || "privacidade@salus.local",
  };
}

export function versaoPorExtenso(versao = VERSAO_DOCUMENTOS): string {
  const [ano, mes, dia] = versao.split("-");
  return `${dia}/${mes}/${ano}`;
}
