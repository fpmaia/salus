-- Licença do prontuário: quem paga depois do teste e até quando vale o pagamento do profissional.
ALTER TABLE "licencas_prontuario" ADD COLUMN "responsavel" text DEFAULT 'espaco' NOT NULL;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN "pago_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "licencas_prontuario" ADD CONSTRAINT "licencas_prontuario_responsavel_check" CHECK ("responsavel" IN ('espaco', 'profissional'));--> statement-breakpoint
-- Licenças que já tiveram cobrança própria passam a ser do profissional; as pagas valem 30 dias do pagamento.
UPDATE "licencas_prontuario" SET "responsavel" = 'profissional' WHERE "asaas_payment_id" IS NOT NULL;--> statement-breakpoint
UPDATE "licencas_prontuario" SET "pago_ate" = "pago_em" + interval '30 days' WHERE "status_pagamento" = 'pago' AND "pago_em" IS NOT NULL;--> statement-breakpoint

-- Plataforma: editar plano (salus_app só tem SELECT em planos_saas). Campos ausentes no JSON ficam como estão.
CREATE OR REPLACE FUNCTION app_plataforma_atualizar_plano(p_plano_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes jsonb;
BEGIN
  IF NOT app_eh_superadmin() THEN
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
REVOKE ALL ON FUNCTION app_plataforma_atualizar_plano(uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_atualizar_plano(uuid, jsonb) TO salus_app;
--> statement-breakpoint

-- Plataforma: faturas do SaaS de todos os espaços, com os itens (tabelas com RLS por tenant).
CREATE OR REPLACE FUNCTION app_plataforma_faturas(p_limite integer)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_nome text,
  competencia date,
  vencimento date,
  valor_centavos integer,
  status text,
  invoice_url text,
  asaas_payment_id text,
  ultimo_erro text,
  criado_em timestamptz,
  itens jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_eh_superadmin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.tenant_id,
    t.nome,
    f.competencia,
    f.vencimento,
    f.valor_centavos,
    f.status::text,
    f.invoice_url,
    f.asaas_payment_id,
    f.ultimo_erro,
    f.criado_em,
    coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
          'valorUnitarioCentavos', i.valor_unitario_centavos, 'valorTotalCentavos', i.valor_total_centavos
        ) ORDER BY i.criado_em)
       FROM faturas_saas_itens i WHERE i.fatura_id = f.id),
      '[]'::jsonb
    )
  FROM faturas_saas f
  JOIN tenants t ON t.id = f.tenant_id
  ORDER BY f.competencia DESC, f.criado_em DESC
  LIMIT greatest(1, least(p_limite, 1000));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_faturas(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_faturas(integer) TO salus_app;
--> statement-breakpoint

-- Usuário cujo(s) espaço(s) a plataforma suspendeu/cancelou: não cai no onboarding (criaria outro espaço).
CREATE OR REPLACE FUNCTION app_usuario_tem_espaco_bloqueado()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = app_current_user_id()
      AND m.ativo
      AND t.status <> 'ativo'
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_usuario_tem_espaco_bloqueado() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_usuario_tem_espaco_bloqueado() TO salus_app;
