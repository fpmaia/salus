ALTER TABLE "licencas_prontuario" ADD COLUMN IF NOT EXISTS "status_pagamento" text DEFAULT 'nenhum' NOT NULL;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN IF NOT EXISTS "asaas_payment_id" text;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN IF NOT EXISTS "invoice_url" text;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN IF NOT EXISTS "valor_centavos" integer DEFAULT 4990 NOT NULL;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN IF NOT EXISTS "pago_em" timestamp with time zone;
