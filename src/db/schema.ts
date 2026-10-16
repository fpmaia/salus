import { sql } from "drizzle-orm";
import {
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
    // Política de cancelamento: abaixo desta antecedência o cancelamento é "tardio".
    antecedenciaCancelamentoHoras: integer("antecedencia_cancelamento_horas").notNull().default(24),
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
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("profissionais_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("profissionais_tenant_email_key").on(t.tenantId, t.email),
    uniqueIndex("profissionais_membership_key").on(t.membershipId),
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

// Recorrência semanal; o worker materializa as reservas numa janela à frente.
export const regrasRecorrencia = pgTable(
  "regras_recorrencia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    salaId: uuid("sala_id").notNull(),
    profissionalId: uuid("profissional_id").notNull(),
    diaSemana: smallint("dia_semana").notNull(),
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
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
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
    email: text("email"),
    // Consentimento para lembretes (WhatsApp na Fase 4).
    consentimentoLembretes: boolean("consentimento_lembretes").notNull().default(false),
    consentimentoEm: timestamp("consentimento_em", { withTimezone: true }),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("pacientes_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("pacientes_tenant_cpf_key").on(t.tenantId, t.cpf),
    index("pacientes_tenant_nome_idx").on(t.tenantId, t.nome),
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
    observacao: text("observacao"),
    statusAtualizadoEm: timestamp("status_atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    motivoCancelamento: text("motivo_cancelamento"),
    // Cancelado com menos antecedência que a política do tenant (base para cobrança na Fase 3).
    cancelamentoTardio: boolean("cancelamento_tardio").notNull().default(false),
    // Valor cobrado do paciente (base do modelo percentual e do repasse no caixa centralizado).
    // No pagamento direto é declarado pelo profissional/recepção; fica no audit_log.
    valorCentavos: integer("valor_centavos"),
    valorInformadoEm: timestamp("valor_informado_em", { withTimezone: true }),
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

// ---------------------------------------------------------------------------
// Fase 3: financeiro (RLS)
// ---------------------------------------------------------------------------

export const modeloCobranca = pgEnum("modelo_cobranca", ["hora", "consulta", "percentual", "mensalidade"]);
export const fluxoRecebimento = pgEnum("fluxo_recebimento", ["centralizado", "direto"]);
export const regraFalta = pgEnum("regra_falta", ["isenta", "integral", "percentual"]);
export const naturezaLancamento = pgEnum("natureza_lancamento", ["debito", "credito"]);
export const tipoLancamento = pgEnum("tipo_lancamento", [
  "locacao_hora",
  "locacao_consulta",
  "locacao_percentual",
  "falta",
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
export const acordosFinanceiros = pgTable(
  "acordos_financeiros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdDoContexto(),
    profissionalId: uuid("profissional_id").notNull(),
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
    vigenteDe: date("vigente_de", { mode: "string" }).notNull(),
    vigenteAte: date("vigente_ate", { mode: "string" }),
    criadoPor: uuid("criado_por").default(sql`app_current_user_id()`).references(() => users.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.profissionalId], foreignColumns: [profissionais.tenantId, profissionais.id] }),
    index("acordos_financeiros_profissional_idx").on(t.profissionalId, t.vigenteDe),
    check("acordos_vigencia_check", sql`${t.vigenteAte} is null or ${t.vigenteAte} >= ${t.vigenteDe}`),
    check(
      "acordos_modelo_check",
      // coalesce: num CHECK, NULL passaria como verdadeiro.
      sql`coalesce(case ${t.modelo}
        when 'hora' then ${t.valorHoraCentavos} > 0
        when 'consulta' then ${t.valorConsultaCentavos} > 0
        when 'percentual' then ${t.percentualBp} between 1 and 10000
        when 'mensalidade' then ${t.mensalidadeCentavos} > 0 and ${t.horasIncluidas} >= 0 and ${t.valorHoraCentavos} >= 0
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

export const tipoNotificacao = pgEnum("tipo_notificacao", ["lembrete_agendamento", "lembrete_reserva"]);
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
