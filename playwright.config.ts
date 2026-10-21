import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente (CI)
}

// E2E dos fluxos críticos contra o app de verdade (Next.js + Postgres com RLS).
// Usa o banco salus_test, recriado pelo global-setup: não rode junto com o `npm test`.
const PORTA = 3100;
const URL = `http://localhost:${PORTA}`;
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://salus_app:salus_app_dev@localhost:5433/salus_test";
process.env.BETTER_AUTH_SECRET ??= "segredo-e2e-apenas-para-testes-locais-0123456789";
// CI roda `next start` (NODE_ENV=production): o boot exige segredos próprios (src/env.ts).
const LINKS_SECRET = process.env.LINKS_SECRET || "links-e2e-apenas-para-testes-locais-0123456789";
const SECRETS_KEY = process.env.SECRETS_KEY || Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI: usa o build de produção do passo anterior. Local: dev server num distDir próprio,
    // para não disputar o .next com um `npm run dev` já aberto.
    command: process.env.CI ? `npx next start -p ${PORTA}` : `npx next dev -p ${PORTA}`,
    url: `${URL}/entrar`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL,
      BETTER_AUTH_URL: URL,
      APP_URL: URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      LINKS_SECRET,
      SECRETS_KEY,
      WHATSAPP_PROVIDER: "console",
      // E-mails só no log: o boot de produção aceita "console" em ambiente de demonstração.
      EMAIL_PROVIDER: "console",
      SALUS_DEMO: "true",
      ASAAS_AMBIENTE: "simulado",
      ...(process.env.CI ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
    },
  },
});
