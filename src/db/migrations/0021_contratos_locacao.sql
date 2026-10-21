CREATE TABLE IF NOT EXISTS "contratos_locacao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid DEFAULT app_current_tenant_id() NOT NULL,
  "codigo" text NOT NULL,
  "profissional_id" uuid NOT NULL,
  "sala_id" uuid NOT NULL,
  "status" text DEFAULT 'ativo' NOT NULL,
  "data_inicio" date NOT NULL,
  "data_fim" date,
  "valor_mensal_centavos" integer NOT NULL,
  "dia_vencimento" smallint DEFAULT 10 NOT NULL,
  "cobranca_consulta_tipo" text DEFAULT 'nenhuma' NOT NULL,
  "cobranca_consulta_valor_centavos" integer,
  "cobranca_consulta_percentual_bp" integer,
  "grade_horarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "termos_contrato" text NOT NULL,
  "observacoes" text,
  "criado_por" uuid DEFAULT app_current_user_id(),
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "encerrado_em" timestamp with time zone,
  CONSTRAINT "contratos_locacao_tenant_id_id_key" UNIQUE("tenant_id","id"),
  CONSTRAINT "contratos_locacao_tenant_codigo_key" UNIQUE("tenant_id","codigo"),
  CONSTRAINT "contratos_locacao_status_check" CHECK ("status" IN ('ativo', 'encerrado', 'rascunho')),
  CONSTRAINT "contratos_locacao_dia_vencimento_check" CHECK ("dia_vencimento" BETWEEN 1 AND 31),
  CONSTRAINT "contratos_locacao_valor_check" CHECK ("valor_mensal_centavos" >= 0)
);

DO $$ BEGIN
  ALTER TABLE "contratos_locacao" ADD CONSTRAINT "contratos_locacao_tenant_sala_fk" FOREIGN KEY ("tenant_id","sala_id") REFERENCES "salas"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "contratos_locacao" ADD CONSTRAINT "contratos_locacao_tenant_profissional_fk" FOREIGN KEY ("tenant_id","profissional_id") REFERENCES "profissionais"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "contratos_locacao" ADD CONSTRAINT "contratos_locacao_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Coluna contrato_id em regras_recorrencia
ALTER TABLE "regras_recorrencia" ADD COLUMN IF NOT EXISTS "contrato_id" uuid;
DO $$ BEGIN
  ALTER TABLE "regras_recorrencia" ADD CONSTRAINT "regras_recorrencia_tenant_contrato_fk" FOREIGN KEY ("tenant_id","contrato_id") REFERENCES "contratos_locacao"("tenant_id","id") ON DELETE SET NULL ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- RLS
ALTER TABLE "contratos_locacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contratos_locacao" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "contratos_locacao";
CREATE POLICY "tenant_isolation" ON "contratos_locacao"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "contratos_locacao" TO salus_app;
