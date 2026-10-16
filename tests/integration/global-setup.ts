import { Client } from "pg";
import { aplicarMigrations } from "../../src/db/migrator";
import { TEST_DATABASE_MIGRATOR_URL } from "./env";

// Recria o schema do banco de testes do zero e aplica todas as migrations,
// garantindo que elas funcionam a partir de um banco vazio.
export default async function setup() {
  const client = new Client({ connectionString: TEST_DATABASE_MIGRATOR_URL });
  try {
    await client.connect();
  } catch (erro) {
    throw new Error(
      `Não foi possível conectar ao Postgres de testes. Suba o banco com "npm run db:up".\n${erro}`,
    );
  }
  try {
    await client.query(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    `);
  } finally {
    await client.end();
  }
  await aplicarMigrations(TEST_DATABASE_MIGRATOR_URL);
}
