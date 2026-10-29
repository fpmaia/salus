CREATE TYPE "public"."papel_plataforma" AS ENUM('dono', 'financeiro', 'suporte');--> statement-breakpoint
CREATE TABLE "convites_equipe_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"papel" "papel_plataforma" NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_por" uuid,
	"aceito_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipe_plataforma" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"papel" "papel_plataforma" NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "convites_equipe_plataforma" ADD CONSTRAINT "convites_equipe_plataforma_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_plataforma" ADD CONSTRAINT "equipe_plataforma_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_plataforma" ADD CONSTRAINT "equipe_plataforma_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convites_equipe_plataforma_email_idx" ON "convites_equipe_plataforma" USING btree ("email");
--> statement-breakpoint
-- Tabelas da plataforma: o papel do app não lê nem grava direto; só pelas funções abaixo.
ALTER TABLE "equipe_plataforma" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "equipe_plataforma" FROM salus_app;
--> statement-breakpoint
ALTER TABLE "convites_equipe_plataforma" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "convites_equipe_plataforma" FROM salus_app;
--> statement-breakpoint

-- 1. Papel do usuário atual na equipe Salus (null = fora da equipe). Superadmin sem linha = dono.
CREATE OR REPLACE FUNCTION app_papel_plataforma() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(e.papel::text, 'dono')
  FROM users u
  LEFT JOIN equipe_plataforma e ON e.user_id = u.id
  WHERE u.id = app_current_user_id() AND u.role = 'superadmin' AND NOT coalesce(u.banned, false);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_papel_plataforma() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_papel_plataforma() TO salus_app;
--> statement-breakpoint

-- 2. Matriz de permissões (espelho de src/domain/permissoes-plataforma.ts; teste confere os dois).
CREATE OR REPLACE FUNCTION app_plataforma_pode(p_permissao text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    CASE p_permissao
      WHEN 'ver' THEN papel IN ('dono', 'financeiro', 'suporte')
      WHEN 'clinicas.gerenciar' THEN papel IN ('dono', 'suporte')
      WHEN 'convites.gerenciar' THEN papel IN ('dono', 'financeiro')
      WHEN 'financeiro.gerenciar' THEN papel IN ('dono', 'financeiro')
      WHEN 'usuarios.banir' THEN papel = 'dono'
      WHEN 'planos.editar' THEN papel = 'dono'
      WHEN 'equipe.gerenciar' THEN papel = 'dono'
      ELSE false
    END, false)
  FROM (SELECT app_papel_plataforma() AS papel) p;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_pode(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_pode(text) TO salus_app;
--> statement-breakpoint

-- 3. Funções existentes passam a exigir a permissão do papel (o corpo não muda).
CREATE OR REPLACE FUNCTION app_plataforma_suspender_clinica(p_tenant_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('clinicas.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE tenants SET status = 'suspenso', atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.suspensa', 'tenant', p_tenant_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_reativar_clinica(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('clinicas.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE tenants SET status = 'ativo', atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.reativada', 'tenant', p_tenant_id::text, jsonb_build_object('status_anterior', 'suspenso'));
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_banir_usuario(p_user_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('usuarios.banir') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE users SET banned = true, ban_reason = p_motivo, updated_at = now() WHERE id = p_user_id;
  DELETE FROM sessions WHERE user_id = p_user_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'usuario.banido', 'user', p_user_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_desbanir_usuario(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('usuarios.banir') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  UPDATE users SET banned = false, ban_reason = NULL, updated_at = now() WHERE id = p_user_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'usuario.desbanido', 'user', p_user_id::text, null);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_atualizar_plano(p_plano_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes jsonb;
BEGIN
  IF NOT app_plataforma_pode('planos.editar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p) INTO v_antes FROM planos_saas p WHERE p.id = p_plano_id FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'plano.nao_encontrado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE planos_saas SET
    nome = coalesce(p_dados->>'nome', nome),
    preco_mensal_centavos = coalesce((p_dados->>'precoMensalCentavos')::integer, preco_mensal_centavos),
    preco_sala_extra_centavos = coalesce((p_dados->>'precoSalaExtraCentavos')::integer, preco_sala_extra_centavos),
    preco_profissional_extra_centavos = coalesce((p_dados->>'precoProfissionalExtraCentavos')::integer, preco_profissional_extra_centavos),
    preco_unidade_extra_centavos = coalesce((p_dados->>'precoUnidadeExtraCentavos')::integer, preco_unidade_extra_centavos),
    preco_prontuario_centavos = coalesce((p_dados->>'precoProntuarioCentavos')::integer, preco_prontuario_centavos),
    permite_unidade_extra = coalesce((p_dados->>'permiteUnidadeExtra')::boolean, permite_unidade_extra),
    limites = coalesce(p_dados->'limites', limites),
    atualizado_em = now()
  WHERE id = p_plano_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.plano.atualizar', 'planos_saas', p_plano_id::text, jsonb_build_object('de', v_antes, 'para', p_dados));
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_criar_convite_clinica(
  p_email text, p_plano_id uuid, p_dias integer, p_expira_em timestamptz, p_token_hash text, p_observacao text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_plataforma_pode('convites.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planos_saas WHERE id = p_plano_id AND ativo) THEN
    RAISE EXCEPTION 'convite_clinica.plano_invalido';
  END IF;

  UPDATE convites_clinica SET revogado_em = now()
  WHERE lower(email) = lower(p_email) AND usado_em IS NULL AND revogado_em IS NULL;

  INSERT INTO convites_clinica (email, plano_id, dias_teste, token_hash, observacao, expira_em, criado_por)
  VALUES (lower(p_email), p_plano_id, p_dias, p_token_hash, nullif(p_observacao, ''), p_expira_em, app_current_user_id())
  RETURNING id INTO v_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.convite_clinica.criar', 'convites_clinica', v_id::text,
    jsonb_build_object('email', lower(p_email), 'planoId', p_plano_id, 'dias', p_dias, 'expiraEm', p_expira_em));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_revogar_convite_clinica(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('convites.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE convites_clinica SET revogado_em = now() WHERE id = p_id AND usado_em IS NULL AND revogado_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite_clinica.nao_pendente';
  END IF;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.convite_clinica.revogar', 'convites_clinica', p_id::text, '{}'::jsonb);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_definir_fim_teste(p_tenant_id uuid, p_teste_ate date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes date;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT teste_ate INTO v_antes FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  UPDATE tenants SET teste_ate = p_teste_ate, atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.clinica.fim_teste', 'tenants', p_tenant_id::text,
    jsonb_build_object('de', v_antes, 'para', p_teste_ate));
END;
$$;
--> statement-breakpoint

-- Trocar o plano de uma clínica é decisão financeira; o plano precisa existir e estar ativo.
CREATE OR REPLACE FUNCTION app_plataforma_alterar_plano(p_tenant_id uuid, p_plano_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes uuid;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planos_saas WHERE id = p_plano_id AND ativo) THEN
    RAISE EXCEPTION 'plano.nao_encontrado';
  END IF;
  SELECT plano_id INTO v_antes FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;

  UPDATE tenants SET plano_id = p_plano_id, atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.plano_alterado', 'tenant', p_tenant_id::text,
    jsonb_build_object('plano_anterior_id', v_antes::text, 'novo_plano_id', p_plano_id::text));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_alterar_plano(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_alterar_plano(uuid, uuid) TO salus_app;
--> statement-breakpoint

-- 4. Equipe e convites pendentes (qualquer papel vê quem está na equipe).
CREATE OR REPLACE FUNCTION app_plataforma_equipe()
RETURNS TABLE (user_id uuid, nome text, email text, papel text, dois_fatores boolean, banido boolean, desde timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.name, u.email, coalesce(e.papel::text, 'dono'), coalesce(u.two_factor_enabled, false),
           coalesce(u.banned, false), coalesce(e.criado_em, u.created_at)
    FROM users u
    LEFT JOIN equipe_plataforma e ON e.user_id = u.id
    WHERE u.role = 'superadmin'
    ORDER BY u.name;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_equipe() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_equipe() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_convites_equipe()
RETURNS TABLE (id uuid, email text, papel text, expira_em timestamptz, criado_em timestamptz, criado_por_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('equipe.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.email, c.papel::text, c.expira_em, c.criado_em, u.name
    FROM convites_equipe_plataforma c
    LEFT JOIN users u ON u.id = c.criado_por
    WHERE c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now()
    ORDER BY c.criado_em DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_convites_equipe() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_convites_equipe() TO salus_app;
--> statement-breakpoint

-- 5. Dono convida por e-mail (substitui convite pendente do mesmo e-mail).
CREATE OR REPLACE FUNCTION app_plataforma_convidar_equipe(p_email text, p_papel text, p_expira_em timestamptz)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_plataforma_pode('equipe.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email) AND role = 'superadmin') THEN
    RAISE EXCEPTION 'equipe.ja_membro';
  END IF;

  UPDATE convites_equipe_plataforma SET revogado_em = now()
  WHERE lower(email) = lower(p_email) AND aceito_em IS NULL AND revogado_em IS NULL;

  INSERT INTO convites_equipe_plataforma (email, papel, expira_em, criado_por)
  VALUES (lower(p_email), p_papel::papel_plataforma, p_expira_em, app_current_user_id())
  RETURNING id INTO v_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.equipe.convidar', 'convites_equipe_plataforma', v_id::text,
    jsonb_build_object('email', lower(p_email), 'papel', p_papel));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_convidar_equipe(text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_convidar_equipe(text, text, timestamptz) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_revogar_convite_equipe(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('equipe.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE convites_equipe_plataforma SET revogado_em = now() WHERE id = p_id AND aceito_em IS NULL AND revogado_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipe.convite_nao_pendente';
  END IF;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.equipe.revogar_convite', 'convites_equipe_plataforma', p_id::text, '{}'::jsonb);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_revogar_convite_equipe(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_revogar_convite_equipe(uuid) TO salus_app;
--> statement-breakpoint

-- 6. Convite pendente do usuário atual (e-mail verificado) e aceite.
CREATE OR REPLACE FUNCTION app_convite_equipe_plataforma_pendente()
RETURNS TABLE (id uuid, papel text, convidado_por text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.papel::text, cp.name
  FROM users u
  JOIN convites_equipe_plataforma c ON lower(c.email) = lower(u.email)
  LEFT JOIN users cp ON cp.id = c.criado_por
  WHERE u.id = app_current_user_id() AND u.email_verified AND NOT coalesce(u.banned, false)
    AND c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now()
  ORDER BY c.criado_em DESC
  LIMIT 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_equipe_plataforma_pendente() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_equipe_plataforma_pendente() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_aceitar_convite_equipe_plataforma(p_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_convite convites_equipe_plataforma%ROWTYPE;
BEGIN
  SELECT c.* INTO v_convite
  FROM convites_equipe_plataforma c
  JOIN users u ON lower(u.email) = lower(c.email)
  WHERE c.id = p_id AND u.id = app_current_user_id() AND u.email_verified AND NOT coalesce(u.banned, false)
    AND c.aceito_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now()
  FOR UPDATE OF c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipe.convite_invalido';
  END IF;

  UPDATE users SET role = 'superadmin', updated_at = now() WHERE id = app_current_user_id();
  INSERT INTO equipe_plataforma (user_id, papel, criado_por)
  VALUES (app_current_user_id(), v_convite.papel, v_convite.criado_por)
  ON CONFLICT (user_id) DO UPDATE SET papel = excluded.papel, atualizado_em = now();
  UPDATE convites_equipe_plataforma SET aceito_em = now() WHERE id = p_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.equipe.entrou', 'user', app_current_user_id()::text,
    jsonb_build_object('papel', v_convite.papel, 'convite', p_id));
  RETURN v_convite.papel::text;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aceitar_convite_equipe_plataforma(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aceitar_convite_equipe_plataforma(uuid) TO salus_app;
--> statement-breakpoint

-- 7. Dono muda o papel ou tira alguém da equipe; a equipe nunca fica sem dono.
CREATE OR REPLACE FUNCTION app_plataforma_qtd_donos(p_exceto uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer
  FROM users u LEFT JOIN equipe_plataforma e ON e.user_id = u.id
  WHERE u.role = 'superadmin' AND NOT coalesce(u.banned, false)
    AND coalesce(e.papel::text, 'dono') = 'dono' AND u.id <> p_exceto;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_qtd_donos(uuid) FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_definir_papel(p_user_id uuid, p_papel text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes text;
BEGIN
  IF NOT app_plataforma_pode('equipe.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(e.papel::text, 'dono') INTO v_antes
  FROM users u LEFT JOIN equipe_plataforma e ON e.user_id = u.id
  WHERE u.id = p_user_id AND u.role = 'superadmin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipe.nao_membro';
  END IF;
  IF p_papel <> 'dono' AND app_plataforma_qtd_donos(p_user_id) = 0 THEN
    RAISE EXCEPTION 'equipe.ultimo_dono';
  END IF;

  INSERT INTO equipe_plataforma (user_id, papel, criado_por)
  VALUES (p_user_id, p_papel::papel_plataforma, app_current_user_id())
  ON CONFLICT (user_id) DO UPDATE SET papel = excluded.papel, atualizado_em = now();

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.equipe.papel', 'user', p_user_id::text,
    jsonb_build_object('de', v_antes, 'para', p_papel));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_definir_papel(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_definir_papel(uuid, text) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_remover_da_equipe(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_papel text;
BEGIN
  IF NOT app_plataforma_pode('equipe.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(e.papel::text, 'dono') INTO v_papel
  FROM users u LEFT JOIN equipe_plataforma e ON e.user_id = u.id
  WHERE u.id = p_user_id AND u.role = 'superadmin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipe.nao_membro';
  END IF;
  IF v_papel = 'dono' AND app_plataforma_qtd_donos(p_user_id) = 0 THEN
    RAISE EXCEPTION 'equipe.ultimo_dono';
  END IF;

  UPDATE users SET role = 'user', updated_at = now() WHERE id = p_user_id;
  DELETE FROM equipe_plataforma WHERE user_id = p_user_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.equipe.remover', 'user', p_user_id::text, jsonb_build_object('papel', v_papel));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_remover_da_equipe(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_remover_da_equipe(uuid) TO salus_app;
