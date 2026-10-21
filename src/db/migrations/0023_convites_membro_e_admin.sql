-- Migration 0023: Convites de membro genéricos, admin Better Auth e funções da Plataforma

-- 1. Colunas do plugin admin do Better Auth
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamptz;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonated_by" text;
--> statement-breakpoint

-- 2. Tabela de convites genéricos de membros da equipe (admin, recepcao, profissional)
CREATE TABLE IF NOT EXISTS "convites_membro" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL DEFAULT app_current_tenant_id() REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "membership_role" NOT NULL,
  "profissional_id" uuid REFERENCES "profissionais"("id") ON DELETE SET NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expira_em" timestamptz NOT NULL,
  "aceito_em" timestamptz,
  "aceito_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revogado_em" timestamptz,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "convites_membro_tenant_email_idx" ON "convites_membro"("tenant_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "convites_membro_token_hash_idx" ON "convites_membro"("token_hash");
--> statement-breakpoint

ALTER TABLE "convites_membro" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "convites_membro" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'convites_membro' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON "convites_membro"
      FOR ALL
      USING (tenant_id = app_current_tenant_id())
      WITH CHECK (tenant_id = app_current_tenant_id());
  END IF;
END $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "convites_membro" TO salus_app;
--> statement-breakpoint

-- 3. Tabela global de auditoria da plataforma
CREATE TABLE IF NOT EXISTS "audit_plataforma" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "acao" text NOT NULL,
  "alvo_tipo" text NOT NULL,
  "alvo_id" text,
  "dados" jsonb,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_plataforma_criado_em_idx" ON "audit_plataforma"("criado_em" DESC);
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_plataforma" TO salus_app;
--> statement-breakpoint

-- 4. Função para verificar se usuário é superadmin
CREATE OR REPLACE FUNCTION app_eh_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = app_current_user_id()
      AND role = 'superadmin'
      AND NOT coalesce(banned, false)
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_eh_superadmin() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_eh_superadmin() TO salus_app;
--> statement-breakpoint

-- 5. Leitura de convite de membro por hash de token (pública / sem tenant)
CREATE OR REPLACE FUNCTION app_convite_membro_por_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_nome text,
  email text,
  role membership_role,
  expira_em timestamptz,
  aceito_em timestamptz,
  revogado_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.tenant_id,
    t.nome AS tenant_nome,
    c.email,
    c.role,
    c.expira_em,
    c.aceito_em,
    c.revogado_em
  FROM convites_membro c
  JOIN tenants t ON t.id = c.tenant_id
  WHERE c.token_hash = p_token_hash;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_membro_por_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_membro_por_token(text) TO salus_app;
--> statement-breakpoint

-- 6. Aceite de convite de membro
CREATE OR REPLACE FUNCTION app_aceitar_convite_membro(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_convite convites_membro%ROWTYPE;
  v_membership_id uuid;
BEGIN
  v_user_id := app_current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'convite.sem_usuario';
  END IF;

  SELECT email INTO v_user_email FROM users WHERE id = v_user_id;
  SELECT * INTO v_convite FROM convites_membro WHERE token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND OR v_convite.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'convite.invalido';
  END IF;

  IF v_convite.aceito_em IS NOT NULL THEN
    RAISE EXCEPTION 'convite.ja_aceito';
  END IF;

  IF v_convite.expira_em <= now() THEN
    RAISE EXCEPTION 'convite.expirado';
  END IF;

  IF lower(v_convite.email) <> lower(v_user_email) THEN
    RAISE EXCEPTION 'convite.email_divergente';
  END IF;

  -- Cria ou atualiza membership
  INSERT INTO memberships (tenant_id, user_id, role, ativo)
  VALUES (v_convite.tenant_id, v_user_id, v_convite.role, true)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, ativo = true, atualizado_em = now()
  RETURNING id INTO v_membership_id;

  -- Se houver profissional vinculado, associa a membership
  IF v_convite.profissional_id IS NOT NULL THEN
    UPDATE profissionais
    SET membership_id = v_membership_id, atualizado_em = now()
    WHERE id = v_convite.profissional_id
      AND tenant_id = v_convite.tenant_id
      AND (membership_id IS NULL OR membership_id = v_membership_id);
  END IF;

  -- Marca convite como aceito
  UPDATE convites_membro
  SET aceito_em = now(), aceito_por = v_user_id
  WHERE id = v_convite.id;

  -- Registra auditoria do aceite
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (
    v_convite.tenant_id,
    v_user_id,
    'convite.aceito',
    'convites_membro',
    v_convite.id::text,
    jsonb_build_object('role', v_convite.role, 'email', v_convite.email)
  );

  RETURN v_convite.tenant_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aceitar_convite_membro(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aceitar_convite_membro(text) TO salus_app;
--> statement-breakpoint

-- 7. Funções de leitura e gestão da Plataforma (Superadmin)
CREATE OR REPLACE FUNCTION app_plataforma_metricas()
RETURNS TABLE (
  total_clinicas bigint,
  clinicas_ativas bigint,
  clinicas_suspensas bigint,
  total_usuarios bigint,
  total_profissionais bigint,
  mrr_estimado_centavos bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM tenants) AS total_clinicas,
    (SELECT count(*) FROM tenants WHERE status = 'ativo') AS clinicas_ativas,
    (SELECT count(*) FROM tenants WHERE status = 'suspenso') AS clinicas_suspensas,
    (SELECT count(*) FROM users) AS total_usuarios,
    (SELECT count(*) FROM profissionais) AS total_profissionais,
    coalesce(
      (SELECT sum(p.preco_mensal_centavos)::bigint
       FROM tenants t
       JOIN planos_saas p ON p.id = t.plano_id
       WHERE t.status = 'ativo'),
      0
    ) AS mrr_estimado_centavos;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_metricas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_metricas() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_clinicas()
RETURNS TABLE (
  id uuid,
  nome text,
  status tenant_status,
  documento text,
  plano_codigo text,
  plano_nome text,
  plano_preco_centavos integer,
  membros_count bigint,
  salas_count bigint,
  profissionais_count bigint,
  criado_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.nome,
    t.status,
    t.documento,
    p.codigo AS plano_codigo,
    p.nome AS plano_nome,
    p.preco_mensal_centavos AS plano_preco_centavos,
    coalesce((SELECT count(*) FROM memberships m WHERE m.tenant_id = t.id AND m.ativo), 0) AS membros_count,
    coalesce((SELECT count(*) FROM salas s WHERE s.tenant_id = t.id AND s.ativo), 0) AS salas_count,
    coalesce((SELECT count(*) FROM profissionais pf WHERE pf.tenant_id = t.id AND pf.ativo), 0) AS profissionais_count,
    t.criado_em
  FROM tenants t
  JOIN planos_saas p ON p.id = t.plano_id
  ORDER BY t.criado_em DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_clinicas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_clinicas() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_usuarios()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  banned boolean,
  ban_reason text,
  clinicas_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.email,
    u.role,
    coalesce(u.banned, false) AS banned,
    u.ban_reason,
    coalesce((SELECT count(*) FROM memberships m WHERE m.user_id = u.id AND m.ativo), 0) AS clinicas_count,
    u.created_at
  FROM users u
  ORDER BY u.created_at DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_usuarios() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_usuarios() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_suspender_clinica(p_tenant_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE tenants SET status = 'suspenso', atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.suspensa', 'tenant', p_tenant_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_suspender_clinica(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_suspender_clinica(uuid, text) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_reativar_clinica(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE tenants SET status = 'ativo', atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.reativada', 'tenant', p_tenant_id::text, jsonb_build_object('status_anterior', 'suspenso'));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_reativar_clinica(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_reativar_clinica(uuid) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_alterar_plano(p_tenant_id uuid, p_plano_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE tenants SET plano_id = p_plano_id, atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.plano_alterado', 'tenant', p_tenant_id::text, jsonb_build_object('novo_plano_id', p_plano_id::text));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_alterar_plano(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_alterar_plano(uuid, uuid) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_banir_usuario(p_user_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE users SET banned = true, ban_reason = p_motivo, updated_at = now() WHERE id = p_user_id;
  DELETE FROM sessions WHERE user_id = p_user_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'usuario.banido', 'user', p_user_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_banir_usuario(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_banir_usuario(uuid, text) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_desbanir_usuario(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE users SET banned = false, ban_reason = NULL, updated_at = now() WHERE id = p_user_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'usuario.desbanido', 'user', p_user_id::text, null);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_desbanir_usuario(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_desbanir_usuario(uuid) TO salus_app;
