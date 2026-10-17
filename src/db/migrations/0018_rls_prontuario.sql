-- Prontuário: RLS por PROFISSIONAL (não só por tenant), imutabilidade e regras de adendo/anexo.
--
-- Contexto definido por withProntuario (src/db/tenant.ts): app.tenant_id, app.user_id,
-- app.role e app.profissional_id. Admin e recepção não têm app.profissional_id e, portanto,
-- não leem nada — exceto na solicitação formal (app.prontuario_solicitacao = 'on', só admin).
--
-- Atenção: aqui NÃO existe a policy genérica tenant_isolation. Policies permissivas se somam
-- (OR); uma policy "todo o tenant" anularia o isolamento por profissional.

CREATE FUNCTION app_current_profissional_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.profissional_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_prontuario_solicitacao() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.prontuario_solicitacao', true), '') = 'on' AND app_current_role() = 'admin' $$;
--> statement-breakpoint

-- Chave de dados do tenant ------------------------------------------------------------
ALTER TABLE chaves_tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chaves_tenant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chaves_tenant
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON chaves_tenant TO salus_app;
--> statement-breakpoint

-- Compartilhamentos -----------------------------------------------------------------------
ALTER TABLE compartilhamentos_clinicos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE compartilhamentos_clinicos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY compartilhamento_leitura ON compartilhamentos_clinicos FOR SELECT
  USING (tenant_id = app_current_tenant_id() AND (
    de_profissional_id = app_current_profissional_id()
    OR para_profissional_id = app_current_profissional_id()
    OR app_prontuario_solicitacao()));
--> statement-breakpoint
CREATE POLICY compartilhamento_criacao ON compartilhamentos_clinicos FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant_id() AND de_profissional_id = app_current_profissional_id());
--> statement-breakpoint
CREATE POLICY compartilhamento_revogacao ON compartilhamentos_clinicos FOR UPDATE
  USING (tenant_id = app_current_tenant_id() AND de_profissional_id = app_current_profissional_id())
  WITH CHECK (tenant_id = app_current_tenant_id() AND de_profissional_id = app_current_profissional_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON compartilhamentos_clinicos TO salus_app;
--> statement-breakpoint

-- Registros clínicos -----------------------------------------------------------------------
ALTER TABLE registros_clinicos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registros_clinicos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Lê: o autor; quem recebeu compartilhamento ativo (só finalizados); ou a solicitação formal.
CREATE POLICY registro_leitura ON registros_clinicos FOR SELECT
  USING (tenant_id = app_current_tenant_id() AND (
    profissional_id = app_current_profissional_id()
    OR app_prontuario_solicitacao()
    OR (status = 'finalizado' AND EXISTS (
      SELECT 1 FROM compartilhamentos_clinicos c
      WHERE c.tenant_id = registros_clinicos.tenant_id
        AND c.paciente_id = registros_clinicos.paciente_id
        AND c.de_profissional_id = registros_clinicos.profissional_id
        AND c.para_profissional_id = app_current_profissional_id()
        AND c.revogado_em IS NULL))));
--> statement-breakpoint
CREATE POLICY registro_criacao ON registros_clinicos FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id());
--> statement-breakpoint
CREATE POLICY registro_edicao ON registros_clinicos FOR UPDATE
  USING (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id())
  WITH CHECK (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id());
--> statement-breakpoint
CREATE POLICY registro_descarte ON registros_clinicos FOR DELETE
  USING (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON registros_clinicos TO salus_app;
--> statement-breakpoint

-- Finalizado é imutável e não pode ser apagado; rascunho só muda o conteúdo (ou é finalizado).
CREATE FUNCTION app_registro_clinico_protecao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'finalizado' THEN RAISE EXCEPTION 'prontuario.imutavel'; END IF;
      RETURN OLD;
    END IF;
    IF OLD.status = 'finalizado' THEN RAISE EXCEPTION 'prontuario.imutavel'; END IF;
    IF NEW.paciente_id <> OLD.paciente_id OR NEW.profissional_id <> OLD.profissional_id
       OR NEW.tipo <> OLD.tipo OR NEW.adendo_de IS DISTINCT FROM OLD.adendo_de THEN
      RAISE EXCEPTION 'prontuario.campos_fixos';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER registros_clinicos_protecao
  BEFORE UPDATE OR DELETE ON registros_clinicos
  FOR EACH ROW EXECUTE FUNCTION app_registro_clinico_protecao();
--> statement-breakpoint

-- Adendo só sobre registro finalizado do mesmo paciente e do mesmo autor.
CREATE FUNCTION app_registro_clinico_adendo() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.adendo_de IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM registros_clinicos o
      WHERE o.id = NEW.adendo_de AND o.tenant_id = NEW.tenant_id
        AND o.paciente_id = NEW.paciente_id AND o.profissional_id = NEW.profissional_id
        AND o.status = 'finalizado' AND o.tipo = 'evolucao'
    ) THEN
      RAISE EXCEPTION 'prontuario.adendo_invalido';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER registros_clinicos_adendo
  BEFORE INSERT ON registros_clinicos
  FOR EACH ROW EXECUTE FUNCTION app_registro_clinico_adendo();
--> statement-breakpoint

-- Anexos -------------------------------------------------------------------------------------
ALTER TABLE anexos_clinicos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE anexos_clinicos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY anexo_leitura ON anexos_clinicos FOR SELECT
  USING (tenant_id = app_current_tenant_id() AND EXISTS (
    SELECT 1 FROM registros_clinicos r WHERE r.id = anexos_clinicos.registro_id));
--> statement-breakpoint
CREATE POLICY anexo_criacao ON anexos_clinicos FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id());
--> statement-breakpoint
CREATE POLICY anexo_remocao ON anexos_clinicos FOR DELETE
  USING (tenant_id = app_current_tenant_id() AND profissional_id = app_current_profissional_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON anexos_clinicos TO salus_app;
--> statement-breakpoint

-- Anexo só entra/sai de rascunho do próprio autor e do mesmo paciente.
CREATE FUNCTION app_anexo_clinico_rascunho() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_registro uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.registro_id ELSE NEW.registro_id END;
    v_linha anexos_clinicos%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM registros_clinicos r
      WHERE r.id = v_registro AND r.status = 'rascunho'
        AND r.paciente_id = v_linha.paciente_id AND r.profissional_id = v_linha.profissional_id
    ) THEN
      RAISE EXCEPTION 'prontuario.anexo_fora_do_rascunho';
    END IF;
    RETURN v_linha;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER anexos_clinicos_rascunho
  BEFORE INSERT OR DELETE ON anexos_clinicos
  FOR EACH ROW EXECUTE FUNCTION app_anexo_clinico_rascunho();
