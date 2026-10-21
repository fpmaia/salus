CREATE TABLE "aceites_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"versao" text NOT NULL,
	"origem" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aceites_documentos_user_versao_key" UNIQUE("user_id","versao")
);
--> statement-breakpoint
ALTER TABLE "aceites_documentos" ADD CONSTRAINT "aceites_documentos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Prova de consentimento: o app só insere e lê (sem UPDATE/DELETE).
GRANT SELECT, INSERT ON aceites_documentos TO salus_app;
