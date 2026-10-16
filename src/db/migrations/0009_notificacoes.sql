CREATE TYPE "public"."status_notificacao" AS ENUM('pendente', 'enviando', 'enviado', 'falhou', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_notificacao" AS ENUM('lembrete_agendamento', 'lembrete_reserva');--> statement-breakpoint
CREATE TABLE "notificacoes_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"tipo" "tipo_notificacao" NOT NULL,
	"destinatario" text NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agendamento_id" uuid,
	"reserva_id" uuid,
	"status" "status_notificacao" DEFAULT 'pendente' NOT NULL,
	"agendar_para" timestamp with time zone DEFAULT now() NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"enviado_em" timestamp with time zone,
	"mensagem_provider_id" text,
	"idempotency_key" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificacoes_outbox" ADD CONSTRAINT "notificacoes_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes_outbox" ADD CONSTRAINT "notificacoes_outbox_tenant_id_agendamento_id_agendamentos_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agendamento_id") REFERENCES "public"."agendamentos"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes_outbox" ADD CONSTRAINT "notificacoes_outbox_tenant_id_reserva_id_reservas_sala_tenant_id_id_fk" FOREIGN KEY ("tenant_id","reserva_id") REFERENCES "public"."reservas_sala"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notificacoes_outbox_idempotency_key" ON "notificacoes_outbox" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notificacoes_outbox_fila_idx" ON "notificacoes_outbox" USING btree ("status","agendar_para");