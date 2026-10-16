-- Fase 3: RLS e privilégios do financeiro, vigência de acordos e imutabilidade do fechamento.

-- Um profissional tem no máximo um acordo vigente por dia (vigente_ate nulo = sem fim).
ALTER TABLE acordos_financeiros ADD CONSTRAINT acordos_sem_sobreposicao_vigencia
  EXCLUDE USING gist (profissional_id WITH =, daterange(vigente_de, vigente_ate, '[]') WITH &&);
--> statement-breakpoint

-- Competência fechada não recebe lançamentos (o serviço desvia para a próxima aberta).
CREATE FUNCTION app_lancamento_competencia_aberta() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM fechamentos f
      WHERE f.tenant_id = NEW.tenant_id
        AND f.profissional_id = NEW.profissional_id
        AND f.competencia = NEW.competencia
        AND f.status = 'fechado'
    ) THEN
      RAISE EXCEPTION 'lancamento.competencia_fechada';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER lancamentos_competencia_aberta
  BEFORE INSERT ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION app_lancamento_competencia_aberta();
--> statement-breakpoint

-- Fechamento fechado é imutável.
CREATE FUNCTION app_fechamento_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status = 'fechado' THEN
      RAISE EXCEPTION 'fechamento.imutavel';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER fechamentos_imutavel
  BEFORE UPDATE ON fechamentos
  FOR EACH ROW EXECUTE FUNCTION app_fechamento_imutavel();
--> statement-breakpoint

-- RLS ---------------------------------------------------------------------------------
ALTER TABLE acordos_financeiros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE acordos_financeiros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON acordos_financeiros
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON acordos_financeiros TO salus_app;
--> statement-breakpoint

-- Ledger append-only: sem UPDATE/DELETE para a aplicação.
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lancamentos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lancamentos
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON lancamentos TO salus_app;
--> statement-breakpoint

ALTER TABLE fechamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fechamentos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fechamentos
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON fechamentos TO salus_app;
--> statement-breakpoint

ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pagamentos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pagamentos
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON pagamentos TO salus_app;
