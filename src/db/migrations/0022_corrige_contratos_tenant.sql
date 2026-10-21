ALTER TABLE "contratos_locacao" ALTER COLUMN "tenant_id" SET DEFAULT app_current_tenant_id();
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contratos_locacao" ADD CONSTRAINT "contratos_locacao_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contratos_locacao_tenant_profissional_idx" ON "contratos_locacao" ("tenant_id", "profissional_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contratos_locacao_tenant_sala_idx" ON "contratos_locacao" ("tenant_id", "sala_id");
