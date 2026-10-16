CREATE TYPE "public"."ambiente_asaas" AS ENUM('simulado', 'sandbox', 'producao');--> statement-breakpoint
CREATE TYPE "public"."forma_cobranca" AS ENUM('PIX', 'BOLETO', 'UNDEFINED');--> statement-breakpoint
CREATE TYPE "public"."status_cobranca" AS ENUM('pendente', 'vencida', 'paga', 'estornada', 'cancelada', 'erro');--> statement-breakpoint
CREATE TABLE "cobrancas_profissional" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"competencia" date,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"vencimento" date NOT NULL,
	"forma" "forma_cobranca" DEFAULT 'UNDEFINED' NOT NULL,
	"ambiente" "ambiente_asaas" NOT NULL,
	"status" "status_cobranca" DEFAULT 'pendente' NOT NULL,
	"asaas_payment_id" text,
	"invoice_url" text,
	"bank_slip_url" text,
	"pago_em" timestamp with time zone,
	"pagamento_id" uuid,
	"ultimo_erro" text,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobrancas_profissional_valor_check" CHECK ("cobrancas_profissional"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "configuracoes_cobranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"ambiente" "ambiente_asaas" DEFAULT 'simulado' NOT NULL,
	"api_key_cifrada" text,
	"webhook_token_hash" text,
	"dias_vencimento" integer DEFAULT 5 NOT NULL,
	"multa_bp" integer,
	"juros_mes_bp" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_cobranca_dias_check" CHECK ("configuracoes_cobranca"."dias_vencimento" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "eventos_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"origem" text NOT NULL,
	"evento_id" text NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faturas_saas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"competencia" date NOT NULL,
	"plano_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"vencimento" date NOT NULL,
	"ambiente" "ambiente_asaas" NOT NULL,
	"status" "status_cobranca" DEFAULT 'pendente' NOT NULL,
	"asaas_payment_id" text,
	"invoice_url" text,
	"pago_em" timestamp with time zone,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faturas_saas_valor_check" CHECK ("faturas_saas"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "cobrancas_profissional" ADD CONSTRAINT "cobrancas_profissional_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas_profissional" ADD CONSTRAINT "cobrancas_profissional_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas_profissional" ADD CONSTRAINT "cobrancas_profissional_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_cobranca" ADD CONSTRAINT "configuracoes_cobranca_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_webhook" ADD CONSTRAINT "eventos_webhook_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_plano_id_planos_saas_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos_saas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_profissional_asaas_key" ON "cobrancas_profissional" USING btree ("asaas_payment_id");--> statement-breakpoint
CREATE INDEX "cobrancas_profissional_profissional_idx" ON "cobrancas_profissional" USING btree ("profissional_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "configuracoes_cobranca_tenant_key" ON "configuracoes_cobranca" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_webhook_evento_key" ON "eventos_webhook" USING btree ("tenant_id","origem","evento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_saas_competencia_key" ON "faturas_saas" USING btree ("tenant_id","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_saas_asaas_key" ON "faturas_saas" USING btree ("asaas_payment_id");