import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E local roda num distDir próprio (ver playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Imagem Docker enxuta (ver Dockerfile, alvo "runner").
  output: "standalone",
  // pg e pg-boss usam APIs do Node; não precisam ser empacotados.
  serverExternalPackages: ["pg", "pg-boss"],
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
