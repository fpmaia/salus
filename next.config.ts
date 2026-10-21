import type { NextConfig } from "next";
import { cabecalhosFixos } from "./src/seguranca/cabecalhos";

const nextConfig: NextConfig = {
  // E2E local roda num distDir próprio (ver playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Imagem Docker enxuta (ver Dockerfile, alvo "runner").
  output: "standalone",
  // pg e pg-boss usam APIs do Node; não precisam ser empacotados.
  serverExternalPackages: ["pg", "pg-boss", "@sentry/node"],
  poweredByHeader: false,
  // A CSP (com nonce) sai do proxy.ts; aqui vão os cabeçalhos fixos, para todas as rotas.
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosFixos() }];
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(process.env.ALLOWED_DEV_ORIGINS
      ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
      : ["192.168.0.6"]),
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
