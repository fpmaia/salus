ALTER TABLE "tenant_settings" ADD COLUMN "modulo_fiscal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "modulo_agenda_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "modulo_prontuario" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Quem já usa um módulo continua com ele ligado.
UPDATE "tenant_settings" s SET "modulo_fiscal" = true
  WHERE EXISTS (SELECT 1 FROM "configuracoes_fiscais" c WHERE c.tenant_id = s.tenant_id)
     OR EXISTS (SELECT 1 FROM "notas_fiscais" n WHERE n.tenant_id = s.tenant_id);
--> statement-breakpoint
UPDATE "tenant_settings" s SET "modulo_agenda_online" = true
  WHERE EXISTS (SELECT 1 FROM "profissionais" p WHERE p.tenant_id = s.tenant_id AND p.agendamento_online);
--> statement-breakpoint
UPDATE "tenant_settings" s SET "modulo_prontuario" = true
  WHERE EXISTS (SELECT 1 FROM "registros_clinicos" r WHERE r.tenant_id = s.tenant_id);
--> statement-breakpoint
-- O admin não lê o prontuário (sigilo), mas precisa saber se existe algum antes de desligar o módulo.
CREATE FUNCTION app_tenant_tem_prontuario()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (SELECT 1 FROM registros_clinicos WHERE tenant_id = app_current_tenant_id())
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenant_tem_prontuario() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_tem_prontuario() TO salus_app;
