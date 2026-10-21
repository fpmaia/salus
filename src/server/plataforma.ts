import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "../db/client";
import { auditPlataforma, planosSaas, users } from "../db/schema";
import { withUser } from "../db/tenant";
import { ErroNegocio } from "./erros";

export type MetricasPlataforma = {
  totalClinicas: number;
  clinicasAtivas: number;
  clinicasSuspensas: number;
  totalUsuarios: number;
  totalProfissionais: number;
  mrrEstimadoCentavos: number;
};

export type ClinicaPlataforma = {
  id: string;
  nome: string;
  status: "ativo" | "suspenso" | "cancelado";
  documento: string;
  planoCodigo: string;
  planoNome: string;
  planoPrecoCentavos: number;
  membrosCount: number;
  salasCount: number;
  profissionaisCount: number;
  criadoEm: Date;
};

export type UsuarioPlataforma = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  clinicasCount: number;
  createdAt: Date;
};

export async function ehSuperadmin(userId: string, database: Database = getDb()): Promise<boolean> {
  const [u] = await database
    .select({ role: users.role, banned: users.banned })
    .from(users)
    .where(eq(users.id, userId));
  return Boolean(u && u.role === "superadmin" && !u.banned);
}

export async function exigirSuperadmin(userId: string, database: Database = getDb()): Promise<void> {
  const ok = await ehSuperadmin(userId, database);
  if (!ok) {
    throw new ErroNegocio("Acesso negado: área restrita ao dono da plataforma Salus.");
  }
}

export async function obterMetricasPlataforma(
  userId: string,
  database?: Database,
): Promise<MetricasPlataforma> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        total_clinicas: string;
        clinicas_ativas: string;
        clinicas_suspensas: string;
        total_usuarios: string;
        total_profissionais: string;
        mrr_estimado_centavos: string;
      }>(sql`select * from app_plataforma_metricas()`);

      const r = rows[0];
      return {
        totalClinicas: Number(r?.total_clinicas || 0),
        clinicasAtivas: Number(r?.clinicas_ativas || 0),
        clinicasSuspensas: Number(r?.clinicas_suspensas || 0),
        totalUsuarios: Number(r?.total_usuarios || 0),
        totalProfissionais: Number(r?.total_profissionais || 0),
        mrrEstimadoCentavos: Number(r?.mrr_estimado_centavos || 0),
      };
    },
    database,
  );
}

export async function listarClinicasPlataforma(
  userId: string,
  database?: Database,
): Promise<ClinicaPlataforma[]> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        nome: string;
        status: "ativo" | "suspenso" | "cancelado";
        documento: string;
        plano_codigo: string;
        plano_nome: string;
        plano_preco_centavos: number;
        membros_count: string;
        salas_count: string;
        profissionais_count: string;
        criado_em: string;
      }>(sql`select * from app_plataforma_clinicas()`);

      return rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        status: r.status,
        documento: r.documento,
        planoCodigo: r.plano_codigo,
        planoNome: r.plano_nome,
        planoPrecoCentavos: Number(r.plano_preco_centavos),
        membrosCount: Number(r.membros_count),
        salasCount: Number(r.salas_count),
        profissionaisCount: Number(r.profissionais_count),
        criadoEm: new Date(r.criado_em),
      }));
    },
    database,
  );
}

export async function listarUsuariosPlataforma(
  userId: string,
  database?: Database,
): Promise<UsuarioPlataforma[]> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        name: string;
        email: string;
        role: string;
        banned: boolean;
        ban_reason: string | null;
        clinicas_count: string;
        created_at: string;
      }>(sql`select * from app_plataforma_usuarios()`);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role || "user",
        banned: Boolean(r.banned),
        banReason: r.ban_reason,
        clinicasCount: Number(r.clinicas_count),
        createdAt: new Date(r.created_at),
      }));
    },
    database,
  );
}

export async function listarPlanosDisponiveis(
  userId: string,
  database: Database = getDb(),
) {
  await exigirSuperadmin(userId, database);
  return database.select().from(planosSaas).where(eq(planosSaas.ativo, true));
}

export async function suspenderClinicaPlataforma(
  userId: string,
  tenantId: string,
  motivo: string,
  database?: Database,
): Promise<void> {
  await exigirSuperadmin(userId, database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_suspender_clinica(${tenantId}, ${motivo})`);
    },
    database,
  );
}

export async function reativarClinicaPlataforma(
  userId: string,
  tenantId: string,
  database?: Database,
): Promise<void> {
  await exigirSuperadmin(userId, database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_reativar_clinica(${tenantId})`);
    },
    database,
  );
}

export async function alterarPlanoClinicaPlataforma(
  userId: string,
  tenantId: string,
  planoId: string,
  database?: Database,
): Promise<void> {
  await exigirSuperadmin(userId, database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_alterar_plano(${tenantId}, ${planoId})`);
    },
    database,
  );
}

export async function banirUsuarioPlataforma(
  userId: string,
  usuarioAlvoId: string,
  motivo: string,
  database?: Database,
): Promise<void> {
  await exigirSuperadmin(userId, database);
  if (usuarioAlvoId === userId) {
    throw new ErroNegocio("Você não pode banir seu próprio usuário superadmin.");
  }
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_banir_usuario(${usuarioAlvoId}, ${motivo})`);
    },
    database,
  );
}

export async function desbanirUsuarioPlataforma(
  userId: string,
  usuarioAlvoId: string,
  database?: Database,
): Promise<void> {
  await exigirSuperadmin(userId, database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_desbanir_usuario(${usuarioAlvoId})`);
    },
    database,
  );
}

export async function listarAuditoriaPlataforma(
  userId: string,
  limite = 50,
  database: Database = getDb(),
) {
  await exigirSuperadmin(userId, database);
  return database
    .select({
      id: auditPlataforma.id,
      userId: auditPlataforma.userId,
      userNome: users.name,
      userEmail: users.email,
      acao: auditPlataforma.acao,
      alvoTipo: auditPlataforma.alvoTipo,
      alvoId: auditPlataforma.alvoId,
      dados: auditPlataforma.dados,
      criadoEm: auditPlataforma.criadoEm,
    })
    .from(auditPlataforma)
    .leftJoin(users, eq(users.id, auditPlataforma.userId))
    .orderBy(desc(auditPlataforma.criadoEm))
    .limit(limite);
}
