// RBAC: primeira barreira de autorização (a RLS no banco é a segunda).
// Domínio puro: sem I/O.

export const ROLES = ["admin", "recepcao", "profissional"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSOES = {
  "tenant.configurar": ["admin"],
  "membros.gerenciar": ["admin"],
  "auditoria.ver": ["admin"],
  "salas.gerenciar": ["admin"],
  "profissionais.gerenciar": ["admin", "recepcao"],
  "acordos.gerenciar": ["admin"],
  "financeiro.ver": ["admin", "recepcao"],
  "financeiro.fechar": ["admin"],
  // Recalcular o mês e (des)ativar profissional mexem no que já foi combinado: só o admin.
  "financeiro.reprocessar": ["admin"],
  "profissionais.desativar": ["admin"],
  "financeiro.ajustar": ["admin"],
  "fiscal.configurar": ["admin"],
  "fiscal.emitir": ["admin"],
  "fiscal.ver": ["admin", "recepcao"],
  "pagamentos.baixar": ["admin", "recepcao"],
  "cobrancas.gerenciar": ["admin", "recepcao"],
  "assinatura.ver": ["admin"],
  "pacientes.gerenciar": ["admin", "recepcao"],
  // Direitos do titular (LGPD): exportar e anonimizar o cadastro do paciente.
  "pacientes.titular": ["admin"],
  "pacientes.proprios": ["profissional"],
  "pacientes.ver": ["admin", "recepcao", "profissional"],
  "agenda.gerenciar": ["admin", "recepcao"],
  "agenda.propria": ["admin", "recepcao", "profissional"],
  "agenda.ver": ["admin", "recepcao", "profissional"],
  "reservas.gerenciar": ["admin", "recepcao"],
  "reservas.proprias": ["profissional"],
  "agenda_online.configurar": ["admin", "profissional"],
  "prontuario.proprio": ["profissional"],
  "prontuario.solicitacao": ["admin"],
  "prontuario.menu": ["admin", "profissional"],
  "extrato.proprio": ["profissional"],
  // Preço e regras do contrato são do admin; a recepção consulta.
  "contratos.gerenciar": ["admin"],
  "contratos.ver": ["admin", "recepcao", "profissional"],
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
