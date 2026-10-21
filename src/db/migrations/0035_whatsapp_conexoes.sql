CREATE TYPE "public"."status_conexao_whatsapp" AS ENUM('desconectado', 'conectando', 'conectado');--> statement-breakpoint
CREATE TABLE "whatsapp_conexoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"instancia" text NOT NULL,
	"status" "status_conexao_whatsapp" DEFAULT 'desconectado' NOT NULL,
	"numero" text,
	"conectado_em" timestamp with time zone,
	"risco_aceito_em" timestamp with time zone NOT NULL,
	"risco_aceito_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" ADD CONSTRAINT "whatsapp_conexoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" ADD CONSTRAINT "whatsapp_conexoes_risco_aceito_por_users_id_fk" FOREIGN KEY ("risco_aceito_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conexoes_tenant_key" ON "whatsapp_conexoes" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "whatsapp_conexoes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whatsapp_conexoes" USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "whatsapp_conexoes" TO salus_app;
