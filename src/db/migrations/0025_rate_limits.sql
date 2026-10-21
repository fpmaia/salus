-- Rate limit persistente (Better Auth com storage "database" e endpoints públicos do Salus).
-- Sem tenant_id: os contadores são por IP/rota, fora da RLS.
-- Obs.: o snapshot desta migration também absorve as mudanças das migrations manuais 0019–0023,
-- que não tinham atualizado o snapshot do drizzle.
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO salus_app;
