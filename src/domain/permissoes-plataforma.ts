// Papéis da equipe Salus na área /plataforma. Espelho de app_plataforma_pode (migration 0046):
// o servidor recusa antes, o banco recusa de novo; um teste de integração confere os dois.

export const PAPEIS_PLATAFORMA = ["dono", "financeiro", "suporte"] as const;
export type PapelPlataforma = (typeof PAPEIS_PLATAFORMA)[number];

export const ROTULOS_PAPEL_PLATAFORMA: Record<PapelPlataforma, string> = {
  dono: "Dono",
  financeiro: "Financeiro",
  suporte: "Suporte",
};

export const DESCRICOES_PAPEL_PLATAFORMA: Record<PapelPlataforma, string> = {
  dono: "Tudo, inclusive planos, equipe e banimento de usuários.",
  financeiro: "Cobrança: plano da clínica, teste grátis, descontos, faturas, acordos, cupons e convites.",
  suporte: "Atendimento: vê tudo, suspende e reativa clínicas, notas e sessões. Não mexe em valores.",
};

export const PERMISSOES_PLATAFORMA = {
  ver: ["dono", "financeiro", "suporte"],
  "clinicas.gerenciar": ["dono", "suporte"],
  "convites.gerenciar": ["dono", "financeiro"],
  "financeiro.gerenciar": ["dono", "financeiro"],
  "usuarios.banir": ["dono"],
  "planos.editar": ["dono"],
  "equipe.gerenciar": ["dono"],
} as const satisfies Record<string, readonly PapelPlataforma[]>;

export type PermissaoPlataforma = keyof typeof PERMISSOES_PLATAFORMA;

export function papelPode(papel: PapelPlataforma | null | undefined, permissao: PermissaoPlataforma): boolean {
  return papel != null && (PERMISSOES_PLATAFORMA[permissao] as readonly PapelPlataforma[]).includes(papel);
}
