CREATE TYPE "public"."status_espera" AS ENUM('aguardando', 'agendado', 'removido');--> statement-breakpoint
CREATE TABLE "lista_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"profissional_id" uuid,
	"preferencia" text,
	"status" "status_espera" DEFAULT 'aguardando' NOT NULL,
	"agendamento_id" uuid,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "status_anterior" "agendamento_status";--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "remarcado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD COLUMN "criada_pelo_agendamento" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_tenant_id_paciente_id_pacientes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","paciente_id") REFERENCES "public"."pacientes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_tenant_id_agendamento_id_agendamentos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agendamento_id") REFERENCES "public"."agendamentos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lista_espera_aguardando_idx" ON "lista_espera" USING btree ("tenant_id","status","criado_em");--> statement-breakpoint
ALTER TABLE "lista_espera" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lista_espera" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "lista_espera" USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "lista_espera" TO salus_app;
