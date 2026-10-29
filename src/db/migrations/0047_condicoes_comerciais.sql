ALTER TYPE "public"."tipo_item_fatura_saas" ADD VALUE 'desconto';--> statement-breakpoint
ALTER TYPE "public"."tipo_item_fatura_saas" ADD VALUE 'credito';--> statement-breakpoint
ALTER TYPE "public"."tipo_item_fatura_saas" ADD VALUE 'ajuste';--> statement-breakpoint
CREATE TABLE "condicoes_comerciais_tenant" (
	"tenant_id" uuid PRIMARY KEY DEFAULT app_current_tenant_id() NOT NULL,
	"preco_mensal_centavos" integer,
	"preco_sala_extra_centavos" integer,
	"preco_profissional_extra_centavos" integer,
	"preco_unidade_extra_centavos" integer,
	"preco_prontuario_centavos" integer,
	"dia_vencimento" integer,
	"dias_carencia" integer,
	"observacao" text,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condicoes_dia_vencimento_check" CHECK ("condicoes_comerciais_tenant"."dia_vencimento" between 1 and 28),
	CONSTRAINT "condicoes_dias_carencia_check" CHECK ("condicoes_comerciais_tenant"."dias_carencia" between 0 and 90),
	CONSTRAINT "condicoes_precos_check" CHECK (coalesce("condicoes_comerciais_tenant"."preco_mensal_centavos", 0) >= 0 and coalesce("condicoes_comerciais_tenant"."preco_sala_extra_centavos", 0) >= 0 and coalesce("condicoes_comerciais_tenant"."preco_profissional_extra_centavos", 0) >= 0 and coalesce("condicoes_comerciais_tenant"."preco_unidade_extra_centavos", 0) >= 0 and coalesce("condicoes_comerciais_tenant"."preco_prontuario_centavos", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "creditos_tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"valor_centavos" integer NOT NULL,
	"saldo_centavos" integer NOT NULL,
	"motivo" text NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "creditos_tenant_valor_check" CHECK ("creditos_tenant"."valor_centavos" > 0 and "creditos_tenant"."saldo_centavos" between 0 and "creditos_tenant"."valor_centavos")
);
--> statement-breakpoint
CREATE TABLE "cupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text,
	"tipo" text NOT NULL,
	"valor" integer NOT NULL,
	"duracao_meses" integer,
	"valido_ate" date,
	"max_usos" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"planos_ids" uuid[],
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cupons_tipo_check" CHECK ("cupons"."tipo" in ('percentual', 'valor')),
	CONSTRAINT "cupons_valor_check" CHECK ("cupons"."valor" > 0 and ("cupons"."tipo" <> 'percentual' or "cupons"."valor" <= 100)),
	CONSTRAINT "cupons_duracao_check" CHECK ("cupons"."duracao_meses" is null or "cupons"."duracao_meses" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "descontos_tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"tipo" text NOT NULL,
	"valor" integer NOT NULL,
	"competencia_inicio" date NOT NULL,
	"competencia_fim" date,
	"motivo" text NOT NULL,
	"cupom_id" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "descontos_tenant_tipo_check" CHECK ("descontos_tenant"."tipo" in ('percentual', 'valor')),
	CONSTRAINT "descontos_tenant_valor_check" CHECK ("descontos_tenant"."valor" > 0 and ("descontos_tenant"."tipo" <> 'percentual' or "descontos_tenant"."valor" <= 100)),
	CONSTRAINT "descontos_tenant_periodo_check" CHECK ("descontos_tenant"."competencia_fim" is null or "descontos_tenant"."competencia_fim" >= "descontos_tenant"."competencia_inicio")
);
--> statement-breakpoint
ALTER TABLE "faturas_saas" DROP CONSTRAINT "faturas_saas_valor_check";--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" DROP CONSTRAINT "faturas_saas_itens_valor_check";--> statement-breakpoint
ALTER TABLE "convites_clinica" ADD COLUMN "cupom_codigo" text;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD COLUMN "forma_baixa" text;--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" ADD COLUMN "referencia_id" uuid;--> statement-breakpoint
ALTER TABLE "condicoes_comerciais_tenant" ADD CONSTRAINT "condicoes_comerciais_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condicoes_comerciais_tenant" ADD CONSTRAINT "condicoes_comerciais_tenant_atualizado_por_users_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_tenant" ADD CONSTRAINT "creditos_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_tenant" ADD CONSTRAINT "creditos_tenant_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descontos_tenant" ADD CONSTRAINT "descontos_tenant_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descontos_tenant" ADD CONSTRAINT "descontos_tenant_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descontos_tenant" ADD CONSTRAINT "descontos_tenant_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creditos_tenant_tenant_idx" ON "creditos_tenant" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "descontos_tenant_tenant_idx" ON "descontos_tenant" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_forma_baixa_check" CHECK ("faturas_saas"."forma_baixa" in ('gateway', 'manual', 'isenta'));--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_valor_check" CHECK ("faturas_saas"."valor_centavos" >= 0);--> statement-breakpoint
ALTER TABLE "faturas_saas_itens" ADD CONSTRAINT "faturas_saas_itens_valor_check" CHECK ("faturas_saas_itens"."valor_total_centavos" >= 0 or "faturas_saas_itens"."tipo"::text in ('desconto', 'credito', 'ajuste'));
--> statement-breakpoint
-- Condições, descontos e créditos: o espaço lê os seus (RLS); só as funções da plataforma gravam.
-- O job da fatura (contexto sistema) consome o saldo dos créditos.
ALTER TABLE condicoes_comerciais_tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE condicoes_comerciais_tenant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON condicoes_comerciais_tenant
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT ON condicoes_comerciais_tenant TO salus_app;
--> statement-breakpoint
ALTER TABLE descontos_tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE descontos_tenant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON descontos_tenant
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT ON descontos_tenant TO salus_app;
--> statement-breakpoint
ALTER TABLE creditos_tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE creditos_tenant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON creditos_tenant
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT ON creditos_tenant TO salus_app;
--> statement-breakpoint
GRANT UPDATE (saldo_centavos) ON creditos_tenant TO salus_app;
--> statement-breakpoint
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON cupons FROM salus_app;
--> statement-breakpoint

-- 1. Condições negociadas (substitui tudo: campo ausente = volta ao preço/regra do plano).
CREATE OR REPLACE FUNCTION app_plataforma_salvar_condicoes(p_tenant_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes jsonb;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  SELECT to_jsonb(c) INTO v_antes FROM condicoes_comerciais_tenant c WHERE c.tenant_id = p_tenant_id;

  INSERT INTO condicoes_comerciais_tenant AS c (
    tenant_id, preco_mensal_centavos, preco_sala_extra_centavos, preco_profissional_extra_centavos,
    preco_unidade_extra_centavos, preco_prontuario_centavos, dia_vencimento, dias_carencia, observacao, atualizado_por, atualizado_em
  ) VALUES (
    p_tenant_id,
    (p_dados->>'precoMensalCentavos')::integer,
    (p_dados->>'precoSalaExtraCentavos')::integer,
    (p_dados->>'precoProfissionalExtraCentavos')::integer,
    (p_dados->>'precoUnidadeExtraCentavos')::integer,
    (p_dados->>'precoProntuarioCentavos')::integer,
    (p_dados->>'diaVencimento')::integer,
    (p_dados->>'diasCarencia')::integer,
    nullif(p_dados->>'observacao', ''),
    app_current_user_id(),
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    preco_mensal_centavos = excluded.preco_mensal_centavos,
    preco_sala_extra_centavos = excluded.preco_sala_extra_centavos,
    preco_profissional_extra_centavos = excluded.preco_profissional_extra_centavos,
    preco_unidade_extra_centavos = excluded.preco_unidade_extra_centavos,
    preco_prontuario_centavos = excluded.preco_prontuario_centavos,
    dia_vencimento = excluded.dia_vencimento,
    dias_carencia = excluded.dias_carencia,
    observacao = excluded.observacao,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = now();

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.condicoes.salvar', 'tenant', p_tenant_id::text, jsonb_build_object('de', v_antes, 'para', p_dados));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_salvar_condicoes(uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_salvar_condicoes(uuid, jsonb) TO salus_app;
--> statement-breakpoint

-- 2. Desconto recorrente manual (percentual de 1 a 100, ou centavos por fatura).
CREATE OR REPLACE FUNCTION app_plataforma_criar_desconto(
  p_tenant_id uuid, p_tipo text, p_valor integer, p_inicio date, p_fim date, p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  IF p_fim IS NOT NULL AND date_trunc('month', p_fim) < date_trunc('month', p_inicio) THEN
    RAISE EXCEPTION 'desconto.periodo_invalido';
  END IF;

  INSERT INTO descontos_tenant (tenant_id, tipo, valor, competencia_inicio, competencia_fim, motivo, criado_por)
  VALUES (p_tenant_id, p_tipo, p_valor, date_trunc('month', p_inicio)::date, date_trunc('month', p_fim)::date, p_motivo, app_current_user_id())
  RETURNING id INTO v_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.desconto.criar', 'tenant', p_tenant_id::text,
    jsonb_build_object('descontoId', v_id, 'tipo', p_tipo, 'valor', p_valor, 'inicio', p_inicio, 'fim', p_fim, 'motivo', p_motivo));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_criar_desconto(uuid, text, integer, date, date, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_criar_desconto(uuid, text, integer, date, date, text) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_revogar_desconto(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE descontos_tenant SET revogado_em = now() WHERE id = p_id AND revogado_em IS NULL RETURNING tenant_id INTO v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desconto.nao_encontrado';
  END IF;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.desconto.revogar', 'tenant', v_tenant::text, jsonb_build_object('descontoId', p_id));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_revogar_desconto(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_revogar_desconto(uuid) TO salus_app;
--> statement-breakpoint

-- 3. Crédito avulso (abate das próximas faturas até acabar o saldo).
CREATE OR REPLACE FUNCTION app_plataforma_lancar_credito(p_tenant_id uuid, p_valor integer, p_motivo text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  INSERT INTO creditos_tenant (tenant_id, valor_centavos, saldo_centavos, motivo, criado_por)
  VALUES (p_tenant_id, p_valor, p_valor, p_motivo, app_current_user_id())
  RETURNING id INTO v_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.credito.lancar', 'tenant', p_tenant_id::text,
    jsonb_build_object('creditoId', v_id, 'valor', p_valor, 'motivo', p_motivo));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_lancar_credito(uuid, integer, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_lancar_credito(uuid, integer, text) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_revogar_credito(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant uuid;
  v_saldo integer;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE creditos_tenant SET revogado_em = now() WHERE id = p_id AND revogado_em IS NULL
  RETURNING tenant_id, saldo_centavos INTO v_tenant, v_saldo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credito.nao_encontrado';
  END IF;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.credito.revogar', 'tenant', v_tenant::text, jsonb_build_object('creditoId', p_id, 'saldoPerdido', v_saldo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_revogar_credito(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_revogar_credito(uuid) TO salus_app;
--> statement-breakpoint

-- 4. Cupons: lista e cadastro (código em maiúsculas, único).
CREATE OR REPLACE FUNCTION app_plataforma_cupons()
RETURNS SETOF cupons
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM cupons ORDER BY ativo DESC, criado_em DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_cupons() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_cupons() TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_salvar_cupom(p_id uuid, p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_codigo text := upper(trim(p_dados->>'codigo'));
  v_planos uuid[];
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF v_codigo !~ '^[A-Z0-9_-]{3,30}$' THEN
    RAISE EXCEPTION 'cupom.codigo_invalido';
  END IF;
  IF jsonb_typeof(p_dados->'planosIds') = 'array' AND jsonb_array_length(p_dados->'planosIds') > 0 THEN
    SELECT array_agg(value::uuid) INTO v_planos FROM jsonb_array_elements_text(p_dados->'planosIds');
  END IF;
  IF EXISTS (SELECT 1 FROM cupons WHERE codigo = v_codigo AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'cupom.codigo_duplicado';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO cupons (codigo, descricao, tipo, valor, duracao_meses, valido_ate, max_usos, planos_ids, ativo, criado_por)
    VALUES (
      v_codigo, nullif(p_dados->>'descricao', ''), p_dados->>'tipo', (p_dados->>'valor')::integer,
      (p_dados->>'duracaoMeses')::integer, (p_dados->>'validoAte')::date, (p_dados->>'maxUsos')::integer,
      v_planos, coalesce((p_dados->>'ativo')::boolean, true), app_current_user_id()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE cupons SET
      codigo = v_codigo,
      descricao = nullif(p_dados->>'descricao', ''),
      tipo = p_dados->>'tipo',
      valor = (p_dados->>'valor')::integer,
      duracao_meses = (p_dados->>'duracaoMeses')::integer,
      valido_ate = (p_dados->>'validoAte')::date,
      max_usos = (p_dados->>'maxUsos')::integer,
      planos_ids = v_planos,
      ativo = coalesce((p_dados->>'ativo')::boolean, ativo),
      atualizado_em = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'cupom.nao_encontrado';
    END IF;
  END IF;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), CASE WHEN p_id IS NULL THEN 'plataforma.cupom.criar' ELSE 'plataforma.cupom.editar' END,
    'cupons', v_id::text, p_dados);
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_salvar_cupom(uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_salvar_cupom(uuid, jsonb) TO salus_app;
--> statement-breakpoint

-- 5. Primeira competência ainda sem fatura mensal (depois do teste, se houver).
CREATE OR REPLACE FUNCTION app_proxima_competencia_a_faturar(p_tenant_id uuid) RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mes date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_teste date;
BEGIN
  SELECT teste_ate INTO v_teste FROM tenants WHERE id = p_tenant_id;
  IF v_teste IS NOT NULL THEN
    v_mes := greatest(v_mes, (date_trunc('month', v_teste) + interval '1 month')::date);
  END IF;
  WHILE EXISTS (SELECT 1 FROM faturas_saas WHERE tenant_id = p_tenant_id AND competencia = v_mes) LOOP
    v_mes := (v_mes + interval '1 month')::date;
  END LOOP;
  RETURN v_mes;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_proxima_competencia_a_faturar(uuid) FROM PUBLIC;
--> statement-breakpoint

-- 6. Aplica um cupom ao espaço (interno: convite e tela da assinatura). Um cupom por vez e
-- nunca o mesmo cupom duas vezes no mesmo espaço; o desconto vale a partir da próxima fatura.
CREATE OR REPLACE FUNCTION app_aplicar_cupom_interno(p_tenant_id uuid, p_codigo text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cupom cupons%ROWTYPE;
  v_inicio date := app_proxima_competencia_a_faturar(p_tenant_id);
  v_fim date;
  v_id uuid;
BEGIN
  SELECT * INTO v_cupom FROM cupons WHERE codigo = upper(trim(p_codigo)) FOR UPDATE;
  IF NOT FOUND OR NOT v_cupom.ativo THEN
    RAISE EXCEPTION 'cupom.invalido';
  END IF;
  IF v_cupom.valido_ate IS NOT NULL AND v_cupom.valido_ate < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'cupom.expirado';
  END IF;
  IF v_cupom.max_usos IS NOT NULL AND v_cupom.usos >= v_cupom.max_usos THEN
    RAISE EXCEPTION 'cupom.esgotado';
  END IF;
  IF v_cupom.planos_ids IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND plano_id = ANY (v_cupom.planos_ids)) THEN
    RAISE EXCEPTION 'cupom.plano';
  END IF;
  IF EXISTS (SELECT 1 FROM descontos_tenant WHERE tenant_id = p_tenant_id AND cupom_id = v_cupom.id) THEN
    RAISE EXCEPTION 'cupom.ja_usado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM descontos_tenant
    WHERE tenant_id = p_tenant_id AND cupom_id IS NOT NULL AND revogado_em IS NULL
      AND (competencia_fim IS NULL OR competencia_fim >= v_inicio)
  ) THEN
    RAISE EXCEPTION 'cupom.ja_tem';
  END IF;

  IF v_cupom.duracao_meses IS NOT NULL THEN
    v_fim := (v_inicio + make_interval(months => v_cupom.duracao_meses - 1))::date;
  END IF;
  INSERT INTO descontos_tenant (tenant_id, tipo, valor, competencia_inicio, competencia_fim, motivo, cupom_id, criado_por)
  VALUES (p_tenant_id, v_cupom.tipo, v_cupom.valor, v_inicio, v_fim, 'Cupom ' || v_cupom.codigo, v_cupom.id, app_current_user_id())
  RETURNING id INTO v_id;
  UPDATE cupons SET usos = usos + 1, atualizado_em = now() WHERE id = v_cupom.id;

  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (p_tenant_id, app_current_user_id(), 'assinatura.cupom_aplicado', 'descontos_tenant', v_id::text,
    jsonb_build_object('cupom', v_cupom.codigo, 'tipo', v_cupom.tipo, 'valor', v_cupom.valor, 'inicio', v_inicio, 'fim', v_fim));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aplicar_cupom_interno(uuid, text) FROM PUBLIC;
--> statement-breakpoint

-- Pelo admin do espaço (tela Assinatura).
CREATE OR REPLACE FUNCTION app_aplicar_cupom(p_codigo text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_current_tenant_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE tenant_id = app_current_tenant_id() AND user_id = app_current_user_id() AND role = 'admin' AND ativo
  ) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN app_aplicar_cupom_interno(app_current_tenant_id(), p_codigo);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_aplicar_cupom(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_aplicar_cupom(text) TO salus_app;
--> statement-breakpoint

-- 7. Convite trial com cupom: o convite guarda o código e o cadastro aplica.
DROP FUNCTION app_plataforma_criar_convite_clinica(text, uuid, integer, timestamptz, text, text);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_criar_convite_clinica(
  p_email text, p_plano_id uuid, p_dias integer, p_expira_em timestamptz, p_token_hash text, p_observacao text, p_cupom text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_cupom text := nullif(upper(trim(coalesce(p_cupom, ''))), '');
BEGIN
  IF NOT app_plataforma_pode('convites.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planos_saas WHERE id = p_plano_id AND ativo) THEN
    RAISE EXCEPTION 'convite_clinica.plano_invalido';
  END IF;
  IF v_cupom IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cupons WHERE codigo = v_cupom AND ativo) THEN
    RAISE EXCEPTION 'cupom.invalido';
  END IF;

  UPDATE convites_clinica SET revogado_em = now()
  WHERE lower(email) = lower(p_email) AND usado_em IS NULL AND revogado_em IS NULL;

  INSERT INTO convites_clinica (email, plano_id, dias_teste, token_hash, observacao, expira_em, criado_por, cupom_codigo)
  VALUES (lower(p_email), p_plano_id, p_dias, p_token_hash, nullif(p_observacao, ''), p_expira_em, app_current_user_id(), v_cupom)
  RETURNING id INTO v_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.convite_clinica.criar', 'convites_clinica', v_id::text,
    jsonb_build_object('email', lower(p_email), 'planoId', p_plano_id, 'dias', p_dias, 'expiraEm', p_expira_em, 'cupom', v_cupom));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_criar_convite_clinica(text, uuid, integer, timestamptz, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_criar_convite_clinica(text, uuid, integer, timestamptz, text, text, text) TO salus_app;
--> statement-breakpoint

DROP FUNCTION app_convite_clinica_por_token(text);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_convite_clinica_por_token(p_token_hash text)
RETURNS TABLE (
  email text, plano_nome text, dias_teste integer, expira_em timestamptz, usado_em timestamptz, revogado_em timestamptz, cupom_codigo text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.email, p.nome, c.dias_teste, c.expira_em, c.usado_em, c.revogado_em, c.cupom_codigo
  FROM convites_clinica c JOIN planos_saas p ON p.id = c.plano_id
  WHERE c.token_hash = p_token_hash;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_convite_clinica_por_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_convite_clinica_por_token(text) TO salus_app;
--> statement-breakpoint

-- O uso do convite aplica o cupom dele no mesmo passo (mesma transação do cadastro).
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

  IF v_convite.cupom_codigo IS NOT NULL THEN
    PERFORM app_aplicar_cupom_interno(v_tenant_id, v_convite.cupom_codigo);
  END IF;
  RETURN v_teste_ate;
END;
$$;
