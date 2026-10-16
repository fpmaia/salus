-- Fase 1: RLS, privilégios, prevenção de conflitos de agenda e funções de convite/worker.
-- Mesmo padrão da 0002: toda tabela com tenant_id tem ENABLE + FORCE RLS, policy
-- tenant_isolation e GRANT mínimo ao salus_app.

-- Conflitos de agenda -----------------------------------------------------------
-- btree_gist permite combinar igualdade (sala_id/profissional_id) com sobreposição de range.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE reservas_sala ADD CONSTRAINT reservas_sala_sem_sobreposicao_sala
  EXCLUDE USING gist (sala_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelada');
--> statement-breakpoint
ALTER TABLE reservas_sala ADD CONSTRAINT reservas_sala_sem_sobreposicao_profissional
  EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelada');
--> statement-breakpoint

-- profissionais.membership_id é FK simples (para permitir ON DELETE SET NULL); este
-- trigger garante que a membership é do mesmo tenant do profissional.
CREATE FUNCTION app_profissional_membership_mesmo_tenant() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = NEW.membership_id AND m.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'membership % não pertence ao tenant do profissional', NEW.membership_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER profissionais_membership_mesmo_tenant
  BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON profissionais
  FOR EACH ROW EXECUTE FUNCTION app_profissional_membership_mesmo_tenant();
--> statement-breakpoint

-- RLS ---------------------------------------------------------------------------
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE unidades FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON unidades
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON unidades TO salus_app;
--> statement-breakpoint

ALTER TABLE horarios_funcionamento ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE horarios_funcionamento FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON horarios_funcionamento
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON horarios_funcionamento TO salus_app;
--> statement-breakpoint

ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE feriados FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON feriados
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON feriados TO salus_app;
--> statement-breakpoint

ALTER TABLE salas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE salas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON salas
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON salas TO salus_app;
--> statement-breakpoint

ALTER TABLE recursos_sala ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE recursos_sala FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON recursos_sala
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON recursos_sala TO salus_app;
--> statement-breakpoint

ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profissionais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON profissionais
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON profissionais TO salus_app;
--> statement-breakpoint

ALTER TABLE convites_profissional ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE convites_profissional FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON convites_profissional
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON convites_profissional TO salus_app;
--> statement-breakpoint

ALTER TABLE regras_recorrencia ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE regras_recorrencia FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON regras_recorrencia
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON regras_recorrencia TO salus_app;
--> statement-breakpoint

-- Reservas não são apagadas: cancelamento muda o status (histórico para o financeiro).
ALTER TABLE reservas_sala ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reservas_sala FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON reservas_sala
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON reservas_sala TO salus_app;
--> statement-breakpoint

-- Convite de profissional ---------------------------------------------------------
-- Quem abre o link ainda não tem tenant no contexto (e talvez nem conta). As funções
-- rodam como o dono e só operam sobre o convite cujo hash foi informado.
CREATE FUNCTION app_convite_por_token(p_token_hash text)
  RETURNS TABLE (tenant_nome text, profissional_nome text, email text, situacao text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t.nome, p.nome, p.email,
           CASE
             WHEN c.revogado_em IS NOT NULL THEN 'revogado'
             WHEN c.aceito_em IS NOT NULL OR p.membership_id IS NOT NULL THEN 'aceito'
             WHEN c.expira_em <= now() THEN 'expirado'
             ELSE 'valido'
           END
    FROM convites_profissional c
    JOIN profissionais p ON p.id = c.profissional_id AND p.tenant_id = c.tenant_id
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.token_hash = p_token_hash
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_por_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_por_token(text) TO salus_app;
--> statement-breakpoint

-- Aceita o convite para o usuário em app.user_id (withUser). Erros usam mensagens
-- "convite.*" que a aplicação traduz (src/server/profissionais.ts).
CREATE FUNCTION app_aceitar_convite(p_token_hash text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_usuario uuid := app_current_user_id();
    v_convite convites_profissional%ROWTYPE;
    v_profissional profissionais%ROWTYPE;
    v_email text;
    v_membership uuid;
  BEGIN
    IF v_usuario IS NULL THEN
      RAISE EXCEPTION 'convite.sem_usuario';
    END IF;

    SELECT * INTO v_convite FROM convites_profissional
      WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND OR v_convite.revogado_em IS NOT NULL THEN
      RAISE EXCEPTION 'convite.invalido';
    END IF;

    SELECT * INTO v_profissional FROM profissionais
      WHERE id = v_convite.profissional_id AND tenant_id = v_convite.tenant_id FOR UPDATE;
    IF v_convite.aceito_em IS NOT NULL OR v_profissional.membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'convite.ja_aceito';
    END IF;
    IF v_convite.expira_em <= now() THEN
      RAISE EXCEPTION 'convite.expirado';
    END IF;

    SELECT email INTO v_email FROM users WHERE id = v_usuario;
    IF v_email IS NULL OR lower(v_email) <> lower(v_profissional.email) THEN
      RAISE EXCEPTION 'convite.email_divergente';
    END IF;
    -- ADR 03: a UI é limitada a 1 tenant por usuário.
    IF EXISTS (SELECT 1 FROM memberships WHERE user_id = v_usuario AND ativo) THEN
      RAISE EXCEPTION 'convite.usuario_com_espaco';
    END IF;

    INSERT INTO memberships (tenant_id, user_id, role)
      VALUES (v_convite.tenant_id, v_usuario, 'profissional')
      RETURNING id INTO v_membership;
    UPDATE profissionais SET membership_id = v_membership, atualizado_em = now()
      WHERE id = v_profissional.id;
    UPDATE convites_profissional SET aceito_em = now(), aceito_por = v_usuario
      WHERE id = v_convite.id;
    INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
      VALUES (v_convite.tenant_id, v_usuario, 'convite.aceito', 'profissionais',
              v_profissional.id::text, jsonb_build_object('membership_id', v_membership));

    RETURN v_convite.tenant_id;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aceitar_convite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aceitar_convite(text) TO salus_app;
--> statement-breakpoint

-- Worker ------------------------------------------------------------------------------
-- Jobs (recorrências, conclusão de reservas) percorrem os tenants ativos e processam
-- cada um dentro do próprio contexto (withSistema). Só os ids são expostos.
CREATE FUNCTION app_tenants_ativos()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id FROM tenants WHERE status = 'ativo' ORDER BY criado_em $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_tenants_ativos() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenants_ativos() TO salus_app;
