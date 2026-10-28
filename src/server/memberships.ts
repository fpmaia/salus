import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { withUser } from "../db/tenant";
import type { Role } from "../domain/rbac";

export type MembershipDoUsuario = {
  membershipId: string;
  tenantId: string;
  tenantNome: string;
  role: Role;
};

/** Tenants (ativos) dos quais o usuário participa, via função SECURITY DEFINER. */
export async function listarMembershipsDoUsuario(
  userId: string,
  database?: Database,
): Promise<MembershipDoUsuario[]> {
  return withUser(
    userId,
    async (tx) => {
      const resultado = await tx.execute<{
        membership_id: string;
        tenant_id: string;
        tenant_nome: string;
        role: Role;
      }>(sql`select * from app_memberships_do_usuario()`);
      return resultado.rows.map((linha) => ({
        membershipId: linha.membership_id,
        tenantId: linha.tenant_id,
        tenantNome: linha.tenant_nome,
        role: linha.role,
      }));
    },
    database,
  );
}

/** O usuário participa de algum espaço suspenso ou cancelado pela plataforma? */
export async function usuarioTemEspacoBloqueado(userId: string, database?: Database): Promise<boolean> {
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ bloqueado: boolean }>(sql`select app_usuario_tem_espaco_bloqueado() as bloqueado`);
      return Boolean(rows[0]?.bloqueado);
    },
    database,
  );
}
