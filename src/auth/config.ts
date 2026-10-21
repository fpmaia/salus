import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, captcha } from "better-auth/plugins";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { VERSAO_DOCUMENTOS } from "../legal/documentos";
import { cabecalhosDeIp, ipDoCliente } from "../seguranca/ip";
import { registrarAceite } from "../server/aceites";
import { emailDoAmbiente, type MensagemEmail } from "../server/email";
import { emailRedefinirSenha, emailVerificacao } from "../server/email-modelos";

/** Versão dos Termos/Política aceita na tela de cadastro (src/legal/documentos.ts). */
const CABECALHO_ACEITE = "x-aceite-documentos";

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
    // Cadastro pela tela exige o aceite da versão vigente dos Termos e da Política (LGPD);
    // chamadas internas (seed, scripts) não passam por aqui e registram o aceite por conta própria.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" && ctx.request && ctx.request.headers.get(CABECALHO_ACEITE) !== VERSAO_DOCUMENTOS) {
          throw new APIError("BAD_REQUEST", { message: "Aceite os Termos de Uso e a Política de Privacidade para criar a conta" });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
            if (ctx?.request && ctx.request.headers.get(CABECALHO_ACEITE) === VERSAO_DOCUMENTOS) {
              await registrarAceite(
                user.id,
                "cadastro",
                { ip: ipDoCliente(ctx.request.headers), userAgent: ctx.request.headers.get("user-agent") },
                database,
              );
            }
          },
        },
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
      // Captcha (Turnstile) onde robô causa estrago: criar contas e disparar e-mails de senha.
      // O login fica só com rate limit, para não pôr atrito em todo acesso.
      ...(process.env.TURNSTILE_SECRET_KEY
        ? [captcha({ provider: "cloudflare-turnstile", secretKey: process.env.TURNSTILE_SECRET_KEY, endpoints: ["/sign-up/email", "/request-password-reset"] })]
        : []),
    ],
    // Em produção (padrão do Better Auth), contado no Postgres: vale entre processos e reinícios.
    rateLimit: {
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: Number(process.env.AUTH_LOGIN_MAX_POR_MINUTO) || 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/send-verification-email": { window: 3600, max: 5 },
        "/reset-password": { window: 3600, max: 10 },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production",
      // O mesmo cabeçalho de IP do rate limit das páginas públicas (src/seguranca/ip.ts).
      ipAddress: { ipAddressHeaders: cabecalhosDeIp() },
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
