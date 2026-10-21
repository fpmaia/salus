ALTER TABLE "salas" ADD COLUMN IF NOT EXISTS "valor_mensal_centavos" integer;
ALTER TABLE "salas" ADD COLUMN IF NOT EXISTS "cobranca_consulta_tipo" text DEFAULT 'nenhuma' NOT NULL;
ALTER TABLE "salas" ADD COLUMN IF NOT EXISTS "cobranca_consulta_valor_centavos" integer;
ALTER TABLE "salas" ADD COLUMN IF NOT EXISTS "cobranca_consulta_percentual_bp" integer;

ALTER TABLE "acordos_financeiros" ADD COLUMN IF NOT EXISTS "sala_id" uuid;

DO $$ BEGIN
  ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_tenant_id_sala_id_salas_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "salas"("tenant_id","id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "acordos_financeiros" DROP CONSTRAINT IF EXISTS "acordos_modelo_check";
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_modelo_check" CHECK (coalesce(case "acordos_financeiros"."modelo"::text
  when 'hora' then "acordos_financeiros"."valor_hora_centavos" > 0
  when 'consulta' then "acordos_financeiros"."valor_consulta_centavos" > 0
  when 'percentual' then "acordos_financeiros"."percentual_bp" between 1 and 10000
  when 'mensalidade' then "acordos_financeiros"."mensalidade_centavos" > 0 and "acordos_financeiros"."horas_incluidas" >= 0 and "acordos_financeiros"."valor_hora_centavos" >= 0
  when 'sala_fixa' then "acordos_financeiros"."mensalidade_centavos" > 0 and "acordos_financeiros"."sala_id" is not null
end, false));
