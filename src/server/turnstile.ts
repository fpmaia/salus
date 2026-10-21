// Cloudflare Turnstile (captcha) nas páginas públicas. Sem TURNSTILE_SECRET_KEY fica desligado
// (dev/testes); em produção o boot exige as chaves (src/env.ts), salvo ambiente de demonstração.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Chave pública do widget, ou null se o captcha estiver desligado. */
export function chaveSiteTurnstile(): string | null {
  return (process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY) || null;
}

export function turnstileAtivo(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** Confere o token do widget na Cloudflare. Falha fechada: erro de rede = recusado. */
export async function verificarTurnstile(token: string, ip: string | null, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return true;
  if (!token) return false;
  const corpo = new URLSearchParams({ secret: segredo, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const resposta = await fetchFn(SITEVERIFY, { method: "POST", body: corpo, signal: AbortSignal.timeout(10_000) });
    if (!resposta.ok) return false;
    const dados = (await resposta.json()) as { success?: boolean };
    return dados.success === true;
  } catch {
    return false;
  }
}
