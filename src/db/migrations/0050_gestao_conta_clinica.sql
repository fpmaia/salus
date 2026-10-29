CREATE TABLE "notas_clinica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "motivo_suspensao" text;--> statement-breakpoint
ALTER TABLE "notas_clinica" ADD CONSTRAINT "notas_clinica_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_clinica" ADD CONSTRAINT "notas_clinica_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notas_clinica_tenant_idx" ON "notas_clinica" USING btree ("tenant_id","criado_em");--> statement-breakpoint
ALTER TABLE notas_clinica ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON notas_clinica FROM salus_app;
--> statement-breakpoint

-- 1. Nova permissão: cancelar a conta de uma clínica é só do Dono.
CREATE OR REPLACE FUNCTION app_plataforma_pode(p_permissao text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    CASE p_permissao
      WHEN 'ver' THEN papel IN ('dono', 'financeiro', 'suporte')
      WHEN 'clinicas.gerenciar' THEN papel IN ('dono', 'suporte')
      WHEN 'clinicas.cancelar' THEN papel = 'dono'
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

-- 2. Suspender guarda o motivo (mostrado em /conta-suspensa); reativar limpa.
CREATE OR REPLACE FUNCTION app_plataforma_suspender_clinica(p_tenant_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('clinicas.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET status = 'suspenso', motivo_suspensao = nullif(trim(p_motivo), ''), atualizado_em = now() WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.suspensa', 'tenant', p_tenant_id::text, jsonb_build_object('motivo', p_motivo));
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_reativar_clinica(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes tenant_status;
BEGIN
  IF NOT app_plataforma_pode('clinicas.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_antes FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  -- Reabrir uma conta cancelada é decisão do Dono.
  IF v_antes = 'cancelado' AND NOT app_plataforma_pode('clinicas.cancelar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET status = 'ativo', motivo_suspensao = NULL, atualizado_em = now() WHERE id = p_tenant_id;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.reativada', 'tenant', p_tenant_id::text, jsonb_build_object('status_anterior', v_antes));
END;
$$;
--> statement-breakpoint

-- 3. Cancelar a conta: sem acesso, faturas em aberto e acordos ativos cancelados.
CREATE OR REPLACE FUNCTION app_plataforma_cancelar_clinica(p_tenant_id uuid, p_motivo text)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_faturas integer;
BEGIN
  IF NOT app_plataforma_pode('clinicas.cancelar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET status = 'cancelado', motivo_suspensao = p_motivo, atualizado_em = now() WHERE id = p_tenant_id AND status <> 'cancelado';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinica.ja_cancelada';
  END IF;
  UPDATE faturas_saas SET status = 'cancelada', observacao = 'Conta cancelada: ' || p_motivo, atualizado_em = now()
  WHERE tenant_id = p_tenant_id AND status IN ('pendente', 'vencida', 'erro');
  GET DIAGNOSTICS v_faturas = ROW_COUNT;
  UPDATE acordos_saas SET status = 'cancelado', encerrado_em = now() WHERE tenant_id = p_tenant_id AND status = 'ativo';

  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'clinica.cancelada', 'tenant', p_tenant_id::text, jsonb_build_object('motivo', p_motivo, 'faturasCanceladas', v_faturas));
  INSERT INTO audit_log (tenant_id, user_id, acao, entidade, entidade_id, dados)
  VALUES (p_tenant_id, app_current_user_id(), 'tenant.cancelado', 'tenants', p_tenant_id::text, jsonb_build_object('motivo', p_motivo));
  RETURN v_faturas;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_cancelar_clinica(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_cancelar_clinica(uuid, text) TO salus_app;
--> statement-breakpoint

-- 4. Motivo do bloqueio para quem participa do espaço (tela /conta-suspensa).
CREATE OR REPLACE FUNCTION app_motivo_espaco_bloqueado()
RETURNS TABLE (status text, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.status::text, t.motivo_suspensao
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = app_current_user_id() AND m.ativo AND t.status <> 'ativo'
  ORDER BY t.atualizado_em DESC
  LIMIT 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_motivo_espaco_bloqueado() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_motivo_espaco_bloqueado() TO salus_app;
--> statement-breakpoint

-- 5. Notas internas (qualquer papel da equipe lê e escreve; não se apagam).
CREATE OR REPLACE FUNCTION app_plataforma_notas(p_tenant_id uuid)
RETURNS TABLE (id uuid, texto text, autor_nome text, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT n.id, n.texto, u.name, n.criado_em
    FROM notas_clinica n LEFT JOIN users u ON u.id = n.autor_id
    WHERE n.tenant_id = p_tenant_id
    ORDER BY n.criado_em DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_notas(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_notas(uuid) TO salus_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_plataforma_criar_nota(p_tenant_id uuid, p_texto text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'clinica.nao_encontrada';
  END IF;
  INSERT INTO notas_clinica (tenant_id, texto, autor_id) VALUES (p_tenant_id, p_texto, app_current_user_id()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_criar_nota(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_criar_nota(uuid, text) TO salus_app;
--> statement-breakpoint

-- 6. Encerra as sessões de um usuário (ex.: senha vazada, saída da clínica).
CREATE OR REPLACE FUNCTION app_plataforma_encerrar_sessoes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_qtd integer;
BEGIN
  IF NOT app_plataforma_pode('clinicas.gerenciar') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  DELETE FROM sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  INSERT INTO audit_plataforma (user_id, acao, alvo_tipo, alvo_id, dados)
  VALUES (app_current_user_id(), 'usuario.sessoes_encerradas', 'user', p_user_id::text, jsonb_build_object('sessoes', v_qtd));
  RETURN v_qtd;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_encerrar_sessoes(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_encerrar_sessoes(uuid) TO salus_app;
--> statement-breakpoint

-- 7. Histórico da clínica: ações da equipe Salus sobre ela e eventos do próprio espaço.
CREATE OR REPLACE FUNCTION app_plataforma_historico_clinica(p_tenant_id uuid, p_limite integer)
RETURNS TABLE (origem text, acao text, pessoa text, dados jsonb, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM (
      SELECT 'plataforma'::text, a.acao, u.name, a.dados, a.criado_em
      FROM audit_plataforma a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.alvo_id = p_tenant_id::text
      UNION ALL
      SELECT 'espaco'::text, l.acao, u.name, l.dados, l.criado_em
      FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.tenant_id = p_tenant_id
    ) h
    ORDER BY 5 DESC
    LIMIT greatest(1, least(p_limite, 1000));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_historico_clinica(uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_historico_clinica(uuid, integer) TO salus_app;
--> statement-breakpoint

-- 8. Lista de clínicas com teste, motivo de suspensão e condição negociada.
DROP FUNCTION app_plataforma_clinicas();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_plataforma_clinicas()
RETURNS TABLE (
  id uuid, nome text, status tenant_status, documento text, plano_codigo text, plano_nome text, plano_preco_centavos integer,
  membros_count bigint, salas_count bigint, profissionais_count bigint, criado_em timestamptz,
  teste_ate date, motivo_suspensao text, negociada boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_plataforma_pode('ver') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    t.id, t.nome, t.status, t.documento, p.codigo, p.nome, p.preco_mensal_centavos,
    coalesce((SELECT count(*) FROM memberships m WHERE m.tenant_id = t.id AND m.ativo), 0),
    coalesce((SELECT count(*) FROM salas s WHERE s.tenant_id = t.id AND s.ativo), 0),
    coalesce((SELECT count(*) FROM profissionais pf WHERE pf.tenant_id = t.id AND pf.ativo), 0),
    t.criado_em, t.teste_ate, t.motivo_suspensao,
    EXISTS (SELECT 1 FROM condicoes_comerciais_tenant c WHERE c.tenant_id = t.id)
  FROM tenants t
  JOIN planos_saas p ON p.id = t.plano_id
  ORDER BY t.criado_em DESC;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plataforma_clinicas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plataforma_clinicas() TO salus_app;
