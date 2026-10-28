ALTER TYPE "public"."tipo_registro_clinico" ADD VALUE 'documento';--> statement-breakpoint

-- Adendo também corrige/complementa um documento finalizado (relatório, laudo, declaração).
CREATE OR REPLACE FUNCTION app_registro_clinico_adendo() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.adendo_de IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM registros_clinicos o
      WHERE o.id = NEW.adendo_de AND o.tenant_id = NEW.tenant_id
        AND o.paciente_id = NEW.paciente_id AND o.profissional_id = NEW.profissional_id
        AND o.status = 'finalizado' AND o.tipo::text IN ('evolucao', 'documento')
    ) THEN
      RAISE EXCEPTION 'prontuario.adendo_invalido';
    END IF;
    RETURN NEW;
  END
  $$;
