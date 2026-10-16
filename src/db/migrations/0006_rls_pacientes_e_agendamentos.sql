-- Fase 2: RLS e privilégios de pacientes/agendamentos, conflitos e integridade com a reserva.

-- Conflitos ---------------------------------------------------------------------------
-- Um profissional não atende dois pacientes ao mesmo tempo; um paciente não está em
-- dois atendimentos ao mesmo tempo.
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_sem_sobreposicao_profissional
  EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelado');
--> statement-breakpoint
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_sem_sobreposicao_paciente
  EXCLUDE USING gist (paciente_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelado');
--> statement-breakpoint

-- Agendamento dentro da reserva ---------------------------------------------------------
-- Mesma reserva, mesmo profissional, reserva não cancelada e período contido nela.
-- Erros "agendamento.*" são traduzidos em src/server/agendamentos.ts.
CREATE FUNCTION app_agendamento_dentro_da_reserva() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_reserva reservas_sala%ROWTYPE;
  BEGIN
    IF NEW.status = 'cancelado' THEN
      RETURN NEW;
    END IF;
    SELECT * INTO v_reserva FROM reservas_sala
      WHERE id = NEW.reserva_id AND tenant_id = NEW.tenant_id;
    IF NOT FOUND OR v_reserva.status = 'cancelada' THEN
      RAISE EXCEPTION 'agendamento.reserva_invalida';
    END IF;
    IF v_reserva.profissional_id <> NEW.profissional_id THEN
      RAISE EXCEPTION 'agendamento.profissional_diferente';
    END IF;
    IF NOT (v_reserva.periodo @> NEW.periodo) THEN
      RAISE EXCEPTION 'agendamento.fora_da_reserva';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER agendamentos_dentro_da_reserva
  BEFORE INSERT OR UPDATE OF reserva_id, profissional_id, periodo, status ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION app_agendamento_dentro_da_reserva();
--> statement-breakpoint

-- Reserva com pacientes ativos não pode ser cancelada.
CREATE FUNCTION app_reserva_sem_agendamentos_ativos() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' AND EXISTS (
      SELECT 1 FROM agendamentos a
      WHERE a.reserva_id = NEW.id AND a.tenant_id = NEW.tenant_id
        AND a.status IN ('agendado', 'confirmado', 'presente')
    ) THEN
      RAISE EXCEPTION 'reserva.com_agendamentos';
    END IF;
    RETURN NEW;
  END
  $$;
--> statement-breakpoint
CREATE TRIGGER reservas_sala_sem_agendamentos_ativos
  BEFORE UPDATE OF status ON reservas_sala
  FOR EACH ROW EXECUTE FUNCTION app_reserva_sem_agendamentos_ativos();
--> statement-breakpoint

-- RLS ---------------------------------------------------------------------------------
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pacientes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pacientes
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
-- Sem DELETE: inativação/anonimização em vez de apagar (histórico de atendimentos).
GRANT SELECT, INSERT, UPDATE ON pacientes TO salus_app;
--> statement-breakpoint

ALTER TABLE pacientes_profissionais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pacientes_profissionais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pacientes_profissionais
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON pacientes_profissionais TO salus_app;
--> statement-breakpoint

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agendamentos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON agendamentos
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON agendamentos TO salus_app;
