CREATE TYPE "public"."status_registro_clinico" AS ENUM('rascunho', 'finalizado');--> statement-breakpoint
CREATE TYPE "public"."tipo_registro_clinico" AS ENUM('evolucao', 'adendo');--> statement-breakpoint
CREATE TABLE "anexos_clinicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"registro_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"hash_arquivo" text NOT NULL,
	"chave_objeto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anexos_clinicos_tamanho_check" CHECK ("anexos_clinicos"."tamanho_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "chaves_tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"chave_cifrada" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compartilhamentos_clinicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"de_profissional_id" uuid NOT NULL,
	"para_profissional_id" uuid NOT NULL,
	"consentimento" text NOT NULL,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compartilhamentos_clinicos_distintos_check" CHECK ("compartilhamentos_clinicos"."de_profissional_id" <> "compartilhamentos_clinicos"."para_profissional_id")
);
--> statement-breakpoint
CREATE TABLE "registros_clinicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"paciente_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"agendamento_id" uuid,
	"tipo" "tipo_registro_clinico" DEFAULT 'evolucao' NOT NULL,
	"adendo_de" uuid,
	"status" "status_registro_clinico" DEFAULT 'rascunho' NOT NULL,
	"conteudo_cifrado" text NOT NULL,
	"hash_integridade" text,
	"finalizado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registros_clinicos_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "registros_clinicos_adendo_check" CHECK (("registros_clinicos"."tipo" = 'adendo') = ("registros_clinicos"."adendo_de" is not null)),
	CONSTRAINT "registros_clinicos_finalizado_check" CHECK (("registros_clinicos"."status" = 'finalizado') = ("registros_clinicos"."finalizado_em" is not null and "registros_clinicos"."hash_integridade" is not null))
);
--> statement-breakpoint
ALTER TABLE "anexos_clinicos" ADD CONSTRAINT "anexos_clinicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_clinicos" ADD CONSTRAINT "anexos_clinicos_tenant_id_registro_id_registros_clinicos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","registro_id") REFERENCES "public"."registros_clinicos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaves_tenant" ADD CONSTRAINT "chaves_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_clinicos" ADD CONSTRAINT "compartilhamentos_clinicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_clinicos" ADD CONSTRAINT "compartilhamentos_clinicos_tenant_id_paciente_id_pacientes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","paciente_id") REFERENCES "public"."pacientes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_clinicos" ADD CONSTRAINT "compartilhamentos_clinicos_tenant_id_de_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","de_profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_clinicos" ADD CONSTRAINT "compartilhamentos_clinicos_tenant_id_para_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","para_profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_clinicos" ADD CONSTRAINT "registros_clinicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_clinicos" ADD CONSTRAINT "registros_clinicos_tenant_id_paciente_id_pacientes_tenant_id_id_fk" FOREIGN KEY ("tenant_id","paciente_id") REFERENCES "public"."pacientes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_clinicos" ADD CONSTRAINT "registros_clinicos_tenant_id_profissional_id_profissionais_tenant_id_id_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "public"."profissionais"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_clinicos" ADD CONSTRAINT "registros_clinicos_tenant_id_agendamento_id_agendamentos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agendamento_id") REFERENCES "public"."agendamentos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_clinicos" ADD CONSTRAINT "registros_clinicos_tenant_id_adendo_de_registros_clinicos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","adendo_de") REFERENCES "public"."registros_clinicos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexos_clinicos_registro_idx" ON "anexos_clinicos" USING btree ("registro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chaves_tenant_tenant_key" ON "chaves_tenant" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compartilhamentos_clinicos_ativo_key" ON "compartilhamentos_clinicos" USING btree ("tenant_id","paciente_id","de_profissional_id","para_profissional_id") WHERE "compartilhamentos_clinicos"."revogado_em" is null;--> statement-breakpoint
CREATE INDEX "registros_clinicos_paciente_idx" ON "registros_clinicos" USING btree ("tenant_id","paciente_id","criado_em");