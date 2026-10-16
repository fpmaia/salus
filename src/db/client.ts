import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDb(
  connectionString: string,
  poolConfig: Omit<PoolConfig, "connectionString"> = {},
): Database {
  return drizzle(new Pool({ connectionString, ...poolConfig }), { schema });
}

// Conexão do papel da aplicação (salus_app, sujeito à RLS). Criada sob demanda para
// que o build do Next.js não exija DATABASE_URL; reaproveitada entre hot reloads.
const globalParaDb = globalThis as unknown as { salusDb?: Database };

export function getDb(): Database {
  if (!globalParaDb.salusDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    globalParaDb.salusDb = createDb(url);
  }
  return globalParaDb.salusDb;
}
