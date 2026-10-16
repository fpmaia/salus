// RBAC: primeira barreira de autorização (a RLS no banco é a segunda).
// Domínio puro: sem I/O.

export const ROLES = ["admin", "recepcao", "profissional"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSOES = {
  "tenant.configurar": ["admin"],
  "membros.gerenciar": ["admin"],
  "auditoria.ver": ["admin"],
  "salas.gerenciar": ["admin"],
  "profissionais.gerenciar": ["admin"],
  "acordos.gerenciar": ["admin"],
  "financeiro.ver": ["admin", "recepcao"],
  "financeiro.fechar": ["admin"],
  "financeiro.ajustar": ["admin"],
  "fiscal.configurar": ["admin"],
  "fiscal.emitir": ["admin"],
  "fiscal.ver": ["admin", "recepcao"],
  "pagamentos.baixar": ["admin", "recepcao"],
  "pacientes.gerenciar": ["admin", "recepcao"],
  "pacientes.proprios": ["profissional"],
  "pacientes.ver": ["admin", "recepcao", "profissional"],
  "agenda.gerenciar": ["admin", "recepcao"],
  "agenda.propria": ["admin", "recepcao", "profissional"],
  "agenda.ver": ["admin", "recepcao", "profissional"],
  "reservas.gerenciar": ["admin", "recepcao"],
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
