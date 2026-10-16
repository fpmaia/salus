-- Pós-MVP: RLS e privilégios das cobranças via Asaas.
-- Fatura não é apagada: cancelada/estornada fica no histórico.
ALTER TABLE faturas_saas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE faturas_saas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON faturas_saas
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON faturas_saas TO salus_app;
--> statement-breakpoint
ALTER TABLE configuracoes_cobranca ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE configuracoes_cobranca FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON configuracoes_cobranca
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON configuracoes_cobranca TO salus_app;
--> statement-breakpoint
ALTER TABLE cobrancas_profissional ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cobrancas_profissional FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cobrancas_profissional
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON cobrancas_profissional TO salus_app;
--> statement-breakpoint
-- Registro de eventos processados: append-only.
ALTER TABLE eventos_webhook ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE eventos_webhook FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON eventos_webhook
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON eventos_webhook TO salus_app;
