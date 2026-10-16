-- Isolamento multi-tenant (ADR 10) e privilégios do papel da aplicação.
--
-- salus_owner (quem roda esta migration) é dono das tabelas; salus_app é o papel da
-- aplicação: sem BYPASSRLS, não dono, e com o mínimo de privilégios por tabela.
-- Toda tabela com tenant_id DEVE ter ENABLE + FORCE RLS e a policy tenant_isolation
-- (o teste tests/integration/isolamento-tenant.test.ts verifica isso automaticamente).

GRANT USAGE ON SCHEMA public TO salus_app;
--> statement-breakpoint

-- Globais -------------------------------------------------------------------
GRANT SELECT ON planos_saas TO salus_app;
--> statement-breakpoint
-- Tabelas do Better Auth: globais (login precisa achar o usuário pelo e-mail antes de haver tenant).
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO salus_app;
--> statement-breakpoint

-- Tenant --------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_current_tenant_id())
  WITH CHECK (id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenants TO salus_app;
--> statement-breakpoint

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_settings
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenant_settings TO salus_app;
--> statement-breakpoint

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO salus_app;
--> statement-breakpoint

-- audit_log é append-only: sem UPDATE/DELETE para a aplicação.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO salus_app;
--> statement-breakpoint

-- Resolução de tenant no login ------------------------------------------------
-- Antes de haver tenant no contexto, a aplicação precisa descobrir de quais tenants o
-- usuário participa. A função roda como o dono (SECURITY DEFINER) e só devolve as
-- memberships do usuário em app.user_id (definido por withUser), nunca de terceiros.
CREATE FUNCTION app_memberships_do_usuario()
  RETURNS TABLE (membership_id uuid, tenant_id uuid, tenant_nome text, role membership_role)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.id, m.tenant_id, t.nome, m.role
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = app_current_user_id()
      AND m.ativo
      AND t.status = 'ativo'
    ORDER BY m.criado_em
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_memberships_do_usuario() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_memberships_do_usuario() TO salus_app;
--> statement-breakpoint

-- Dados de referência ---------------------------------------------------------
INSERT INTO planos_saas (codigo, nome, preco_mensal_centavos, limites) VALUES
  ('basico', 'Básico', 19900, '{"unidades": 1, "salas": 5, "profissionais": 15}'),
  ('pro', 'Pro', 49900, '{"unidades": 3, "salas": 20, "profissionais": 60}'),
  ('enterprise', 'Enterprise', 129900, '{"unidades": 50, "salas": 500, "profissionais": 2000}');
