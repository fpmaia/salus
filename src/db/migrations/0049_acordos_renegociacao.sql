CREATE TABLE "acordos_saas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"valor_original_centavos" integer NOT NULL,
	"desconto_centavos" integer DEFAULT 0 NOT NULL,
	"valor_final_centavos" integer NOT NULL,
	"parcelas" integer NOT NULL,
	"motivo" text NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	CONSTRAINT "acordos_saas_status_check" CHECK ("acordos_saas"."status" in ('ativo', 'quitado', 'cancelado')),
	CONSTRAINT "acordos_saas_valores_check" CHECK ("acordos_saas"."desconto_centavos" >= 0 and "acordos_saas"."valor_final_centavos" > 0 and "acordos_saas"."valor_final_centavos" = "acordos_saas"."valor_original_centavos" - "acordos_saas"."desconto_centavos"),
	CONSTRAINT "acordos_saas_parcelas_check" CHECK ("acordos_saas"."parcelas" between 1 and 24)
);
--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD COLUMN "acordo_id" uuid;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD COLUMN "substituida_por_acordo_id" uuid;--> statement-breakpoint
ALTER TABLE "acordos_saas" ADD CONSTRAINT "acordos_saas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_saas" ADD CONSTRAINT "acordos_saas_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acordos_saas_tenant_idx" ON "acordos_saas" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_acordo_id_acordos_saas_id_fk" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos_saas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas_saas" ADD CONSTRAINT "faturas_saas_substituida_por_acordo_id_acordos_saas_id_fk" FOREIGN KEY ("substituida_por_acordo_id") REFERENCES "public"."acordos_saas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Acordos: o espaço lê os seus; só as funções da plataforma criam e cancelam. A quitação é
-- automática (gatilho abaixo), seja pelo Asaas, seja por baixa manual.
ALTER TABLE acordos_saas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE acordos_saas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON acordos_saas
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT ON acordos_saas TO salus_app;
--> statement-breakpoint

-- 1. Cria o acordo: as faturas em aberto são canceladas (substituídas) e viram parcelas.
CREATE OR REPLACE FUNCTION app_plataforma_criar_acordo(
  p_tenant_id uuid, p_faturas uuid[], p_desconto integer, p_parcelas jsonb, p_motivo text, p_ambiente text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_plano uuid;
  v_original integer;
  v_qtd integer;
  v_soma integer;
  v_n integer;
  v_parcela jsonb;
  v_i integer := 0;
  v_fatura_id uuid;
  v_anterior date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT plano_id INTO v_plano FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  IF coalesce(array_length(p_faturas, 1), 0) = 0 THEN
    RAISE EXCEPTION 'acordo.sem_faturas';
  END IF;

  -- Todas da clínica, em aberto e fora de outro acordo ativo.
  PERFORM 1 FROM faturas_saas WHERE id = ANY (p_faturas) FOR UPDATE;
  SELECT count(*), coalesce(sum(valor_centavos), 0) INTO v_qtd, v_original
  FROM faturas_saas f
  WHERE f.id = ANY (p_faturas) AND f.tenant_id = p_tenant_id AND f.status IN ('pendente', 'vencida', 'erro')
    AND NOT EXISTS (SELECT 1 FROM acordos_saas a WHERE a.id = f.acordo_id AND a.status = 'ativo');
  IF v_qtd <> array_length(p_faturas, 1) THEN
    RAISE EXCEPTION 'acordo.faturas_invalidas';
  END IF;

  v_n := jsonb_array_length(p_parcelas);
  IF v_n < 1 OR v_n > 24 THEN
    RAISE EXCEPTION 'acordo.parcelas_invalidas';
  END IF;
  IF p_desconto < 0 OR p_desconto >= v_original THEN
    RAISE EXCEPTION 'acordo.desconto_invalido';
  END IF;
  SELECT sum((x->>'valorCentavos')::integer) INTO v_soma FROM jsonb_array_elements(p_parcelas) x;
  IF v_soma <> v_original - p_desconto OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_parcelas) x WHERE (x->>'valorCentavos')::integer <= 0) THEN
    RAISE EXCEPTION 'acordo.soma_invalida';
  END IF;
  v_anterior := v_hoje - 1;
  FOR v_parcela IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    IF (v_parcela->>'vencimento')::date <= v_anterior THEN
      RAISE EXCEPTION 'acordo.datas_invalidas';
    END IF;
    v_anterior := (v_parcela->>'vencimento')::date;
  END LOOP;

  INSERT INTO acordos_saas (tenant_id, valor_original_centavos, desconto_centavos, valor_final_centavos, parcelas, motivo, criado_por)
  VALUES (p_tenant_id, v_original, p_desconto, v_original - p_desconto, v_n, p_motivo, app_current_user_id())
  RETURNING id INTO v_id;

  UPDATE faturas_saas SET status = 'cancelada', substituida_por_acordo_id = v_id, observacao = 'Renegociada em acordo', atualizado_em = now()
  WHERE id = ANY (p_faturas);

  FOR v_parcela IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    v_i := v_i + 1;
    INSERT INTO faturas_saas (tenant_id, competencia, plano_id, valor_centavos, vencimento, ambiente, tipo, acordo_id, observacao)
    VALUES (
      p_tenant_id, date_trunc('month', (v_parcela->>'vencimento')::date)::date, v_plano, (v_parcela->>'valorCentavos')::integer,
      (v_parcela->>'vencimento')::date, p_ambiente::ambiente_asaas, 'parcela_acordo', v_id, format('acordo, parcela %s/%s', v_i, v_n)
    )
    RETURNING id INTO v_fatura_id;
    INSERT INTO faturas_saas_itens (tenant_id, fatura_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
    VALUES (p_tenant_id, v_fatura_id, 'ajuste', format('Parcela %s/%s do acordo de renegociação', v_i, v_n), 1,
      (v_parcela->>'valorCentavos')::integer, (v_parcela->>'valorCentavos')::integer);
  END LOOP;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.acordo.criar', 'tenant', p_tenant_id::text,
    jsonb_build_object('acordoId', v_id, 'faturas', to_jsonb(p_faturas), 'original', v_original, 'desconto', p_desconto, 'parcelas', p_parcelas, 'motivo', p_motivo));
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (p_tenant_id, app_current_user_id(), 'assinatura.acordo_criado', 'acordos_saas', v_id::text,
    jsonb_build_object('original', v_original, 'desconto', p_desconto, 'parcelas', v_n));
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_criar_acordo(uuid, uuid[], integer, jsonb, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_criar_acordo(uuid, uuid[], integer, jsonb, text, text) TO salus_app;
--> statement-breakpoint

-- 2. Cancela o acordo: as parcelas em aberto são canceladas; as originais não voltam.
CREATE OR REPLACE FUNCTION app_plataforma_cancelar_acordo(p_acordo_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_acordo acordos_saas%ROWTYPE;
BEGIN
  IF NOT app_plataforma_pode('financeiro.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_acordo FROM acordos_saas WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND OR v_acordo.status <> 'ativo' THEN
    RAISE EXCEPTION 'acordo.nao_ativo';
  END IF;
  UPDATE faturas_saas SET status = 'cancelada', observacao = 'Acordo cancelado: ' || p_motivo, atualizado_em = now()
  WHERE acordo_id = p_acordo_id AND status IN ('pendente', 'vencida', 'erro');
  UPDATE acordos_saas SET status = 'cancelado', encerrado_em = now() WHERE id = p_acordo_id;

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'plataforma.acordo.cancelar', 'tenant', v_acordo.tenant_id::text,
    jsonb_build_object('acordoId', p_acordo_id, 'motivo', p_motivo));
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (v_acordo.tenant_id, app_current_user_id(), 'assinatura.acordo_cancelado', 'acordos_saas', p_acordo_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_cancelar_acordo(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_cancelar_acordo(uuid, text) TO salus_app;
--> statement-breakpoint

-- 3. Quitação: todas as parcelas pagas → acordo quitado (vale para Asaas e baixa manual).
CREATE OR REPLACE FUNCTION app_quitar_acordo_pela_parcela() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.acordo_id IS NOT NULL AND NEW.status = 'paga' AND OLD.status IS DISTINCT FROM 'paga'
     AND NOT EXISTS (SELECT 1 FROM faturas_saas WHERE acordo_id = NEW.acordo_id AND status <> 'paga') THEN
    UPDATE acordos_saas SET status = 'quitado', encerrado_em = now() WHERE id = NEW.acordo_id AND status = 'ativo';
    IF FOUND THEN
      INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
      VALUES (NEW.tenant_id, app_current_user_id(), 'assinatura.acordo_quitado', 'acordos_saas', NEW.acordo_id::text, '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_quitar_acordo_pela_parcela() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER faturas_saas_quita_acordo
  AFTER UPDATE OF status ON faturas_saas
  FOR EACH ROW EXECUTE FUNCTION app_quitar_acordo_pela_parcela();
