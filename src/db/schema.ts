import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Convenções
 * - Tabelas de tenant: id uuid, tenant_id, criado_em, atualizado_em.
 *   tenant_id tem default app_current_tenant_id() (contexto do withTenant) e a RLS
 *   (migration 0002) garante que só o tenant do contexto é lido/gravado.
 * - Tabelas do Better Auth (users, sessions, accounts, verifications) são globais e
 *   seguem os nomes de campo da biblioteca.
 * - RLS, grants e políticas ficam em migrations SQL customizadas, não aqui.
 */

const criadoEm = () =>
  timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const tenantIdDoContexto = () =>
  uuid("tenant_id")
    .notNull()
    .default(sql`app_current_tenant_id()`)
    .references(() => tenants.id, { onDelete: "cascade" });

export const membershipRole = pgEnum("membership_role", [
  "admin",
  "recepcao",
  "profissional",
]);
export const tipoDocumento = pgEnum("tipo_documento", ["cpf", "cnpj"]);
export const tenantStatus = pgEnum("tenant_status", [
  "ativo",
  "suspenso",
  "cancelado",
]);

// ---------------------------------------------------------------------------
// Globais
// ---------------------------------------------------------------------------

export const planosSaas = pgTable("planos_saas", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  precoMensalCentavos: integer("preco_mensal_centavos").notNull(),
  limites: jsonb("limites").$type<Record<string, number>>().notNull().default({}),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

// Better Auth: e-mail único global; o vínculo com tenants é via memberships.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Tenant (RLS)
// ---------------------------------------------------------------------------

// A própria linha do tenant também é protegida: policy por id = app_current_tenant_id().
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  tipoDocumento: tipoDocumento("tipo_documento").notNull(),
  documento: text("documento").notNull(),
  planoId: uuid("plano_id")
    .notNull()
    .references(() => planosSaas.id),
  status: tenantStatus("status").notNull().default("ativo"),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    preferencias: jsonb("preferencias").$type<Record<string, unknown>>().notNull().default({}),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex("tenant_settings_tenant_id_key").on(t.tenantId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_key").on(t.tenantId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

// Append-only: o papel da aplicação só tem SELECT/INSERT (migration 0002).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    userId: uuid("user_id")
      .default(sql`app_current_user_id()`)
      .references(() => users.id, { onDelete: "set null" }),
    acao: text("acao").notNull(),
    entidade: text("entidade").notNull(),
    entidadeId: text("entidade_id"),
    dados: jsonb("dados").$type<Record<string, unknown>>(),
    criadoEm: criadoEm(),
  },
  (t) => [index("audit_log_tenant_criado_em_idx").on(t.tenantId, t.criadoEm)],
);
