CREATE TYPE "public"."reserva_status" AS ENUM('ativa', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TABLE "convites_profissional" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" uuid,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_profissional_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"unidade_id" uuid,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_funcionamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"abre" time NOT NULL,
	"fecha" time NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "horarios_funcionamento_dia_check" CHECK ("horarios_funcionamento"."dia_semana" between 0 and 6),
	CONSTRAINT "horarios_funcionamento_intervalo_check" CHECK ("horarios_funcionamento"."fecha" > "horarios_funcionamento"."abre")
);
--> statement-breakpoint
CREATE TABLE "profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"membership_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text,
	"conselho" text,
	"registro" text,
	"especialidade" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profissionais_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "recursos_sala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"sala_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_recorrencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"sala_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"materializada_ate" date,
	"encerrada_em" timestamp with time zone,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_recorrencia_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "regras_recorrencia_dia_check" CHECK ("regras_recorrencia"."dia_semana" between 0 and 6),
	CONSTRAINT "regras_recorrencia_intervalo_check" CHECK ("regras_recorrencia"."hora_fim" > "regras_recorrencia"."hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "reservas_sala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"sala_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"periodo" "tstzrange" NOT NULL,
	"status" "reserva_status" DEFAULT 'ativa' NOT NULL,
	"recorrencia_id" uuid,
	"data_ocorrencia" date,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_sala_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "reservas_sala_periodo_check" CHECK (not isempty("reservas_sala"."periodo") and lower_inc("reservas_sala"."periodo") and not upper_inc("reservas_sala"."periodo"))
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salas_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"nome" text NOT NULL,
	"endereco" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"slot_minutos" integer DEFAULT 30 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unidades_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "unidades_slot_minutos_check" CHECK ("unidades"."slot_minutos" in (15, 30, 60))
);
--> statement-breakpoint
ALTER TABLE "convites_profissional" ADD CONSTRAINT "convites_profissional_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_profissional" ADD CONSTRAINT "convites_profissional_aceito_por_users_id_fk" FOREIGN KEY ("aceito_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_profissional" ADD CONSTRAINT "convites_profissional_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_tenant_id_unidade_id_unidades_tenant_id_id_fk" FOREIGN KEY ("tenant_id","unidade_id") REFERENCES "public"."unidades"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_tenant_id_unidade_id_unidades_tenant_id_id_fk" FOREIGN KEY ("tenant_id","unidade_id") REFERENCES "public"."unidades"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos_sala" ADD CONSTRAINT "recursos_sala_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos_sala" ADD CONSTRAINT "recursos_sala_tenant_id_sala_id_salas_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "public"."salas"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_tenant_id_sala_id_salas_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "public"."salas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD CONSTRAINT "reservas_sala_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD CONSTRAINT "reservas_sala_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD CONSTRAINT "reservas_sala_tenant_id_sala_id_salas_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "public"."salas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD CONSTRAINT "reservas_sala_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD CONSTRAINT "reservas_sala_tenant_id_recorrencia_id_regras_recorrencia_tenant_id_id_fk" FOREIGN KEY ("tenant_id","recorrencia_id") REFERENCES "public"."regras_recorrencia"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_tenant_id_unidade_id_unidades_tenant_id_id_fk" FOREIGN KEY ("tenant_id","unidade_id") REFERENCES "public"."unidades"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feriados_tenant_data_idx" ON "feriados" USING btree ("tenant_id","data");--> statement-breakpoint
CREATE INDEX "horarios_funcionamento_unidade_idx" ON "horarios_funcionamento" USING btree ("unidade_id","dia_semana");--> statement-breakpoint
CREATE UNIQUE INDEX "profissionais_tenant_email_key" ON "profissionais" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "profissionais_membership_key" ON "profissionais" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recursos_sala_sala_nome_key" ON "recursos_sala" USING btree ("sala_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_sala_recorrencia_data_key" ON "reservas_sala" USING btree ("recorrencia_id","data_ocorrencia");--> statement-breakpoint
CREATE INDEX "reservas_sala_profissional_idx" ON "reservas_sala" USING btree ("profissional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salas_unidade_nome_key" ON "salas" USING btree ("unidade_id","nome");