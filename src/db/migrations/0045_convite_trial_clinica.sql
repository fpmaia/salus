CREATE TABLE "convites_clinica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"plano_id" uuid NOT NULL,
	"dias_teste" integer NOT NULL,
	"token_hash" text NOT NULL,
	"observacao" text,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_por" uuid,
	"usado_em" timestamp with time zone,
	"usado_por" uuid,
	"tenant_id" uuid,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_clinica_dias_check" CHECK ("convites_clinica"."dias_teste" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teste_ate" date;--> statement-breakpoint
ALTER TABLE "convites_clinica" ADD CONSTRAINT "convites_clinica_plano_id_planos_saas_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos_saas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_clinica" ADD CONSTRAINT "convites_clinica_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_clinica" ADD CONSTRAINT "convites_clinica_usado_por_users_id_fk" FOREIGN KEY ("usado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_clinica" ADD CONSTRAINT "convites_clinica_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "convites_clinica_token_key" ON "convites_clinica" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "convites_clinica_email_idx" ON "convites_clinica" USING btree ("email");
--> statement-breakpoint

-- Tabela da plataforma: o papel do app não lê nem grava direto; só pelas funções abaixo.
ALTER TABLE "convites_clinica" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "convites_clinica" FROM salus_app;
--> statement-breakpoint

-- 1. Superadmin cria o convite (substitui convites pendentes do mesmo e-mail).
CREATE OR REPLACE FUNCTION app_plataforma_criar_convite_clinica(
  p_email text, p_plano_id uuid, p_dias integer, p_expira_em timestamptz, p_token_hash text, p_observacao text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_eh_superadmin() THEN
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
REVOKE ALL ON FUNCTION app_plataforma_criar_convite_clinica(text, uuid, integer, timestamptz, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_criar_convite_clinica(text, uuid, integer, timestamptz, text, text) TO salus_app;
--> statement-breakpoint

-- 2. Lista para a tela de convites da plataforma.
CREATE OR REPLACE FUNCTION app_plataforma_convites_clinica(p_limite integer)
RETURNS TABLE (
  id uuid, email text, plano_nome text, dias_teste integer, observacao text, expira_em timestamptz,
  criado_em timestamptz, criado_por_nome text, usado_em timestamptz, revogado_em timestamptz,
  tenant_id uuid, tenant_nome text, teste_ate date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.email, p.nome, c.dias_teste, c.observacao, c.expira_em, c.criado_em, u.name, c.usado_em, c.revogado_em,
           c.tenant_id, t.nome, t.teste_ate
    FROM convites_clinica c
    JOIN planos_saas p ON p.id = c.plano_id
    LEFT JOIN users u ON u.id = c.criado_por
    LEFT JOIN tenants t ON t.id = c.tenant_id
    ORDER BY c.criado_em DESC
    LIMIT p_limite;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_convites_clinica(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_convites_clinica(integer) TO salus_app;
--> statement-breakpoint

-- 3. Revoga um convite ainda não usado.
CREATE OR REPLACE FUNCTION app_plataforma_revogar_convite_clinica(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
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
REVOKE ALL ON FUNCTION app_plataforma_revogar_convite_clinica(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_revogar_convite_clinica(uuid) TO salus_app;
--> statement-breakpoint

-- 4. Superadmin estende, encerra (data no passado) ou tira (null) o teste de uma clínica.
CREATE OR REPLACE FUNCTION app_plataforma_definir_fim_teste(p_tenant_id uuid, p_teste_ate date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes date;
BEGIN
  IF NOT app_eh_superadmin() THEN
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
REVOKE ALL ON FUNCTION app_plataforma_definir_fim_teste(uuid, date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_definir_fim_teste(uuid, date) TO salus_app;
--> statement-breakpoint

-- 5. Dados públicos do convite (página do link), sem o token.
CREATE OR REPLACE FUNCTION app_convite_clinica_por_token(p_token_hash text)
RETURNS TABLE (
  email text, plano_nome text, dias_teste integer, expira_em timestamptz, usado_em timestamptz, revogado_em timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.email, p.nome, c.dias_teste, c.expira_em, c.usado_em, c.revogado_em
  FROM convites_clinica c JOIN planos_saas p ON p.id = c.plano_id
  WHERE c.token_hash = p_token_hash;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_clinica_por_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_clinica_por_token(text) TO salus_app;
--> statement-breakpoint

-- 6. Usa o convite no espaço recém-criado (contexto do tenant): plano do convite e fim do teste.
CREATE OR REPLACE FUNCTION app_usar_convite_clinica(p_token_hash text)
RETURNS date
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := app_current_user_id();
  v_tenant_id uuid := app_current_tenant_id();
  v_convite convites_clinica%ROWTYPE;
  v_teste_ate date;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'convite_clinica.invalido';
  END IF;
  SELECT * INTO v_convite FROM convites_clinica WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_convite.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'convite_clinica.invalido';
  END IF;
  IF v_convite.usado_em IS NOT NULL THEN
    RAISE EXCEPTION 'convite_clinica.usado';
  END IF;
  IF v_convite.expira_em <= now() THEN
    RAISE EXCEPTION 'convite_clinica.expirado';
  END IF;
  IF lower(v_convite.email) <> (SELECT lower(email) FROM users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'convite_clinica.email_divergente';
  END IF;

  -- Teste de N dias contando hoje (fuso de Brasília): 30 dias a partir de 01/11 vão até 30/11.
  v_teste_ate := (now() AT TIME ZONE 'America/Sao_Paulo')::date + v_convite.dias_teste - 1;
  UPDATE tenants SET plano_id = v_convite.plano_id, teste_ate = v_teste_ate, atualizado_em = now() WHERE id = v_tenant_id;
  UPDATE convites_clinica SET usado_em = now(), usado_por = v_user_id, tenant_id = v_tenant_id WHERE id = v_convite.id;

  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (v_tenant_id, v_user_id, 'tenant.teste_iniciado', 'convites_clinica', v_convite.id::text,
    jsonb_build_object('planoId', v_convite.plano_id, 'dias', v_convite.dias_teste, 'testeAte', v_teste_ate));
  RETURN v_teste_ate;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_usar_convite_clinica(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_usar_convite_clinica(text) TO salus_app;
