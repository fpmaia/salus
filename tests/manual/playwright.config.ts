import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Telas e animações do manual do usuário (`npm run manual:telas`): mesmo servidor do E2E, outro
// seed. Saem em public/manual/telas/ e public/manual/animacoes/ (versionadas; o /manual usa).
// O E2E tem um servidor só (não uma lista); aqui ele roda a partir da raiz do projeto.
const servidor = base.webServer as Exclude<typeof base.webServer, unknown[] | undefined>;

export default defineConfig({
  ...base,
  testDir: ".",
  // Ordem alfabética: capturas antes dos vídeos (os roteiros mudam os dados do seed).
  testMatch: ["capturas.spec.ts", "videos.spec.ts"],
  globalSetup: "./seed.ts",
  retries: 0,
  webServer: { ...servidor, cwd: path.resolve(__dirname, "../..") },
  reporter: "list",
});
