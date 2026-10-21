import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { HSTS, politicaDeConteudo, servidoPorHttps } from "./src/seguranca/cabecalhos";

const PROTEGIDAS = ["/painel", "/onboarding", "/plataforma"];

export function proxy(request: NextRequest) {
  // Checagem otimista (só presença do cookie). A validação real da sessão e da
  // membership acontece no servidor, em src/auth/sessao.ts.
  const { pathname } = request.nextUrl;
  if (PROTEGIDAS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/entrar", request.url));
  }

  // CSP com nonce novo a cada requisição; o Next.js aplica o nonce aos próprios scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = servidoPorHttps();
  const csp = politicaDeConteudo(nonce, { dev: process.env.NODE_ENV === "development", https });
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("Content-Security-Policy", csp);
  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set("Content-Security-Policy", csp);
  if (https) resposta.headers.set("Strict-Transport-Security", HSTS);
  return resposta;
}

export const config = {
  matcher: [
    {
      // Páginas: fora API, arquivos estáticos e prefetch (não precisam de CSP).
      source: "/((?!api|_next/static|_next/image|favicon.ico|images/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
