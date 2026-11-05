ALTER TABLE "pacientes" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "pacientes" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "unidades" ADD COLUMN "uf" text;--> statement-breakpoint
-- Unidades já cadastradas: o texto livre vira o logradouro (o admin completa CEP e o resto ao editar).
UPDATE "unidades" SET "logradouro" = "endereco" WHERE "endereco" IS NOT NULL AND "logradouro" IS NULL;
