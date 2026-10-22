import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { formatarRange, lerRange, type Intervalo } from "./range";

/*
 * Convenções
 * - Tabelas de tenant: id uuid, tenant_id, criado_em, atualizado_em.
 *   tenant_id tem default app_current_tenant_id() (contexto do withTenant) e a RLS
 *   (migration 0002) garante que só o tenant do contexto é lido/gravado.
 * - Tabelas do Better Auth (users, sessions, accounts, verifications) são globais e
 *   seguem os nomes de campo da biblioteca.
 * - RLS, grants e políticas ficam em migrations SQL customizadas, não aqui.
 * - Referências entre tabelas de tenant usam FK composta (tenant_id, x_id): a FK não
 *   passa pela RLS, então sem isso um tenant poderia apontar para o id de outro.
 */

const tstzrange = customType<{ data: Intervalo; driverData: string }>({
  dataType: () => "tstzrange",
  toDriver: formatarRange,
  fromDriver: lerRange,
});

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
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  // Verificação em duas etapas (plugin twoFactor do Better Auth).
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
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
    impersonatedBy: text("impersonated_by"),
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

// Segredo TOTP e códigos de recuperação (cifrados pelo Better Auth com o BETTER_AUTH_SECRET).
export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId), index("two_factors_secret_idx").on(t.secret)],
);

// Aceites dos Termos de Uso e da Política de Privacidade (LGPD: prova do consentimento).
// Append-only: o app só insere e lê. Uma linha por usuário e versão (src/legal/documentos.ts).
export const aceitesDocumentos = pgTable(
  "aceites_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    versao: text("versao").notNull(),
    // cadastro | reaceite | script
    origem: text("origem").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    aceitoEm: criadoEm(),
  },
  (t) => [unique("aceites_documentos_user_versao_key").on(t.userId, t.versao)],
);

// Contadores de rate limit: do Better Auth (storage "database", chaves "<ip><rota>") e dos
// endpoints públicos (src/server/limite-taxa.ts, chaves "salus:..."). Fora da RLS: não é dado de tenant.
export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  // Epoch em milissegundos (formato do Better Auth).
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

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
  // Cliente do tenant na conta Asaas da plataforma (cobrança do SaaS).
  asaasCustomerId: text("asaas_customer_id"),
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
    // Política de cancelamento: abaixo desta antecedência o cancelamento é "tardio".
    antecedenciaCancelamentoHoras: integer("antecedencia_cancelamento_horas").notNull().default(24),
    // Módulos opcionais, desligados por padrão (menos tela e menos risco até o espaço precisar).
    moduloFiscal: boolean("modulo_fiscal").notNull().default(false),
    moduloAgendaOnline: boolean("modulo_agenda_online").notNull().default(false),
    moduloProntuario: boolean("modulo_prontuario").notNull().default(false),
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

// Auditoria da plataforma (ações globais de superadmin)
export const auditPlataforma = pgTable(
  "audit_plataforma",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    acao: text("acao").notNull(),
    alvoTipo: text("alvo_tipo").notNull(),
    alvoId: text("alvo_id"),
    dados: jsonb("dados").$type<Record<string, unknown>>(),
    criadoEm: criadoEm(),
  },
  (t) => [index("audit_plataforma_criado_em_idx").on(t.criadoEm)],
);

// ---------------------------------------------------------------------------
// Fase 1: espaço, profissionais e reservas de sala (RLS)
// ---------------------------------------------------------------------------

export const reservaStatus = pgEnum("reserva_status", ["ativa", "concluida", "cancelada"]);

export const unidades = pgTable(
  "unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    nome: text("nome").notNull(),
    endereco: text("endereco"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    // Início e fim das reservas são múltiplos do slot, a partir da meia-noite local.
    slotMinutos: integer("slot_minutos").notNull().default(30),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("unidades_tenant_id_id_key").on(t.tenantId, t.id),
    check("unidades_slot_minutos_check", sql`${t.slotMinutos} in (15, 30, 60)`),
  ],
);

// Vários intervalos por dia são permitidos (ex.: 08–12 e 14–18).
export const horariosFuncionamento = pgTable(
  "horarios_funcionamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    unidadeId: uuid("unidade_id").notNull(),
    // 0 = domingo … 6 = sábado
    diaSemana: smallint("dia_semana").notNull(),
    abre: time("abre").notNull(),
    fecha: time("fecha").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.unidadeId], foreignColumns: [unidades.tenantId, unidades.id] }).onDelete("cascade"),
    index("horarios_funcionamento_unidade_idx").on(t.unidadeId, t.diaSemana),
    check("horarios_funcionamento_dia_check", sql`${t.diaSemana} between 0 and 6`),
    check("horarios_funcionamento_intervalo_check", sql`${t.fecha} > ${t.abre}`),
  ],
);

// unidade_id nulo = feriado de todas as unidades do tenant.
export const feriados = pgTable(
  "feriados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    unidadeId: uuid("unidade_id"),
    data: date("data", { mode: "string" }).notNull(),
    descricao: text("descricao").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.unidadeId], foreignColumns: [unidades.tenantId, unidades.id] }).onDelete("cascade"),
    index("feriados_tenant_data_idx").on(t.tenantId, t.data),
  ],
);

export const salas = pgTable(
  "salas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    unidadeId: uuid("unidade_id").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("salas_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("salas_unidade_nome_key").on(t.unidadeId, t.nome),
    foreignKey({ columns: [t.tenantId, t.unidadeId], foreignColumns: [unidades.tenantId, unidades.id] }),
  ],
);

export const recursosSala = pgTable(
  "recursos_sala",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    salaId: uuid("sala_id").notNull(),
    nome: text("nome").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("recursos_sala_sala_nome_key").on(t.salaId, t.nome),
    foreignKey({ columns: [t.tenantId, t.salaId], foreignColumns: [salas.tenantId, salas.id] }).onDelete("cascade"),
  ],
);

// Cadastro do profissional no tenant. membership_id é preenchido quando o convite é aceito.
export const profissionais = pgTable(
  "profissionais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    telefone: text("telefone"),
    conselho: text("conselho"),
    registro: text("registro"),
    especialidade: text("especialidade"),
    // Tomador da NFS-e de locação (só dígitos).
    tipoDocumento: tipoDocumento("tipo_documento"),
    documento: text("documento"),
    // Cliente do profissional na conta Asaas do espaço (cobrança PIX/boleto).
    asaasCustomerId: text("asaas_customer_id"),
    // Agendamento online público (/agendar/<slug>).
    agendamentoOnline: boolean("agendamento_online").notNull().default(false),
    slugPublico: text("slug_publico"),
    duracaoConsultaMin: integer("duracao_consulta_min").notNull().default(60),
    antecedenciaMinHoras: integer("antecedencia_min_horas").notNull().default(2),
    janelaDias: integer("janela_dias").notNull().default(30),
    mensagemPublica: text("mensagem_publica"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("profissionais_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("profissionais_tenant_email_key").on(t.tenantId, t.email),
    uniqueIndex("profissionais_membership_key").on(t.membershipId),
    // Slug único na plataforma: a página pública resolve o tenant a partir dele.
    uniqueIndex("profissionais_slug_publico_key").on(t.slugPublico),
    check("profissionais_duracao_check", sql`${t.duracaoConsultaMin} between 15 and 480`),
    check("profissionais_janela_check", sql`${t.janelaDias} between 1 and 180 and ${t.antecedenciaMinHoras} between 0 and 168`),
  ],
);

// Só o hash SHA-256 do token é guardado; o link é mostrado uma única vez ao admin.
export const convitesProfissional = pgTable(
  "convites_profissional",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),
    aceitoPor: uuid("aceito_por").references(() => users.id, { onDelete: "set null" }),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }).onDelete("cascade"),
  ],
);

// Convites genéricos para qualquer papel da equipe (admin, recepcao, profissional)
export const convitesMembro = pgTable(
  "convites_membro",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    email: text("email").notNull(),
    role: membershipRole("role").notNull(),
    profissionalId: uuid("profissional_id").references(() => profissionais.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),
    aceitoPor: uuid("aceito_por").references(() => users.id, { onDelete: "set null" }),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("convites_membro_tenant_email_idx").on(t.tenantId, t.email),
    uniqueIndex("convites_membro_token_hash_idx").on(t.tokenHash),
  ],
);

// Recorrência semanal; o worker materializa as reservas numa janela à frente.
export const frequenciaRecorrencia = pgEnum("frequencia_recorrencia", ["semanal", "quinzenal", "mensal"]);

export const regrasRecorrencia = pgTable(
  "regras_recorrencia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    // Grade fixa de um contrato (acordos_financeiros); FK composta na migration 0029.
    acordoId: uuid("acordo_id"),
    salaId: uuid("sala_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    diaSemana: smallint("dia_semana").notNull(),
    // Quinzenal: semanas pares contadas da semana de data_inicio. Mensal: a N-ª ocorrência do
    // dia da semana no mês (5 = a última).
    frequencia: frequenciaRecorrencia("frequencia").notNull().default("semanal"),
    semanaDoMes: smallint("semana_do_mes"),
    // Regras criadas juntas (vários dias da semana num pedido) são encerradas juntas.
    grupoId: uuid("grupo_id"),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    dataInicio: date("data_inicio", { mode: "string" }).notNull(),
    dataFim: date("data_fim", { mode: "string" }),
    materializadaAte: date("materializada_ate", { mode: "string" }),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("regras_recorrencia_tenant_id_id_key").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.salaId], foreignColumns: [salas.tenantId, salas.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    check("regras_recorrencia_dia_check", sql`${t.diaSemana} between 0 and 6`),
    check("regras_recorrencia_intervalo_check", sql`${t.horaFim} > ${t.horaInicio}`),
    check(
      "regras_recorrencia_mensal_check",
      sql`(${t.frequencia} = 'mensal') = (${t.semanaDoMes} is not null) and (${t.semanaDoMes} is null or ${t.semanaDoMes} between 1 and 5)`,
    ),
    index("regras_recorrencia_grupo_idx").on(t.grupoId),
  ],
);

// Datas de uma série recorrente que o worker não conseguiu reservar (sala ou profissional já
// ocupado). O profissional recebe um e-mail e o admin vê nas pendências até resolver (C10).
export const datasNaoReservadas = pgTable(
  "datas_nao_reservadas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    regraId: uuid("regra_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    salaId: uuid("sala_id").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    avisadoEm: timestamp("avisado_em", { withTimezone: true }),
    resolvidaEm: timestamp("resolvida_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("datas_nao_reservadas_regra_data_key").on(t.regraId, t.data),
    foreignKey({ columns: [t.tenantId, t.regraId], foreignColumns: [regrasRecorrencia.tenantId, regrasRecorrencia.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.salaId], foreignColumns: [salas.tenantId, salas.id] }),
    index("datas_nao_reservadas_pendentes_idx").on(t.tenantId, t.resolvidaEm, t.data),
  ],
);

// Conflitos (mesma sala ou mesmo profissional no mesmo período) são barrados por
// EXCLUDE USING gist na migration custom de RLS da Fase 1.
export const reservasSala = pgTable(
  "reservas_sala",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    salaId: uuid("sala_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    periodo: tstzrange("periodo").notNull(),
    status: reservaStatus("status").notNull().default("ativa"),
    recorrenciaId: uuid("recorrencia_id"),
    // Data local da ocorrência (só para reservas de recorrência).
    dataOcorrencia: date("data_ocorrencia", { mode: "string" }),
    // Criada sozinha ao agendar num horário vazio: é liberada quando a consulta sai dela.
    criadaPeloAgendamento: boolean("criada_pelo_agendamento").notNull().default(false),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    // profissional | espaco (só o primeiro pode gerar multa de turno fixo).
    canceladaPor: text("cancelada_por").$type<"profissional" | "espaco">(),
    motivoCancelamento: text("motivo_cancelamento"),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("reservas_sala_tenant_id_id_key").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.salaId], foreignColumns: [salas.tenantId, salas.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.recorrenciaId], foreignColumns: [regrasRecorrencia.tenantId, regrasRecorrencia.id] }),
    // Uma ocorrência cancelada continua ocupando a data e não é recriada pelo worker.
    uniqueIndex("reservas_sala_recorrencia_data_key").on(t.recorrenciaId, t.dataOcorrencia),
    check("reservas_sala_periodo_check", sql`not isempty(${t.periodo}) and lower_inc(${t.periodo}) and not upper_inc(${t.periodo})`),
    index("reservas_sala_profissional_idx").on(t.profissionalId),
  ],
);

// ---------------------------------------------------------------------------
// Fase 2: pacientes e agendamentos (RLS)
// ---------------------------------------------------------------------------

export const origemAgendamento = pgEnum("origem_agendamento", ["equipe", "online"]);

export const agendamentoStatus = pgEnum("agendamento_status", [
  "agendado",
  "confirmado",
  "presente",
  "realizado",
  "falta",
  "cancelado",
]);

// Cadastro único do paciente no tenant (dados administrativos; nada clínico aqui).
export const pacientes = pgTable(
  "pacientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    nome: text("nome").notNull(),
    // Só dígitos; opcional (minimização de dados, LGPD).
    cpf: text("cpf"),
    dataNascimento: date("data_nascimento", { mode: "string" }),
    telefone: text("telefone"),
    // Telefone em E.164 (+55…), calculado pelo banco com a mesma regra de normalizarTelefoneBr:
    // a busca do agendamento online usa o índice em vez de carregar todos os pacientes (C15).
    telefoneNormalizado: text("telefone_normalizado").generatedAlwaysAs(
      sql`case when (case when length(regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '')) in (12, 13) and regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '') like '55%' then substr(regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', ''), 3) else regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '') end) ~ '^[1-9][0-9]{9,10}$' then '+55' || (case when length(regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '')) in (12, 13) and regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '') like '55%' then substr(regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', ''), 3) else regexp_replace(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), '^00', '') end) end`,
    ),
    email: text("email"),
    // Responsável legal (obrigatório para menores de 18): é quem paga e aparece no recibo.
    responsavelNome: text("responsavel_nome"),
    responsavelCpf: text("responsavel_cpf"),
    responsavelParentesco: text("responsavel_parentesco"),
    // Convênio: só cadastro (o Salus não fatura convênios).
    convenioNome: text("convenio_nome"),
    convenioCarteirinha: text("convenio_carteirinha"),
    // Endereço (recibo e cadastro). CEP só dígitos.
    cep: text("cep"),
    endereco: text("endereco"),
    bairro: text("bairro"),
    cidade: text("cidade"),
    uf: text("uf"),
    // Consentimento para lembretes (WhatsApp na Fase 4).
    consentimentoLembretes: boolean("consentimento_lembretes").notNull().default(false),
    consentimentoEm: timestamp("consentimento_em", { withTimezone: true }),
    ativo: boolean("ativo").notNull().default(true),
    // Anonimizado a pedido do titular (LGPD art. 18): sem dados identificáveis, irreversível.
    anonimizadoEm: timestamp("anonimizado_em", { withTimezone: true }),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("pacientes_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("pacientes_tenant_cpf_key").on(t.tenantId, t.cpf),
    index("pacientes_tenant_nome_idx").on(t.tenantId, t.nome),
    index("pacientes_tenant_telefone_idx").on(t.tenantId, t.telefoneNormalizado),
  ],
);

// Quais profissionais enxergam o paciente (quem cadastrou ou atende). Admin e recepção veem todos.
export const pacientesProfissionais = pgTable(
  "pacientes_profissionais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    pacienteId: uuid("paciente_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("pacientes_profissionais_key").on(t.pacienteId, t.profissionalId),
    index("pacientes_profissionais_profissional_idx").on(t.profissionalId),
    foreignKey({ columns: [t.tenantId, t.pacienteId], foreignColumns: [pacientes.tenantId, pacientes.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }).onDelete("cascade"),
  ],
);

// Atendimento de um paciente, sempre dentro de uma reserva de sala do mesmo profissional
// (garantido por trigger na migration custom da Fase 2).
export const agendamentos = pgTable(
  "agendamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    reservaId: uuid("reserva_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    pacienteId: uuid("paciente_id").notNull(),
    periodo: tstzrange("periodo").notNull(),
    status: agendamentoStatus("status").notNull().default("agendado"),
    // Status antes da última mudança: permite desfazer um clique errado (até 24h, pela equipe).
    statusAnterior: agendamentoStatus("status_anterior"),
    observacao: text("observacao"),
    remarcadoEm: timestamp("remarcado_em", { withTimezone: true }),
    statusAtualizadoEm: timestamp("status_atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    // paciente | profissional | espaco (cancelamento tardio pelo espaço não cobra).
    canceladoPor: text("cancelado_por").$type<"paciente" | "profissional" | "espaco">(),
    motivoCancelamento: text("motivo_cancelamento"),
    // Cancelado com menos antecedência que a política do tenant (base para cobrança na Fase 3).
    cancelamentoTardio: boolean("cancelamento_tardio").notNull().default(false),
    // Valor cobrado do paciente (base do modelo percentual e do repasse no caixa centralizado).
    // No pagamento direto é declarado pelo profissional/recepção; fica no audit_log.
    valorCentavos: integer("valor_centavos"),
    valorInformadoEm: timestamp("valor_informado_em", { withTimezone: true }),
    // "online" = marcado pelo próprio paciente na página pública.
    origem: origemAgendamento("origem").notNull().default("equipe"),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("agendamentos_tenant_id_id_key").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.reservaId], foreignColumns: [reservasSala.tenantId, reservasSala.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.pacienteId], foreignColumns: [pacientes.tenantId, pacientes.id] }),
    index("agendamentos_reserva_idx").on(t.reservaId),
    index("agendamentos_paciente_idx").on(t.pacienteId),
    check("agendamentos_periodo_check", sql`not isempty(${t.periodo}) and lower_inc(${t.periodo}) and not upper_inc(${t.periodo})`),
    check("agendamentos_valor_check", sql`${t.valorCentavos} is null or ${t.valorCentavos} >= 0`),
  ],
);

export const statusEspera = pgEnum("status_espera", ["aguardando", "agendado", "removido"]);

// Pacientes esperando horário (com um profissional ou qualquer um). A recepção vê quem espera
// quando um horário abre; nada é enviado automaticamente ao paciente.
export const listaEspera = pgTable(
  "lista_espera",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    pacienteId: uuid("paciente_id").notNull(),
    // null = qualquer profissional.
    profissionalId: uuid("profissional_id"),
    preferencia: text("preferencia"),
    status: statusEspera("status").notNull().default("aguardando"),
    agendamentoId: uuid("agendamento_id"),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.pacienteId], foreignColumns: [pacientes.tenantId, pacientes.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.agendamentoId], foreignColumns: [agendamentos.tenantId, agendamentos.id] }),
    index("lista_espera_aguardando_idx").on(t.tenantId, t.status, t.criadoEm),
  ],
);

// ---------------------------------------------------------------------------
// Fase 3: financeiro (RLS)
// ---------------------------------------------------------------------------

export const modeloCobranca = pgEnum("modelo_cobranca", ["hora", "consulta", "percentual", "mensalidade", "sala_fixa"]);
export const fluxoRecebimento = pgEnum("fluxo_recebimento", ["centralizado", "direto"]);
export const regraFalta = pgEnum("regra_falta", ["isenta", "integral", "percentual"]);
export const naturezaLancamento = pgEnum("natureza_lancamento", ["debito", "credito"]);
export const tipoLancamento = pgEnum("tipo_lancamento", [
  "locacao_hora",
  "locacao_consulta",
  "locacao_percentual",
  "falta",
  "multa_cancelamento",
  "mensalidade",
  "excedente_horas",
  "recebimento_paciente",
  "pagamento_profissional",
  "repasse_profissional",
  "ajuste",
]);
export const fechamentoStatus = pgEnum("fechamento_status", ["aberto", "fechado"]);
export const direcaoPagamento = pgEnum("direcao_pagamento", ["profissional_para_espaco", "espaco_para_profissional"]);
export const formaPagamento = pgEnum("forma_pagamento", ["pix", "dinheiro", "cartao", "transferencia", "boleto", "outro"]);

// Acordo do profissional com o espaço, versionado por vigência (reajuste = novo acordo).
// Vigências do mesmo profissional não se sobrepõem (EXCLUDE na migration custom).
// Contrato do profissional (uma versão por vigência): modelo de cobrança, valores, regras de
// falta e de cancelamento, grade fixa opcional (regras_recorrencia.acordo_id) e termos.
export const acordosFinanceiros = pgTable(
  "acordos_financeiros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    // CTR-AAAA-NNNN, por espaço; cada versão (reajuste) ganha o próprio código.
    codigo: text("codigo").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    salaId: uuid("sala_id"),
    modelo: modeloCobranca("modelo").notNull(),
    fluxoRecebimento: fluxoRecebimento("fluxo_recebimento").notNull().default("direto"),
    valorHoraCentavos: integer("valor_hora_centavos"),
    valorConsultaCentavos: integer("valor_consulta_centavos"),
    // Pontos-base: 3000 = 30%.
    percentualBp: integer("percentual_bp"),
    mensalidadeCentavos: integer("mensalidade_centavos"),
    horasIncluidas: integer("horas_incluidas"),
    regraFalta: regraFalta("regra_falta").notNull().default("isenta"),
    faltaPercentualBp: integer("falta_percentual_bp"),
    // Antecedência mínima (horas) para cancelar consulta ou reserva sem ser "tardio".
    prazoCancelamentoHoras: integer("prazo_cancelamento_horas").notNull().default(24),
    // Turno fixo por hora: % das horas cobrado quando o profissional cancela uma data da grade tarde.
    multaCancelamentoReservaBp: integer("multa_cancelamento_reserva_bp"),
    termos: text("termos"),
    observacoes: text("observacoes"),
    vigenteDe: date("vigente_de", { mode: "string" }).notNull(),
    vigenteAte: date("vigente_ate", { mode: "string" }),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("acordos_financeiros_tenant_id_id_key").on(t.tenantId, t.id),
    unique("acordos_financeiros_tenant_codigo_key").on(t.tenantId, t.codigo),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.salaId], foreignColumns: [salas.tenantId, salas.id] }).onDelete("set null"),
    index("acordos_financeiros_profissional_idx").on(t.profissionalId, t.vigenteDe),
    check("acordos_prazo_check", sql`${t.prazoCancelamentoHoras} between 0 and 720`),
    check("acordos_multa_check", sql`${t.multaCancelamentoReservaBp} is null or ${t.multaCancelamentoReservaBp} between 1 and 10000`),
    check("acordos_vigencia_check", sql`${t.vigenteAte} is null or ${t.vigenteAte} >= ${t.vigenteDe}`),
    check(
      "acordos_modelo_check",
      // coalesce: num CHECK, NULL passaria como verdadeiro.
      sql`coalesce(case ${t.modelo}
        when 'hora' then ${t.valorHoraCentavos} > 0
        when 'consulta' then ${t.valorConsultaCentavos} > 0
        when 'percentual' then ${t.percentualBp} between 1 and 10000
        when 'mensalidade' then ${t.mensalidadeCentavos} > 0 and (${t.horasIncluidas} is null or ${t.horasIncluidas} >= 0) and ${t.valorHoraCentavos} >= 0
      end, false)`,
    ),
    check(
      "acordos_falta_check",
      sql`${t.regraFalta} <> 'percentual' or coalesce(${t.faltaPercentualBp} between 1 and 10000, false)`,
    ),
  ],
);

// Livro-razão: conta corrente do profissional com o espaço. Append-only (só SELECT/INSERT
// para a aplicação). Débito = profissional deve ao espaço; crédito = espaço deve ao profissional.
// Estorno: mesmo tipo, natureza invertida, estorno_de apontando o original.
export const lancamentos = pgTable(
  "lancamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    // Primeiro dia do mês de competência.
    competencia: date("competencia", { mode: "string" }).notNull(),
    // Data local do fato gerador.
    dataReferencia: date("data_referencia", { mode: "string" }).notNull(),
    natureza: naturezaLancamento("natureza").notNull(),
    tipo: tipoLancamento("tipo").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    descricao: text("descricao").notNull(),
    // Fato gerador: "reserva:<id>", "agendamento:<id>", "competencia:<profissional>:<AAAA-MM>", "pagamento:<id>", "ajuste:<id>".
    origem: text("origem").notNull(),
    estornoDe: uuid("estorno_de"),
    idempotencyKey: text("idempotency_key").notNull(),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("lancamentos_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("lancamentos_idempotency_key").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("lancamentos_estorno_de_key").on(t.estornoDe),
    index("lancamentos_profissional_competencia_idx").on(t.profissionalId, t.competencia),
    index("lancamentos_origem_idx").on(t.tenantId, t.origem),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.estornoDe], foreignColumns: [t.tenantId, t.id] }),
    check("lancamentos_valor_check", sql`${t.valorCentavos} > 0`),
    check("lancamentos_competencia_check", sql`extract(day from ${t.competencia}) = 1`),
  ],
);

// Fechamento mensal por profissional. Fechado = imutável; a competência fechada não aceita
// novos lançamentos (trigger), que passam para a próxima competência aberta.
export const fechamentos = pgTable(
  "fechamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    competencia: date("competencia", { mode: "string" }).notNull(),
    status: fechamentoStatus("status").notNull().default("aberto"),
    saldoAnteriorCentavos: integer("saldo_anterior_centavos").notNull().default(0),
    totalDebitosCentavos: integer("total_debitos_centavos").notNull().default(0),
    totalCreditosCentavos: integer("total_creditos_centavos").notNull().default(0),
    saldoFinalCentavos: integer("saldo_final_centavos").notNull().default(0),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    fechadoPor: uuid("fechado_por").references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("fechamentos_profissional_competencia_key").on(t.tenantId, t.profissionalId, t.competencia),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    check("fechamentos_competencia_check", sql`extract(day from ${t.competencia}) = 1`),
  ],
);

// ---------------------------------------------------------------------------
// Fase 4: notificações (RLS)
// ---------------------------------------------------------------------------

export const tipoNotificacao = pgEnum("tipo_notificacao", [
  "lembrete_agendamento",
  "lembrete_reserva",
  // Avisos de cancelamento pelo espaço (feriado, sala ou profissional desativado).
  "cancelamento_agendamento",
  "cancelamento_reserva",
]);
export const statusNotificacao = pgEnum("status_notificacao", ["pendente", "enviando", "enviado", "falhou", "cancelado"]);

// Outbox: gravada na mesma transação do fato; o worker envia, com retentativas.
export const notificacoesOutbox = pgTable(
  "notificacoes_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    canal: text("canal").notNull().default("whatsapp"),
    tipo: tipoNotificacao("tipo").notNull(),
    // Telefone em E.164 (+55…).
    destinatario: text("destinatario").notNull(),
    parametros: jsonb("parametros").$type<Record<string, string>>().notNull().default({}),
    agendamentoId: uuid("agendamento_id"),
    reservaId: uuid("reserva_id"),
    status: statusNotificacao("status").notNull().default("pendente"),
    agendarPara: timestamp("agendar_para", { withTimezone: true }).notNull().defaultNow(),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    mensagemProviderId: text("mensagem_provider_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("notificacoes_outbox_idempotency_key").on(t.tenantId, t.idempotencyKey),
    index("notificacoes_outbox_fila_idx").on(t.status, t.agendarPara),
    foreignKey({ columns: [t.tenantId, t.agendamentoId], foreignColumns: [agendamentos.tenantId, agendamentos.id] }),
    foreignKey({ columns: [t.tenantId, t.reservaId], foreignColumns: [reservasSala.tenantId, reservasSala.id] }),
  ],
);

// Baixa manual de pagamento (PIX, dinheiro…). Gera o lançamento correspondente.
export const pagamentos = pgTable(
  "pagamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    direcao: direcaoPagamento("direcao").notNull(),
    forma: formaPagamento("forma").notNull(),
    observacao: text("observacao"),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    index("pagamentos_profissional_idx").on(t.profissionalId, t.data),
    check("pagamentos_valor_check", sql`${t.valorCentavos} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Pós-MVP: NFS-e da locação (RLS)
// ---------------------------------------------------------------------------

export const ambienteFiscal = pgEnum("ambiente_fiscal", ["simulado", "homologacao", "producao"]);
export const statusNotaFiscal = pgEnum("status_nota_fiscal", ["pendente", "processando", "autorizada", "erro", "cancelada"]);

// Dados do espaço como prestador (NFS-e Nacional via Focus NFe). Uma linha por tenant.
export const configuracoesFiscais = pgTable(
  "configuracoes_fiscais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    ativo: boolean("ativo").notNull().default(false),
    ambiente: ambienteFiscal("ambiente").notNull().default("simulado"),
    // Token da Focus NFe cifrado (AES-256-GCM, src/server/cripto.ts). Nunca volta para a tela.
    tokenCifrado: text("token_cifrado"),
    inscricaoMunicipal: text("inscricao_municipal"),
    // Código IBGE do município (7 dígitos).
    codigoMunicipio: text("codigo_municipio"),
    // 1 = não optante, 2 = MEI, 3 = ME/EPP (Simples Nacional).
    opcaoSimplesNacional: smallint("opcao_simples_nacional").notNull().default(3),
    regimeTributarioSimplesNacional: smallint("regime_tributario_simples_nacional"),
    regimeEspecialTributacao: smallint("regime_especial_tributacao").notNull().default(0),
    // Código de tributação nacional do ISSQN (6 dígitos) e NBS (opcional).
    codigoTributacaoNacional: text("codigo_tributacao_nacional"),
    codigoNbs: text("codigo_nbs"),
    // Alíquota do ISS em pontos-base (200 = 2%); opcional para optantes do Simples.
    aliquotaIssBp: integer("aliquota_iss_bp"),
    descricaoServico: text("descricao_servico").notNull().default("Cessão de uso de sala para atendimento"),
    serieDps: integer("serie_dps").notNull().default(1),
    proximoNumeroDps: integer("proximo_numero_dps").notNull().default(1),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("configuracoes_fiscais_tenant_key").on(t.tenantId),
    check("configuracoes_fiscais_simples_check", sql`${t.opcaoSimplesNacional} between 1 and 3`),
    check("configuracoes_fiscais_numero_check", sql`${t.proximoNumeroDps} >= 1`),
  ],
);

// NFS-e de locação: uma por profissional e competência fechada (ativa = não cancelada nem com erro).
export const notasFiscais = pgTable(
  "notas_fiscais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    competencia: date("competencia", { mode: "string" }).notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    descricao: text("descricao").notNull(),
    ambiente: ambienteFiscal("ambiente").notNull(),
    // Referência única na Focus (idempotência do envio).
    referencia: text("referencia").notNull(),
    serieDps: integer("serie_dps").notNull(),
    numeroDps: integer("numero_dps").notNull(),
    status: statusNotaFiscal("status").notNull().default("pendente"),
    // Tomador no momento da emissão (CPF/CNPJ e nome).
    tomador: jsonb("tomador").$type<{ tipoDocumento: "cpf" | "cnpj"; documento: string; nome: string; email: string | null }>().notNull(),
    numero: text("numero"),
    codigoVerificacao: text("codigo_verificacao"),
    url: text("url"),
    urlDanfse: text("url_danfse"),
    caminhoXml: text("caminho_xml"),
    erros: jsonb("erros").$type<{ codigo?: string; mensagem: string; correcao?: string | null }[]>(),
    tentativas: integer("tentativas").notNull().default(0),
    emitidaEm: timestamp("emitida_em", { withTimezone: true }),
    justificativaCancelamento: text("justificativa_cancelamento"),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("notas_fiscais_referencia_key").on(t.tenantId, t.referencia),
    uniqueIndex("notas_fiscais_numero_dps_key").on(t.tenantId, t.ambiente, t.serieDps, t.numeroDps),
    uniqueIndex("notas_fiscais_uma_ativa_key")
      .on(t.tenantId, t.profissionalId, t.competencia)
      .where(sql`${t.status} not in ('erro', 'cancelada')`),
    index("notas_fiscais_status_idx").on(t.status),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    check("notas_fiscais_valor_check", sql`${t.valorCentavos} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Pós-MVP: cobranças via Asaas (RLS)
// ---------------------------------------------------------------------------

export const ambienteAsaas = pgEnum("ambiente_asaas", ["simulado", "sandbox", "producao"]);
export const statusCobranca = pgEnum("status_cobranca", ["pendente", "vencida", "paga", "estornada", "cancelada", "erro"]);
export const formaCobranca = pgEnum("forma_cobranca", ["PIX", "BOLETO", "UNDEFINED"]);

// Fatura mensal do SaaS (Salus → espaço), emitida na conta Asaas da plataforma.
export const faturasSaas = pgTable(
  "faturas_saas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    competencia: date("competencia", { mode: "string" }).notNull(),
    planoId: uuid("plano_id")
      .notNull()
      .references(() => planosSaas.id),
    valorCentavos: integer("valor_centavos").notNull(),
    vencimento: date("vencimento", { mode: "string" }).notNull(),
    ambiente: ambienteAsaas("ambiente").notNull(),
    status: statusCobranca("status").notNull().default("pendente"),
    asaasPaymentId: text("asaas_payment_id"),
    invoiceUrl: text("invoice_url"),
    pagoEm: timestamp("pago_em", { withTimezone: true }),
    ultimoErro: text("ultimo_erro"),
    // E-mails da inadimplência (um de cada por fatura): aviso 5 dias antes e suspensão.
    avisoSuspensaoEm: timestamp("aviso_suspensao_em", { withTimezone: true }),
    suspensaoAvisadaEm: timestamp("suspensao_avisada_em", { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("faturas_saas_competencia_key").on(t.tenantId, t.competencia),
    uniqueIndex("faturas_saas_asaas_key").on(t.asaasPaymentId),
    check("faturas_saas_valor_check", sql`${t.valorCentavos} > 0`),
  ],
);

export const statusConexaoWhatsapp = pgEnum("status_conexao_whatsapp", ["desconectado", "conectando", "conectado"]);

// Número de WhatsApp do espaço conectado por QR Code (Evolution API). Uma linha por tenant.
// A instância na Evolution se chama salus-<tenant_id>; o risco de bloqueio é aceito pelo admin.
export const whatsappConexoes = pgTable(
  "whatsapp_conexoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    instancia: text("instancia").notNull(),
    status: statusConexaoWhatsapp("status").notNull().default("desconectado"),
    // Número conectado (só dígitos, com DDI), quando a Evolution informa.
    numero: text("numero"),
    conectadoEm: timestamp("conectado_em", { withTimezone: true }),
    riscoAceitoEm: timestamp("risco_aceito_em", { withTimezone: true }).notNull(),
    riscoAceitoPor: uuid("risco_aceito_por").references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex("whatsapp_conexoes_tenant_key").on(t.tenantId)],
);

// Conta Asaas do próprio espaço para cobrar os profissionais. Uma linha por tenant.
export const configuracoesCobranca = pgTable(
  "configuracoes_cobranca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    ativo: boolean("ativo").notNull().default(false),
    ambiente: ambienteAsaas("ambiente").notNull().default("simulado"),
    // Chave de API do Asaas cifrada (src/server/cripto.ts). Nunca volta para a tela.
    apiKeyCifrada: text("api_key_cifrada"),
    // SHA-256 do token que o Asaas envia no header asaas-access-token do webhook.
    webhookTokenHash: text("webhook_token_hash"),
    diasVencimento: integer("dias_vencimento").notNull().default(5),
    // Multa (percentual) e juros ao mês (percentual), em pontos-base; nulos = padrão da conta Asaas.
    multaBp: integer("multa_bp"),
    jurosMesBp: integer("juros_mes_bp"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("configuracoes_cobranca_tenant_key").on(t.tenantId),
    check("configuracoes_cobranca_dias_check", sql`${t.diasVencimento} between 1 and 60`),
  ],
);

// Cobrança PIX/boleto do espaço ao profissional. Paga = baixa automática no ledger.
export const cobrancasProfissional = pgTable(
  "cobrancas_profissional",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
    competencia: date("competencia", { mode: "string" }),
    descricao: text("descricao").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    vencimento: date("vencimento", { mode: "string" }).notNull(),
    forma: formaCobranca("forma").notNull().default("UNDEFINED"),
    ambiente: ambienteAsaas("ambiente").notNull(),
    status: statusCobranca("status").notNull().default("pendente"),
    asaasPaymentId: text("asaas_payment_id"),
    invoiceUrl: text("invoice_url"),
    bankSlipUrl: text("bank_slip_url"),
    // PIX "copia e cola" (o QR Code é gerado a partir dele na tela).
    pixCopiaECola: text("pix_copia_e_cola"),
    pagoEm: timestamp("pago_em", { withTimezone: true }),
    // Pagamento (baixa) gerado quando o Asaas confirmou o recebimento.
    pagamentoId: uuid("pagamento_id"),
    ultimoErro: text("ultimo_erro"),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("cobrancas_profissional_asaas_key").on(t.asaasPaymentId),
    index("cobrancas_profissional_profissional_idx").on(t.profissionalId, t.criadoEm),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    check("cobrancas_profissional_valor_check", sql`${t.valorCentavos} > 0`),
  ],
);

// Eventos de webhook já processados (o Asaas entrega "ao menos uma vez").
export const eventosWebhook = pgTable(
  "eventos_webhook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    origem: text("origem").notNull(),
    eventoId: text("evento_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("eventos_webhook_evento_key").on(t.tenantId, t.origem, t.eventoId)],
);

// ---------------------------------------------------------------------------
// Pós-MVP: prontuário eletrônico (RLS por profissional, conteúdo cifrado)
// ---------------------------------------------------------------------------

// Chave de dados do tenant (AES-256), guardada cifrada pela SECRETS_KEY (envelope).
export const chavesTenant = pgTable(
  "chaves_tenant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    chaveCifrada: text("chave_cifrada").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("chaves_tenant_tenant_key").on(t.tenantId)],
);

export const tipoRegistroClinico = pgEnum("tipo_registro_clinico", ["evolucao", "adendo"]);
export const statusRegistroClinico = pgEnum("status_registro_clinico", ["rascunho", "finalizado"]);

// Evolução clínica (ou adendo). Rascunho é editável; finalizado é imutável (trigger) e
// tem hash de integridade. Correção = adendo apontando para o original.
export const registrosClinicos = pgTable(
  "registros_clinicos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    pacienteId: uuid("paciente_id").notNull(),
    // Autor. A RLS só deixa o próprio autor (ou quem recebeu compartilhamento) ler.
    profissionalId: uuid("profissional_id").notNull(),
    agendamentoId: uuid("agendamento_id"),
    tipo: tipoRegistroClinico("tipo").notNull().default("evolucao"),
    adendoDe: uuid("adendo_de"),
    status: statusRegistroClinico("status").notNull().default("rascunho"),
    // JSON { anotacoes, prescricao } cifrado com a chave do tenant.
    conteudoCifrado: text("conteudo_cifrado").notNull(),
    hashIntegridade: text("hash_integridade"),
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("registros_clinicos_tenant_id_id_key").on(t.tenantId, t.id),
    index("registros_clinicos_paciente_idx").on(t.tenantId, t.pacienteId, t.criadoEm),
    foreignKey({ columns: [t.tenantId, t.pacienteId], foreignColumns: [pacientes.tenantId, pacientes.id] }),
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.agendamentoId], foreignColumns: [agendamentos.tenantId, agendamentos.id] }),
    foreignKey({ columns: [t.tenantId, t.adendoDe], foreignColumns: [t.tenantId, t.id] }),
    check("registros_clinicos_adendo_check", sql`(${t.tipo} = 'adendo') = (${t.adendoDe} is not null)`),
    check(
      "registros_clinicos_finalizado_check",
      sql`(${t.status} = 'finalizado') = (${t.finalizadoEm} is not null and ${t.hashIntegridade} is not null)`,
    ),
  ],
);

// Anexo (exame, imagem, laudo): arquivo cifrado no armazenamento S3; aqui só metadados.
export const anexosClinicos = pgTable(
  "anexos_clinicos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    registroId: uuid("registro_id").notNull(),
    pacienteId: uuid("paciente_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    tipoMime: text("tipo_mime").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    // SHA-256 do arquivo original (entra no hash do registro ao finalizar).
    hashArquivo: text("hash_arquivo").notNull(),
    chaveObjeto: text("chave_objeto").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("anexos_clinicos_registro_idx").on(t.registroId),
    foreignKey({ columns: [t.tenantId, t.registroId], foreignColumns: [registrosClinicos.tenantId, registrosClinicos.id] }),
    check("anexos_clinicos_tamanho_check", sql`${t.tamanhoBytes} > 0`),
  ],
);

// Compartilhamento: o autor libera os seus registros de um paciente para outro profissional,
// com o consentimento do paciente registrado. Revogável.
export const compartilhamentosClinicos = pgTable(
  "compartilhamentos_clinicos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    pacienteId: uuid("paciente_id").notNull(),
    deProfissionalId: uuid("de_profissional_id").notNull(),
    paraProfissionalId: uuid("para_profissional_id").notNull(),
    // Como o consentimento foi obtido (ex.: "termo assinado em 16/10/2026").
    consentimento: text("consentimento").notNull(),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("compartilhamentos_clinicos_ativo_key")
      .on(t.tenantId, t.pacienteId, t.deProfissionalId, t.paraProfissionalId)
      .where(sql`${t.revogadoEm} is null`),
    foreignKey({ columns: [t.tenantId, t.pacienteId], foreignColumns: [pacientes.tenantId, pacientes.id] }),
    foreignKey({ columns: [t.tenantId, t.deProfissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    foreignKey({ columns: [t.tenantId, t.paraProfissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    check("compartilhamentos_clinicos_distintos_check", sql`${t.deProfissionalId} <> ${t.paraProfissionalId}`),
  ],
);

