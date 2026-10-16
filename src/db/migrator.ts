import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export const PASTA_MIGRATIONS = path.resolve(process.cwd(), "src/db/migrations");

/** Aplica as migrations pendentes. Deve receber a URL do papel dono (salus_owner). */
export async function aplicarMigrations(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: PASTA_MIGRATIONS });
  } finally {
    await pool.end();
  }
}
