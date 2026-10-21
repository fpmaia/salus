CREATE TABLE "datas_nao_reservadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"regra_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"sala_id" uuid NOT NULL,
	"data" date NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"avisado_em" timestamp with time zone,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" ADD CONSTRAINT "datas_nao_reservadas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" ADD CONSTRAINT "datas_nao_reservadas_tenant_id_regra_id_regras_recorrencia_tenant_id_id_fk" FOREIGN KEY ("tenant_id","regra_id") REFERENCES "public"."regras_recorrencia"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" ADD CONSTRAINT "datas_nao_reservadas_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" ADD CONSTRAINT "datas_nao_reservadas_tenant_id_sala_id_salas_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "public"."salas"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "datas_nao_reservadas_regra_data_key" ON "datas_nao_reservadas" USING btree ("regra_id","data");--> statement-breakpoint
CREATE INDEX "datas_nao_reservadas_pendentes_idx" ON "datas_nao_reservadas" USING btree ("tenant_id","resolvida_em","data");--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "datas_nao_reservadas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "datas_nao_reservadas" USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "datas_nao_reservadas" TO salus_app;
