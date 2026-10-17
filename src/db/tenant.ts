import { sql } from "drizzle-orm";
import { z } from "zod";
import { ROLES } from "../domain/rbac";
import { getDb, type Database, type Transaction } from "./client";

const contextoTenantSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(ROLES),
});

export type ContextoTenant = z.infer<typeof contextoTenantSchema>;

/**
 * Executa `fn` numa transação com o contexto do tenant definido via SET LOCAL
 * (set_config(..., true)): app.tenant_id, app.user_id e app.role.
 *
 * As políticas de RLS leem app.tenant_id; ao fim da transação os valores somem,
 * então a conexão volta ao pool sem contexto. Nenhuma query de tenant roda fora daqui.
 */
export async function withTenant<T>(
  ctx: ContextoTenant,
  fn: (tx: Transaction) => Promise<T>,
  database: Database = getDb(),
): Promise<T> {
  const { tenantId, userId, role } = contextoTenantSchema.parse(ctx);
  return database.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.tenant_id', ${tenantId}, true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.role', ${role}, true)
    `);
    return fn(tx);
  });
}

/**
 * Contexto do prontuário: além do tenant, define app.profissional_id (a RLS clínica só
 * mostra registros do próprio profissional ou compartilhados com ele). `solicitacao`
 * libera a leitura para o admin numa solicitação formal (auditada pelo chamador).
 */
export async function withProntuario<T>(
  ctx: ContextoTenant,
  profissionalId: string | null,
  fn: (tx: Transaction) => Promise<T>,
  opcoes: { solicitacao?: boolean; database?: Database } = {},
): Promise<T> {
  const { tenantId, userId, role } = contextoTenantSchema.parse(ctx);
  const profissional = profissionalId === null ? "" : z.uuid().parse(profissionalId);
  const solicitacao = opcoes.solicitacao && role === "admin" ? "on" : "";
  return (opcoes.database ?? getDb()).transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.tenant_id', ${tenantId}, true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.role', ${role}, true),
        set_config('app.profissional_id', ${profissional}, true),
        set_config('app.prontuario_solicitacao', ${solicitacao}, true)
    `);
    return fn(tx);
  });
}

/**
 * Contexto de sistema (worker): tenant definido, sem usuário. app.role = 'sistema';
 * colunas com default app_current_user_id() (audit_log.user_id, criado_por) ficam nulas.
 */
export async function withSistema<T>(
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
  database: Database = getDb(),
): Promise<T> {
  const id = z.uuid().parse(tenantId);
  return database.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.tenant_id', ${id}, true),
        set_config('app.role', 'sistema', true)
    `);
    return fn(tx);
  });
}

/** Ids dos tenants ativos (função SECURITY DEFINER), para jobs que percorrem todos. */
export async function listarTenantsAtivos(database: Database = getDb()): Promise<string[]> {
  const { rows } = await database.execute<{ id: string }>(sql`select app_tenants_ativos() as id`);
  return rows.map((linha) => linha.id);
}

/**
 * Contexto só de usuário (sem tenant): usado para descobrir as memberships do
 * usuário logado via app_memberships_do_usuario(). Tabelas de tenant continuam
 * invisíveis, pois app.tenant_id não está definido.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
  database: Database = getDb(),
): Promise<T> {
  const id = z.uuid().parse(userId);
  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${id}, true)`);
    return fn(tx);
  });
}
