CREATE TYPE "public"."tipo_item_fatura_saas" AS ENUM('base', 'sala_extra', 'profissional_extra', 'unidade_extra', 'prontuario_licenca');--> statement-breakpoint
CREATE TABLE "faturas_saas_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"tipo" "tipo_item_fatura_saas" NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor_unitario_centavos" integer NOT NULL,
	"valor_total_centavos" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faturas_saas_itens_qtd_check" CHECK ("faturas_saas_itens"."quantidade" > 0),
	CONSTRAINT "faturas_saas_itens_valor_check" CHECK ("faturas_saas_itens"."valor_total_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "licencas_prontuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"trial_inicio_em" timestamp with time zone,
	"trial_fim_em" timestamp with time zone,
	"ativado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planos_saas" ADD COLUMN "preco_sala_extra_centavos" integer DEFAULT 3990 NOT NULL;--> statement-breakpoint
ALTER TABLE "planos_saas" ADD COLUMN "preco_profissional_extra_centavos" integer DEFAULT 1990 NOT NULL;--> statement-breakpoint
ALTER TABLE "planos_saas" ADD COLUMN "preco_unidade_extra_centavos" integer DEFAULT 14900 NOT NULL;--> statement-breakpoint
ALTER TABLE "planos_saas" ADD COLUMN "preco_prontuario_centavos" integer DEFAULT 4990 NOT NULL;--> statement-breakpoint
ALTER TABLE "planos_saas" ADD COLUMN "permite_unidade_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" ADD CONSTRAINT "faturas_saas_itens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" ADD CONSTRAINT "faturas_saas_itens_fatura_id_faturas_saas_id_fk" FOREIGN KEY ("fatura_id") REFERENCES "public"."faturas_saas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD CONSTRAINT "licencas_prontuario_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD CONSTRAINT "licencas_prontuario_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faturas_saas_itens_fatura_idx" ON "faturas_saas_itens" USING btree ("fatura_id");--> statement-breakpoint
CREATE UNIQUE INDEX "licencas_prontuario_profissional_key" ON "licencas_prontuario" USING btree ("tenant_id","profissional_id");--> statement-breakpoint

-- Isolamento multi-tenant (RLS) e permissões para salus_app
ALTER TABLE "faturas_saas_itens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "faturas_saas_itens"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "faturas_saas_itens" TO salus_app;--> statement-breakpoint

ALTER TABLE "licencas_prontuario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "licencas_prontuario"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "licencas_prontuario" TO salus_app;--> statement-breakpoint

-- Atualização dos valores específicos por plano
UPDATE "planos_saas"
  SET "preco_sala_extra_centavos" = 3990,
      "preco_profissional_extra_centavos" = 1990,
      "preco_unidade_extra_centavos" = 14900,
      "preco_prontuario_centavos" = 4990,
      "permite_unidade_extra" = false
  WHERE "codigo" = 'basico';--> statement-breakpoint

UPDATE "planos_saas"
  SET "preco_sala_extra_centavos" = 3990,
      "preco_profissional_extra_centavos" = 1990,
      "preco_unidade_extra_centavos" = 14900,
      "preco_prontuario_centavos" = 4990,
      "permite_unidade_extra" = true
  WHERE "codigo" = 'pro';--> statement-breakpoint

UPDATE "planos_saas"
  SET "preco_sala_extra_centavos" = 3990,
      "preco_profissional_extra_centavos" = 1990,
      "preco_unidade_extra_centavos" = 14900,
      "preco_prontuario_centavos" = 3990,
      "permite_unidade_extra" = true
  WHERE "codigo" = 'enterprise';