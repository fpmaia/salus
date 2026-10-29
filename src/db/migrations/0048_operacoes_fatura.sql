DROP INDEX "faturas_saas_competencia_key";--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD COLUMN "tipo" text DEFAULT 'mensal' NOT NULL;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD COLUMN "observacao" text;--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_saas_competencia_key" ON "faturas_saas" USING btree ("tenant_id","competencia") WHERE tipo = 'mensal';--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_tipo_check" CHECK ("faturas_saas"."tipo" in ('mensal', 'avulsa', 'parcela_acordo'));--> statement-breakpoint
-- Operações da equipe Salus numa fatura do SaaS. O app chama o Asaas antes; estas funções
-- conferem o papel, que a fatura ainda está em aberto, gravam e auditam (plataforma e espaço).

-- 1. Fatura em aberto, travada para a operação (interna).
CREATE OR REPLACE FUNCTION app_plataforma_fatura_aberta(p_fatura_id uuid) RETURNS faturas_saas
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fatura faturas_saas%ROWTYPE;
BEGIN
  SELECT * INTO v_fatura FROM faturas_saas WHERE id = p_fatura_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fatura.nao_encontrada';
  END IF;
  IF v_fatura.status NOT IN ('pendente', 'vencida', 'erro') THEN
    RAISE EXCEPTION 'fatura.nao_aberta';
  END IF;
  RETURN v_fatura;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_aberta(uuid) FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_registrar_fatura(p_fatura faturas_saas, p_acao text, p_dados jsonb) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.fatura.' || p_acao, 'tenant', p_fatura.tenant_id::text,
    p_dados || jsonb_build_object('faturaId', p_fatura.id, 'competencia', p_fatura.competencia));
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (p_fatura.tenant_id, app_current_user_id(), 'assinatura.fatura_' || p_acao, 'faturas_saas', p_fatura.id::text, p_dados);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_registrar_fatura(faturas_saas, text, jsonb) FROM PUBLIC;
--> statement-breakpoint

-- 2. Novo vencimento (nunca no passado). Volta a "pendente" e zera os avisos de atraso.
CREATE OR REPLACE FUNCTION app_plataforma_fatura_vencimento(p_fatura_id uuid, p_vencimento date, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fatura faturas_saas%ROWTYPE;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  v_fatura := app_plataforma_fatura_aberta(p_fatura_id);
  IF p_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'fatura.vencimento_passado';
  END IF;
  UPDATE faturas_saas SET
    vencimento = p_vencimento,
    status = CASE WHEN status = 'vencida' THEN 'pendente'::status_cobranca ELSE status END,
    aviso_suspensao_em = NULL,
    suspensao_avisada_em = NULL,
    observacao = p_motivo,
    atualizado_em = now()
  WHERE id = p_fatura_id;
  PERFORM app_plataforma_registrar_fatura(v_fatura, 'vencimento',
    jsonb_build_object('de', v_fatura.vencimento, 'para', p_vencimento, 'motivo', p_motivo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_vencimento(uuid, date, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_fatura_vencimento(uuid, date, text) TO salus_app;
--> statement-breakpoint

-- 3. Ajuste pontual (desconto negativo ou acréscimo positivo) vira item; zerada = isenta e quitada.
CREATE OR REPLACE FUNCTION app_plataforma_fatura_ajuste(p_fatura_id uuid, p_valor integer, p_descricao text, p_motivo text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fatura faturas_saas%ROWTYPE;
  v_total integer;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  v_fatura := app_plataforma_fatura_aberta(p_fatura_id);
  IF p_valor = 0 THEN
    RAISE EXCEPTION 'fatura.ajuste_zero';
  END IF;
  v_total := v_fatura.valor_centavos + p_valor;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'fatura.ajuste_negativo';
  END IF;

  INSERT INTO faturas_saas_itens (tenant_id, fatura_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
  VALUES (v_fatura.tenant_id, p_fatura_id, 'ajuste', p_descricao, 1, p_valor, p_valor);
  UPDATE faturas_saas SET
    valor_centavos = v_total,
    status = CASE WHEN v_total = 0 THEN 'paga'::status_cobranca ELSE status END,
    forma_baixa = CASE WHEN v_total = 0 THEN 'isenta' ELSE forma_baixa END,
    pago_em = CASE WHEN v_total = 0 THEN now() ELSE pago_em END,
    observacao = p_motivo,
    atualizado_em = now()
  WHERE id = p_fatura_id;
  PERFORM app_plataforma_registrar_fatura(v_fatura, 'ajuste',
    jsonb_build_object('valor', p_valor, 'de', v_fatura.valor_centavos, 'para', v_total, 'descricao', p_descricao, 'motivo', p_motivo));
  RETURN v_total;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_ajuste(uuid, integer, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_fatura_ajuste(uuid, integer, text, text) TO salus_app;
--> statement-breakpoint

-- 4. Cancelar (não será cobrada).
CREATE OR REPLACE FUNCTION app_plataforma_fatura_cancelar(p_fatura_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fatura faturas_saas%ROWTYPE;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  v_fatura := app_plataforma_fatura_aberta(p_fatura_id);
  UPDATE faturas_saas SET status = 'cancelada', observacao = p_motivo, atualizado_em = now() WHERE id = p_fatura_id;
  PERFORM app_plataforma_registrar_fatura(v_fatura, 'cancelada', jsonb_build_object('valor', v_fatura.valor_centavos, 'motivo', p_motivo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_cancelar(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_fatura_cancelar(uuid, text) TO salus_app;
--> statement-breakpoint

-- 5. Baixa manual: pago fora do Asaas (PIX direto, transferência…), na data informada.
CREATE OR REPLACE FUNCTION app_plataforma_fatura_baixa(p_fatura_id uuid, p_pago_em date, p_observacao text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fatura faturas_saas%ROWTYPE;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  v_fatura := app_plataforma_fatura_aberta(p_fatura_id);
  IF p_pago_em > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'fatura.pagamento_futuro';
  END IF;
  UPDATE faturas_saas SET
    status = 'paga',
    forma_baixa = 'manual',
    pago_em = (p_pago_em + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
    observacao = p_observacao,
    atualizado_em = now()
  WHERE id = p_fatura_id;
  PERFORM app_plataforma_registrar_fatura(v_fatura, 'paga',
    jsonb_build_object('forma', 'manual', 'pagoEm', p_pago_em, 'valor', v_fatura.valor_centavos, 'observacao', p_observacao));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_baixa(uuid, date, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_fatura_baixa(uuid, date, text) TO salus_app;
--> statement-breakpoint

-- 6. Fatura avulsa (serviço extra): itens livres, competência = mês do vencimento.
CREATE OR REPLACE FUNCTION app_plataforma_fatura_avulsa(p_tenant_id uuid, p_itens jsonb, p_vencimento date, p_ambiente text, p_observacao text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_plano uuid;
  v_total integer;
  v_item jsonb;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT plano_id INTO v_plano FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  IF p_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'fatura.vencimento_passado';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'fatura.sem_itens';
  END IF;
  SELECT sum((i->>'valorCentavos')::integer) INTO v_total FROM jsonb_array_elements(p_itens) i;
  IF v_total <= 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE (i->>'valorCentavos')::integer <= 0) THEN
    RAISE EXCEPTION 'fatura.sem_itens';
  END IF;

  INSERT INTO faturas_saas (tenant_id, competencia, plano_id, valor_centavos, vencimento, ambiente, tipo, observacao)
  VALUES (p_tenant_id, date_trunc('month', p_vencimento)::date, v_plano, v_total, p_vencimento, p_ambiente::ambiente_asaas, 'avulsa', p_observacao)
  RETURNING id INTO v_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO faturas_saas_itens (tenant_id, fatura_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
    VALUES (p_tenant_id, v_id, 'ajuste', v_item->>'descricao', 1, (v_item->>'valorCentavos')::integer, (v_item->>'valorCentavos')::integer);
  END LOOP;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.fatura.avulsa', 'tenant', p_tenant_id::text,
    jsonb_build_object('faturaId', v_id, 'valor', v_total, 'vencimento', p_vencimento, 'itens', p_itens, 'observacao', p_observacao));
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (p_tenant_id, app_current_user_id(), 'assinatura.fatura_avulsa', 'faturas_saas', v_id::text,
    jsonb_build_object('valor', v_total, 'vencimento', p_vencimento));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_fatura_avulsa(uuid, jsonb, date, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_fatura_avulsa(uuid, jsonb, date, text, text) TO salus_app;
--> statement-breakpoint

-- 7. Só a fatura mensal conta para "competência já faturada" (avulsas e parcelas não).
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
  WHILE EXISTS (SELECT 1 FROM faturas_saas WHERE tenant_id = p_tenant_id AND competencia = v_mes AND tipo = 'mensal') LOOP
    v_mes := (v_mes + interval '1 month')::date;
  END LOOP;
  RETURN v_mes;
END;
$$;
--> statement-breakpoint

-- 8. Lista da plataforma com tipo e forma de baixa.
DROP FUNCTION app_plataforma_faturas(integer);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_faturas(p_limite integer)
RETURNS TABLE (
  id uuid, tenant_id uuid, tenant_nome text, competencia date, valor_centavos integer, vencimento date,
  status text, asaas_payment_id text, invoice_url text, ultimo_erro text, pago_em timestamptz, criado_em timestamptz,
  tipo text, forma_baixa text, observacao text, itens jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT f.id, f.tenant_id, t.nome, f.competencia, f.valor_centavos, f.vencimento, f.status::text, f.asaas_payment_id,
           f.invoice_url, f.ultimo_erro, f.pago_em, f.criado_em, f.tipo, f.forma_baixa, f.observacao,
           coalesce((
             SELECT jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
               'valorUnitarioCentavos', i.valor_unitario_centavos, 'valorTotalCentavos', i.valor_total_centavos) ORDER BY i.criado_em)
             FROM faturas_saas_itens i WHERE i.fatura_id = f.id
           ), '[]'::jsonb)
    FROM faturas_saas f
    JOIN tenants t ON t.id = f.tenant_id
    ORDER BY f.vencimento DESC, f.criado_em DESC
    LIMIT greatest(1, least(p_limite, 5000));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_faturas(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_faturas(integer) TO salus_app;
