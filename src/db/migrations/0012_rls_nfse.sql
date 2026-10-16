-- Pós-MVP: RLS e privilégios da NFS-e.
ALTER TABLE configuracoes_fiscais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE configuracoes_fiscais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON configuracoes_fiscais
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON configuracoes_fiscais TO salus_app;
--> statement-breakpoint

-- Nota fiscal não é apagada: erro e cancelamento ficam no histórico.
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notas_fiscais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notas_fiscais
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notas_fiscais TO salus_app;
