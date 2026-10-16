CREATE TYPE "public"."agendamento_status" AS ENUM('agendado', 'confirmado', 'presente', 'realizado', 'falta', 'cancelado');--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"periodo" "tstzrange" NOT NULL,
	"status" "agendamento_status" DEFAULT 'agendado' NOT NULL,
	"observacao" text,
	"status_atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelado_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"cancelamento_tardio" boolean DEFAULT false NOT NULL,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agendamentos_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "agendamentos_periodo_check" CHECK (not isempty("agendamentos"."periodo") and lower_inc("agendamentos"."periodo") and not upper_inc("agendamentos"."periodo"))
);
--> statement-breakpoint
CREATE TABLE "pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"data_nascimento" date,
	"telefone" text,
	"email" text,
	"consentimento_lembretes" boolean DEFAULT false NOT NULL,
	"consentimento_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacientes_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "pacientes_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "antecedencia_cancelamento_horas" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_reserva_id_reservas_sala_tenant_id_id_fk" FOREIGN KEY ("tenant_id","reserva_id") REFERENCES "public"."reservas_sala"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_paciente_id_pacientes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","paciente_id") REFERENCES "public"."pacientes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes_profissionais" ADD CONSTRAINT "pacientes_profissionais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes_profissionais" ADD CONSTRAINT "pacientes_profissionais_tenant_id_paciente_id_pacientes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","paciente_id") REFERENCES "public"."pacientes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacientes_profissionais" ADD CONSTRAINT "pacientes_profissionais_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agendamentos_reserva_idx" ON "agendamentos" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "agendamentos_paciente_idx" ON "agendamentos" USING btree ("paciente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pacientes_tenant_cpf_key" ON "pacientes" USING btree ("tenant_id","cpf");--> statement-breakpoint
CREATE INDEX "pacientes_tenant_nome_idx" ON "pacientes" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "pacientes_profissionais_key" ON "pacientes_profissionais" USING btree ("paciente_id","profissional_id");--> statement-breakpoint
CREATE INDEX "pacientes_profissionais_profissional_idx" ON "pacientes_profissionais" USING btree ("profissional_id");