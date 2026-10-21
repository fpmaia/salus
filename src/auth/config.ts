import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { emailDoAmbiente, type MensagemEmail } from "../server/email";
import { emailRedefinirSenha, emailVerificacao } from "../server/email-modelos";

/** Falha de envio vai para o log sem o conteúdo (o link carrega o token). */
async function enviarSemVazar(mensagem: MensagemEmail) {
  try {
    await emailDoAmbiente().enviar(mensagem);
  } catch (erro) {
    console.error(`[e-mail] falha ao enviar "${mensagem.assunto}":`, erro instanceof Error ? erro.message : erro);
    throw erro;
  }
}

/** Opções do Better Auth compartilhadas entre o app Next.js e scripts (seed). */
export function opcoesAuth(database: Database) {
  return {
    appName: "Salus",
    database: drizzleAdapter(database, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Sem e-mail confirmado não há sessão: o aceite de convite compara e-mails, e isso só
      // prova algo se o e-mail foi verificado.
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await enviarSemVazar(emailRedefinirSenha(user.email, user.name, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Tentou entrar sem confirmar: reenvia o link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await enviarSemVazar(emailVerificacao(user.email, user.name, url));
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
        // localhost só fora de produção.
        ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"]),
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
