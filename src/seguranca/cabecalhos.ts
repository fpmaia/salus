// Cabeçalhos de segurança. A CSP usa nonce por requisição (gerado no proxy.ts) com
// 'strict-dynamic': só roda script que o próprio Next.js marcou com o nonce, ou que ele carregou.

/** Turnstile (captcha da Cloudflare): script, iframe do desafio e verificação. */
const TURNSTILE = "https://challenges.cloudflare.com";

export function politicaDeConteudo(nonce: string, opcoes: { dev: boolean; https: boolean }): string {
  const diretivas = [
    "default-src 'self'",
    // Em dev o React usa eval para reconstruir stacks de erro.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opcoes.dev ? " 'unsafe-eval'" : ""}`,
    // Atributos style="" (posicionamento na grade, barras de ocupação) não aceitam nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${TURNSTILE}${opcoes.dev ? " ws: wss:" : ""}`,
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Painel e prontuário nunca dentro de iframe de terceiros (clickjacking).
    "frame-ancestors 'none'",
  ];
  if (opcoes.https) diretivas.push("upgrade-insecure-requests");
  return diretivas.join("; ");
}

/** Cabeçalhos fixos, para todas as rotas (inclusive /api). Avaliados no build (next.config). */
export function cabecalhosFixos(): { key: string; value: string }[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * HSTS: só sobre HTTPS (e só é honrado assim); 2 anos (sem preload: entrar na lista do navegador é decisão do domínio). Sai do proxy.ts
 * porque depende do env de runtime (o build do Docker não conhece a URL de produção).
 */
export const HSTS = "max-age=63072000; includeSubDomains";

/** O app é servido por HTTPS? (APP_URL/BETTER_AUTH_URL de produção) */
export function servidoPorHttps(): boolean {
  return (process.env.BETTER_AUTH_URL || process.env.APP_URL || "").startsWith("https://");
}
