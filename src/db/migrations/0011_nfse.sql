CREATE TYPE "public"."ambiente_fiscal" AS ENUM('simulado', 'homologacao', 'producao');--> statement-breakpoint
CREATE TYPE "public"."status_nota_fiscal" AS ENUM('pendente', 'processando', 'autorizada', 'erro', 'cancelada');--> statement-breakpoint
CREATE TABLE "configuracoes_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"ambiente" "ambiente_fiscal" DEFAULT 'simulado' NOT NULL,
	"token_cifrado" text,
	"inscricao_municipal" text,
	"codigo_municipio" text,
	"opcao_simples_nacional" smallint DEFAULT 3 NOT NULL,
	"regime_tributario_simples_nacional" smallint,
	"regime_especial_tributacao" smallint DEFAULT 0 NOT NULL,
	"codigo_tributacao_nacional" text,
	"codigo_nbs" text,
	"aliquota_iss_bp" integer,
	"descricao_servico" text DEFAULT 'Cessão de uso de sala para atendimento' NOT NULL,
	"serie_dps" integer DEFAULT 1 NOT NULL,
	"proximo_numero_dps" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_fiscais_simples_check" CHECK ("configuracoes_fiscais"."opcao_simples_nacional" between 1 and 3),
	CONSTRAINT "configuracoes_fiscais_numero_check" CHECK ("configuracoes_fiscais"."proximo_numero_dps" >= 1)
);
--> statement-breakpoint
CREATE TABLE "notas_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"descricao" text NOT NULL,
	"ambiente" "ambiente_fiscal" NOT NULL,
	"referencia" text NOT NULL,
	"serie_dps" integer NOT NULL,
	"numero_dps" integer NOT NULL,
	"status" "status_nota_fiscal" DEFAULT 'pendente' NOT NULL,
	"tomador" jsonb NOT NULL,
	"numero" text,
	"codigo_verificacao" text,
	"url" text,
	"url_danfse" text,
	"caminho_xml" text,
	"erros" jsonb,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"emitida_em" timestamp with time zone,
	"justificativa_cancelamento" text,
	"cancelada_em" timestamp with time zone,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notas_fiscais_valor_check" CHECK ("notas_fiscais"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "tipo_documento" "tipo_documento";--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "configuracoes_fiscais" ADD CONSTRAINT "configuracoes_fiscais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuracoes_fiscais_tenant_key" ON "configuracoes_fiscais" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_referencia_key" ON "notas_fiscais" USING btree ("tenant_id","referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_numero_dps_key" ON "notas_fiscais" USING btree ("tenant_id","ambiente","serie_dps","numero_dps");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_uma_ativa_key" ON "notas_fiscais" USING btree ("tenant_id","profissional_id","competencia") WHERE "notas_fiscais"."status" not in ('erro', 'cancelada');--> statement-breakpoint
CREATE INDEX "notas_fiscais_status_idx" ON "notas_fiscais" USING btree ("status");