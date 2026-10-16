CREATE TYPE "public"."origem_agendamento" AS ENUM('equipe', 'online');--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "origem" "origem_agendamento" DEFAULT 'equipe' NOT NULL;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "agendamento_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "slug_publico" text;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "duracao_consulta_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "antecedencia_min_horas" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "janela_dias" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "profissionais" ADD COLUMN "mensagem_publica" text;--> statement-breakpoint
CREATE UNIQUE INDEX "profissionais_slug_publico_key" ON "profissionais" USING btree ("slug_publico");--> statement-breakpoint
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_duracao_check" CHECK ("profissionais"."duracao_consulta_min" between 15 and 480);--> statement-breakpoint
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_janela_check" CHECK ("profissionais"."janela_dias" between 1 and 180 and "profissionais"."antecedencia_min_horas" between 0 and 168);