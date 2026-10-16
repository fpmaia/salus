import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

// Migrations rodam com o papel dono das tabelas, nunca com o papel da aplicação.
// Não use `drizzle-kit push`: as políticas de RLS vivem em migrations SQL customizadas.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_MIGRATOR_URL ?? "" },
  strict: true,
  verbose: true,
});
