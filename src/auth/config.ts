import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "../db/client";
import * as schema from "../db/schema";

/** Opções do Better Auth compartilhadas entre o app Next.js e scripts (seed). */
export function opcoesAuth(database: Database) {
  return {
    appName: "Salus",
    database: drizzleAdapter(database, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    advanced: { database: { generateId: "uuid" } },
  } satisfies BetterAuthOptions;
}
