-- Contrato unificado: o contrato do profissional É o acordo financeiro (versionado por vigência).
-- Ganha código, prazo de cancelamento próprio, multa de turno fixo, termos e grade fixa
-- (regras_recorrencia.acordo_id). "Sala fixa" vira mensalidade sem limite de horas. Os contratos
-- de locação (módulo desligado, só em bancos de desenvolvimento) migram para dentro e saem.
ALTER TYPE "public"."tipo_lancamento" ADD VALUE IF NOT EXISTS 'multa_cancelamento' BEFORE 'mensalidade';
--> statement-breakpoint
ALTER TABLE "acordos_financeiros"
  ADD COLUMN "codigo" text,
  ADD COLUMN "prazo_cancelamento_horas" integer DEFAULT 24 NOT NULL,
  ADD COLUMN "multa_cancelamento_reserva_bp" integer,
  ADD COLUMN "termos" text,
  ADD COLUMN "observacoes" text;
--> statement-breakpoint
-- O prazo de cada contrato herda o padrão que o espaço usava (tenant_settings).
UPDATE "acordos_financeiros" a
  SET "prazo_cancelamento_horas" = least(s."antecedencia_cancelamento_horas", 720)
  FROM "tenant_settings" s
  WHERE s."tenant_id" = a."tenant_id";
--> statement-breakpoint
WITH numerados AS (
  SELECT id,
    extract(year from vigente_de)::int AS ano,
    row_number() OVER (PARTITION BY tenant_id, extract(year from vigente_de) ORDER BY vigente_de, criado_em, id) AS n
  FROM "acordos_financeiros"
)
UPDATE "acordos_financeiros" a
  SET "codigo" = 'CTR-' || n.ano || '-' || lpad(n.n::text, 4, '0')
  FROM numerados n
  WHERE n.id = a.id;
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" DROP CONSTRAINT "acordos_modelo_check";
--> statement-breakpoint
UPDATE "acordos_financeiros"
  SET "modelo" = 'mensalidade', "horas_incluidas" = NULL, "valor_hora_centavos" = coalesce("valor_hora_centavos", 0)
  WHERE "modelo"::text = 'sala_fixa';
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_tenant_id_id_key" UNIQUE ("tenant_id", "id");
--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD COLUMN "acordo_id" uuid;
--> statement-breakpoint
-- Contratos de locação → contratos (mesmo id), quando não sobrepõem outro contrato do profissional.
INSERT INTO "acordos_financeiros" (
  "id", "tenant_id", "codigo", "profissional_id", "sala_id", "modelo", "fluxo_recebimento",
  "valor_hora_centavos", "valor_consulta_centavos", "percentual_bp", "mensalidade_centavos", "horas_incluidas",
  "regra_falta", "prazo_cancelamento_horas", "termos", "observacoes", "vigente_de", "vigente_ate", "criado_por", "criado_em"
)
SELECT c."id", c."tenant_id", c."codigo" || 'L', c."profissional_id", c."sala_id", 'mensalidade', 'direto',
  0,
  CASE WHEN c."cobranca_consulta_tipo" = 'fixo' THEN c."cobranca_consulta_valor_centavos" END,
  CASE WHEN c."cobranca_consulta_tipo" = 'percentual' THEN c."cobranca_consulta_percentual_bp" END,
  c."valor_mensal_centavos", NULL,
  'isenta', coalesce(least(s."antecedencia_cancelamento_horas", 720), 24), c."termos_contrato", c."observacoes",
  c."data_inicio", coalesce(c."data_fim", CASE WHEN c."status" = 'encerrado' THEN c."encerrado_em"::date END),
  c."criado_por", c."criado_em"
FROM "contratos_locacao" c
LEFT JOIN "tenant_settings" s ON s."tenant_id" = c."tenant_id"
WHERE c."status" <> 'rascunho'
  AND c."valor_mensal_centavos" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "acordos_financeiros" a
    WHERE a."tenant_id" = c."tenant_id" AND a."profissional_id" = c."profissional_id"
      AND daterange(a."vigente_de", a."vigente_ate", '[]')
        && daterange(c."data_inicio", coalesce(c."data_fim", CASE WHEN c."status" = 'encerrado' THEN c."encerrado_em"::date END), '[]')
  );
--> statement-breakpoint
UPDATE "regras_recorrencia" r
  SET "acordo_id" = r."contrato_id"
  WHERE r."contrato_id" IN (SELECT id FROM "acordos_financeiros");
--> statement-breakpoint
ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_acordo_fk"
  FOREIGN KEY ("tenant_id", "acordo_id") REFERENCES "acordos_financeiros" ("tenant_id", "id");
--> statement-breakpoint
ALTER TABLE "regras_recorrencia" DROP CONSTRAINT IF EXISTS "regras_recorrencia_tenant_id_contrato_id_contratos_locacao_tenant_id_id_fk";
--> statement-breakpoint
ALTER TABLE "regras_recorrencia" DROP COLUMN "contrato_id";
--> statement-breakpoint
DROP TABLE "contratos_locacao" CASCADE;
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ALTER COLUMN "codigo" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_financeiros_tenant_codigo_key" UNIQUE ("tenant_id", "codigo");
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_prazo_check" CHECK ("prazo_cancelamento_horas" between 0 and 720);
--> statement-breakpoint
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_multa_check"
  CHECK ("multa_cancelamento_reserva_bp" is null or "multa_cancelamento_reserva_bp" between 1 and 10000);
--> statement-breakpoint
-- 'sala_fixa' continua no enum (Postgres não remove valores), mas nenhum contrato pode usá-lo.
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_modelo_check" CHECK (coalesce(case "modelo"
        when 'hora' then "valor_hora_centavos" > 0
        when 'consulta' then "valor_consulta_centavos" > 0
        when 'percentual' then "percentual_bp" between 1 and 10000
        when 'mensalidade' then "mensalidade_centavos" > 0 and ("horas_incluidas" is null or "horas_incluidas" >= 0) and "valor_hora_centavos" >= 0
      end, false));
--> statement-breakpoint
-- Um contrato vigente por vez para cada profissional (antes só o serviço garantia).
ALTER TABLE "acordos_financeiros" ADD CONSTRAINT "acordos_sem_sobreposicao"
  EXCLUDE USING gist ("tenant_id" WITH =, "profissional_id" WITH =, daterange("vigente_de", "vigente_ate", '[]') WITH &&);
--> statement-breakpoint
-- Quem cancelou: o tardio pelo espaço não cobra; só o profissional gera multa de turno fixo.
-- Cancelamentos antigos ficam sem autor (null), com a regra de antes (cobra).
ALTER TABLE "agendamentos" ADD COLUMN "cancelado_por" text
  CONSTRAINT "agendamentos_cancelado_por_check" CHECK ("cancelado_por" in ('paciente', 'profissional', 'espaco'));
--> statement-breakpoint
ALTER TABLE "reservas_sala" ADD COLUMN "cancelada_por" text
  CONSTRAINT "reservas_cancelada_por_check" CHECK ("cancelada_por" in ('profissional', 'espaco'));
--> statement-breakpoint
-- O preço é do contrato: as salas não têm mais "valor de referência".
ALTER TABLE "salas"
  DROP COLUMN "valor_mensal_centavos",
  DROP COLUMN "cobranca_consulta_tipo",
  DROP COLUMN "cobranca_consulta_valor_centavos",
  DROP COLUMN "cobranca_consulta_percentual_bp";
