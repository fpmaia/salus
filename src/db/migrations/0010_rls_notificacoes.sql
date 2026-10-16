-- Fase 4: RLS e privilégios da outbox de notificações.
-- O worker processa um tenant por vez (withSistema), então a RLS por tenant se aplica a ele também.
ALTER TABLE notificacoes_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notificacoes_outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notificacoes_outbox
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
-- Sem DELETE: o histórico de envios fica (status cancelado/falhou em vez de apagar).
GRANT SELECT, INSERT, UPDATE ON notificacoes_outbox TO salus_app;
