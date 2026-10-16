CREATE TYPE "public"."direcao_pagamento" AS ENUM('profissional_para_espaco', 'espaco_para_profissional');--> statement-breakpoint
CREATE TYPE "public"."fechamento_status" AS ENUM('aberto', 'fechado');--> statement-breakpoint
CREATE TYPE "public"."fluxo_recebimento" AS ENUM('centralizado', 'direto');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento" AS ENUM('pix', 'dinheiro', 'cartao', 'transferencia', 'boleto', 'outro');--> statement-breakpoint
CREATE TYPE "public"."modelo_cobranca" AS ENUM('hora', 'consulta', 'percentual', 'mensalidade');--> statement-breakpoint
CREATE TYPE "public"."natureza_lancamento" AS ENUM('debito', 'credito');--> statement-breakpoint
CREATE TYPE "public"."regra_falta" AS ENUM('isenta', 'integral', 'percentual');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('locacao_hora', 'locacao_consulta', 'locacao_percentual', 'falta', 'mensalidade', 'excedente_horas', 'recebimento_paciente', 'pagamento_profissional', 'repasse_profissional', 'ajuste');--> statement-breakpoint
CREATE TABLE "acordos_financeiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"modelo" "modelo_cobranca" NOT NULL,
	"fluxo_recebimento" "fluxo_recebimento" DEFAULT 'direto' NOT NULL,
	"valor_hora_centavos" integer,
	"valor_consulta_centavos" integer,
	"percentual_bp" integer,
	"mensalidade_centavos" integer,
	"horas_incluidas" integer,
	"regra_falta" "regra_falta" DEFAULT 'isenta' NOT NULL,
	"falta_percentual_bp" integer,
	"vigente_de" date NOT NULL,
	"vigente_ate" date,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acordos_vigencia_check" CHECK ("acordos_financeiros"."vigente_ate" is null or "acordos_financeiros"."vigente_ate" >= "acordos_financeiros"."vigente_de"),
	CONSTRAINT "acordos_modelo_check" CHECK (coalesce(case "acordos_financeiros"."modelo"
        when 'hora' then "acordos_financeiros"."valor_hora_centavos" > 0
        when 'consulta' then "acordos_financeiros"."valor_consulta_centavos" > 0
        when 'percentual' then "acordos_financeiros"."percentual_bp" between 1 and 10000
        when 'mensalidade' then "acordos_financeiros"."mensalidade_centavos" > 0 and "acordos_financeiros"."horas_incluidas" >= 0 and "acordos_financeiros"."valor_hora_centavos" >= 0
      end, false)),
	CONSTRAINT "acordos_falta_check" CHECK ("acordos_financeiros"."regra_falta" <> 'percentual' or coalesce("acordos_financeiros"."falta_percentual_bp" between 1 and 10000, false))
);
--> statement-breakpoint
CREATE TABLE "fechamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"status" "fechamento_status" DEFAULT 'aberto' NOT NULL,
	"saldo_anterior_centavos" integer DEFAULT 0 NOT NULL,
	"total_debitos_centavos" integer DEFAULT 0 NOT NULL,
	"total_creditos_centavos" integer DEFAULT 0 NOT NULL,
	"saldo_final_centavos" integer DEFAULT 0 NOT NULL,
	"fechado_em" timestamp with time zone,
	"fechado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_competencia_check" CHECK (extract(day from "fechamentos"."competencia") = 1)
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"data_referencia" date NOT NULL,
	"natureza" "natureza_lancamento" NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"descricao" text NOT NULL,
	"origem" text NOT NULL,
	"estorno_de" uuid,
	"idempotency_key" text NOT NULL,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "lancamentos_valor_check" CHECK ("lancamentos"."valor_centavos" > 0),
	CONSTRAINT "lancamentos_competencia_check" CHECK (extract(day from "lancamentos"."competencia") = 1)
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"direcao" "direcao_pagamento" NOT NULL,
	"forma" "forma_pagamento" NOT NULL,
	"observacao" text,
	"criado_por" uuid DEFAULT app_current_user_id(),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagamentos_valor_check" CHECK ("pagamentos"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "valor_centavos" integer;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "valor_informado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos" ADD CONSTRAINT "fechamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos" ADD CONSTRAINT "fechamentos_fechado_por_users_id_fk" FOREIGN KEY ("fechado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos" ADD CONSTRAINT "fechamentos_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_estorno_de_lancamentos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","estorno_de") REFERENCES "public"."lancamentos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acordos_financeiros_profissional_idx" ON "acordos_financeiros" USING btree ("profissional_id","vigente_de");--> statement-breakpoint
CREATE UNIQUE INDEX "fechamentos_profissional_competencia_key" ON "fechamentos" USING btree ("tenant_id","profissional_id","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_idempotency_key" ON "lancamentos" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_estorno_de_key" ON "lancamentos" USING btree ("estorno_de");--> statement-breakpoint
CREATE INDEX "lancamentos_profissional_competencia_idx" ON "lancamentos" USING btree ("profissional_id","competencia");--> statement-breakpoint
CREATE INDEX "lancamentos_origem_idx" ON "lancamentos" USING btree ("tenant_id","origem");--> statement-breakpoint
CREATE INDEX "pagamentos_profissional_idx" ON "pagamentos" USING btree ("profissional_id","data");--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_valor_check" CHECK ("agendamentos"."valor_centavos" is null or "agendamentos"."valor_centavos" >= 0);