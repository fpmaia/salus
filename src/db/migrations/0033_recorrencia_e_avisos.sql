CREATE TYPE "public"."frequencia_recorrencia" AS ENUM('semanal', 'quinzenal', 'mensal');--> statement-breakpoint
ALTER TYPE "public"."tipo_notificacao" ADD VALUE 'cancelamento_agendamento';--> statement-breakpoint
ALTER TYPE "public"."tipo_notificacao" ADD VALUE 'cancelamento_reserva';--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD COLUMN "frequencia" "frequencia_recorrencia" DEFAULT 'semanal' NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD COLUMN "semana_do_mes" smallint;--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD COLUMN "grupo_id" uuid;--> statement-breakpoint
CREATE INDEX "regras_recorrencia_grupo_idx" ON "regras_recorrencia" USING btree ("grupo_id");--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_mensal_check" CHECK (("regras_recorrencia"."frequencia" = 'mensal') = ("regras_recorrencia"."semana_do_mes" is not null) and ("regras_recorrencia"."semana_do_mes" is null or "regras_recorrencia"."semana_do_mes" between 1 and 5));