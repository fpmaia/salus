CREATE TABLE "modelos_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid,
	"nome" text NOT NULL,
	"descricao" text,
	"titulo" text DEFAULT '' NOT NULL,
	"anotacoes" text DEFAULT '' NOT NULL,
	"prescricao" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papeis_timbrados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid,
	"cabecalho" text NOT NULL,
	"rodape" text NOT NULL,
	"alinhamento" text DEFAULT 'centro' NOT NULL,
	"mostrar_logo" boolean DEFAULT false NOT NULL,
	"logo" "bytea",
	"logo_tipo" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papeis_timbrados_tenant_profissional_key" UNIQUE NULLS NOT DISTINCT("tenant_id","profissional_id"),
	CONSTRAINT "papeis_timbrados_alinhamento_check" CHECK ("papeis_timbrados"."alinhamento" in ('centro', 'esquerda')),
	CONSTRAINT "papeis_timbrados_logo_check" CHECK ("papeis_timbrados"."logo" is null or octet_length("papeis_timbrados"."logo") <= 512000)
);
--> statement-breakpoint
ALTER TABLE "modelos_documento" ADD CONSTRAINT "modelos_documento_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos_documento" ADD CONSTRAINT "modelos_documento_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos_documento" ADD CONSTRAINT "modelos_documento_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papeis_timbrados" ADD CONSTRAINT "papeis_timbrados_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papeis_timbrados" ADD CONSTRAINT "papeis_timbrados_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modelos_documento_tenant_idx" ON "modelos_documento" USING btree ("tenant_id","profissional_id");--> statement-breakpoint
ALTER TABLE "modelos_documento" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "modelos_documento" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "modelos_documento" USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
-- Excluir um modelo é desativá-lo (ativo = false): sem DELETE.
GRANT SELECT, INSERT, UPDATE ON "modelos_documento" TO salus_app;
--> statement-breakpoint
ALTER TABLE "papeis_timbrados" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "papeis_timbrados" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "papeis_timbrados" USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
-- "Restaurar o padrão" apaga o personalizado.
GRANT SELECT, INSERT, UPDATE, DELETE ON "papeis_timbrados" TO salus_app;
