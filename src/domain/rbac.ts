// RBAC: primeira barreira de autorização (a RLS no banco é a segunda).
// Domínio puro: sem I/O.

export const ROLES = ["admin", "recepcao", "profissional"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSOES = {
  "tenant.configurar": ["admin"],
  "membros.gerenciar": ["admin"],
  "auditoria.ver": ["admin"],
  "salas.gerenciar": ["admin"],
  "acordos.gerenciar": ["admin"],
  "financeiro.ver": ["admin"],
  "pagamentos.baixar": ["admin", "recepcao"],
  "pacientes.gerenciar": ["admin", "recepcao"],
  "agenda.gerenciar": ["admin", "recepcao"],
  "agenda.propria": ["admin", "recepcao", "profissional"],
  "reservas.proprias": ["profissional"],
  "extrato.proprio": ["profissional"],
} as const satisfies Record<string, readonly Role[]>;

export type Permissao = keyof typeof PERMISSOES;

export const ROTULOS_ROLE: Record<Role, string> = {
  admin: "Admin",
  recepcao: "Recepção",
  profissional: "Profissional",
};

export function pode(role: Role, permissao: Permissao): boolean {
  return (PERMISSOES[permissao] as readonly Role[]).includes(role);
}

export class ErroPermissao extends Error {
  constructor(
    readonly role: Role,
    readonly permissao: Permissao,
  ) {
    super(`Papel "${role}" não tem a permissão "${permissao}"`);
    this.name = "ErroPermissao";
  }
}

export function exigirPermissao(role: Role, permissao: Permissao): void {
  if (!pode(role, permissao)) throw new ErroPermissao(role, permissao);
}
