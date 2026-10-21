ALTER TABLE "pacientes" ADD COLUMN "anonimizado_em" timestamp with time zone;--> statement-breakpoint
-- O admin não lê o prontuário (RLS por profissional), mas a anonimização precisa saber se ele
-- existe: prontuário tem guarda legal de 20 anos (CFM) e impede a anonimização do cadastro.
-- Só responde sim/não, e só para o tenant do contexto.
CREATE FUNCTION app_paciente_tem_prontuario(p_paciente uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM registros_clinicos
      WHERE paciente_id = p_paciente AND tenant_id = app_current_tenant_id()
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_paciente_tem_prontuario(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_paciente_tem_prontuario(uuid) TO salus_app;
--> statement-breakpoint
-- Anonimização é irreversível: depois dela, o cadastro não muda mais (impede reidentificação).
CREATE FUNCTION app_paciente_anonimizado_imutavel() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.anonimizado_em IS NOT NULL THEN
      RAISE EXCEPTION 'paciente.anonimizado' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END;
  $$;
--> statement-breakpoint
CREATE TRIGGER pacientes_anonimizado_imutavel BEFORE UPDATE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION app_paciente_anonimizado_imutavel();
