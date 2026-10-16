-- Agendamento online: a página pública só conhece o slug. A função (dona das tabelas)
-- resolve o tenant e o profissional quando o agendamento online está ativo; o resto
-- da operação roda com a RLS normal, dentro do contexto do tenant (withSistema).
CREATE FUNCTION app_profissional_publico(p_slug text)
  RETURNS TABLE (tenant_id uuid, profissional_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT p.tenant_id, p.id
    FROM profissionais p
    JOIN tenants t ON t.id = p.tenant_id
    WHERE p.slug_publico = p_slug
      AND p.agendamento_online
      AND p.ativo
      AND t.status = 'ativo'
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_profissional_publico(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_profissional_publico(text) TO salus_app;
