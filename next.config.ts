import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker enxuta (ver Dockerfile, alvo "runner").
  output: "standalone",
  // pg e pg-boss usam APIs do Node; não precisam ser empacotados.
  serverExternalPackages: ["pg", "pg-boss"],
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
