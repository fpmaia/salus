import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Database } from "../db/client";
import * as schema from "../db/schema";

/** Opções do Better Auth compartilhadas entre o app Next.js e scripts (seed). */
export function opcoesAuth(database: Database) {
  return {
    appName: "Salus",
    database: drizzleAdapter(database, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        // Em desenvolvimento/homologação loga no console; se houver SMTP/Resend no futuro, envia e-mail.
        console.log(`[SALUS RESET SENHA] Para: ${user.email} -> URL: ${url}`);
      },
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRole: ["superadmin"],
      }),
    ],
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    trustedOrigins: async (request?: Request) => {
      const configuradas = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const origens = [
        process.env.BETTER_AUTH_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        ...configuradas,
      ].filter((u): u is string => Boolean(u));

      if (process.env.NODE_ENV !== "production" && request) {
        const origin = request.headers.get("origin");
        const host = request.headers.get("host") || request.headers.get("x-forwarded-host");
        const candidato = origin || (host ? `http://${host}` : null);

        if (candidato) {
          const privadoRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
          if (privadoRegex.test(candidato)) {
            origens.push(candidato);
          }
        }
      }

      return Array.from(new Set(origens));
    },
  } satisfies BetterAuthOptions;
}
