-- Todo membro com papel "profissional" precisa de um cadastro em profissionais: é por ele que
-- a agenda, o extrato, o contrato e a licença do prontuário encontram a pessoa. O convite pela
-- tela Equipe (sem profissional escolhido) e a troca de papel criavam só o acesso.

-- 1. Vincula (ou cria) o cadastro do profissional de um membro. Interno: sem checagem de contexto.
CREATE OR REPLACE FUNCTION app_vincular_profissional_do_membro(p_membership_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_membro memberships%ROWTYPE;
  v_nome text;
  v_email text;
  v_profissional_id uuid;
BEGIN
  SELECT * INTO v_membro FROM memberships WHERE id = p_membership_id;
  IF NOT FOUND OR v_membro.role <> 'profissional' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_profissional_id FROM profissionais WHERE membership_id = v_membro.id;
  IF FOUND THEN
    RETURN v_profissional_id;
  END IF;

  SELECT name, lower(email) INTO v_nome, v_email FROM users WHERE id = v_membro.user_id;

  -- Já cadastrado pelo admin com o mesmo e-mail e ainda sem acesso: só vincula.
  UPDATE profissionais
  SET membership_id = v_membro.id, ativo = true, atualizado_em = now()
  WHERE tenant_id = v_membro.tenant_id AND lower(email) = v_email AND membership_id IS NULL
  RETURNING id INTO v_profissional_id;
  IF FOUND THEN
    RETURN v_profissional_id;
  END IF;

  -- E-mail já vinculado a outro acesso: não mexe (o admin resolve em Profissionais).
  IF EXISTS (SELECT 1 FROM profissionais WHERE tenant_id = v_membro.tenant_id AND lower(email) = v_email) THEN
    RETURN NULL;
  END IF;

  INSERT INTO profissionais (tenant_id, membership_id, nome, email)
  VALUES (v_membro.tenant_id, v_membro.id, v_nome, v_email)
  RETURNING id INTO v_profissional_id;

  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (
    v_membro.tenant_id,
    v_membro.user_id,
    'profissional.criado_pelo_acesso',
    'profissionais',
    v_profissional_id::text,
    jsonb_build_object('membershipId', v_membro.id, 'email', v_email)
  );

  RETURN v_profissional_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_vincular_profissional_do_membro(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 2. Versão para o app (troca de papel na tela Equipe): só membros do espaço do contexto.
CREATE OR REPLACE FUNCTION app_garantir_profissional_do_membro(p_membership_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE id = p_membership_id AND tenant_id = app_current_tenant_id()) THEN
    RAISE EXCEPTION 'membro.invalido';
  END IF;
  RETURN app_vincular_profissional_do_membro(p_membership_id);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_garantir_profissional_do_membro(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_garantir_profissional_do_membro(uuid) TO salus_app;
--> statement-breakpoint

-- 3. Aceite do convite de equipe: além do profissional escolhido no convite, garante o cadastro.
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

  -- Papel profissional sem cadastro escolhido: vincula pelo e-mail ou cria o cadastro.
  PERFORM app_vincular_profissional_do_membro(v_membership_id);

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

-- 4. Corrige quem já entrou assim.
SELECT app_vincular_profissional_do_membro(m.id)
FROM memberships m
WHERE m.role = 'profissional'
  AND NOT EXISTS (SELECT 1 FROM profissionais p WHERE p.membership_id = m.id);
