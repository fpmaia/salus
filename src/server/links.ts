import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { emProducao, variavel } from "../env";

// Links públicos do paciente (confirmar/cancelar) assinados com HMAC-SHA256.
// Sem estado no banco: o token carrega tenant, agendamento e validade.

const payloadSchema = z.object({
  t: z.uuid(), // tenant
  a: z.uuid(), // agendamento
  e: z.number().int(), // expira (epoch em segundos)
});

export type PayloadLink = { tenantId: string; agendamentoId: string; expiraEm: Date };

function segredo(): string {
  // Só fora de produção cai no BETTER_AUTH_SECRET (ver src/env.ts).
  const valor = variavel("LINKS_SECRET") ?? (emProducao() ? undefined : variavel("BETTER_AUTH_SECRET"));
  if (!valor || valor.length < 16) throw new Error("Defina LINKS_SECRET com ao menos 32 caracteres");
  return valor;
}

function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url");
}

export function gerarTokenAgendamento(tenantId: string, agendamentoId: string, expiraEm: Date): string {
  const corpo = Buffer.from(
    JSON.stringify({ t: tenantId, a: agendamentoId, e: Math.floor(expiraEm.getTime() / 1000) }),
  ).toString("base64url");
  return `${corpo}.${assinar(corpo)}`;
}

/** Valida assinatura e validade. null para token adulterado, malformado ou expirado. */
export function lerTokenAgendamento(token: string, agora = new Date()): PayloadLink | null {
  const [corpo, assinatura, ...resto] = token.split(".");
  if (!corpo || !assinatura || resto.length > 0) return null;
  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const p = payloadSchema.parse(JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")));
    const expiraEm = new Date(p.e * 1000);
    if (expiraEm.getTime() <= agora.getTime()) return null;
    return { tenantId: p.t, agendamentoId: p.a, expiraEm };
  } catch {
    return null;
  }
}

/** URL pública do app (links em mensagens enviadas pelo worker). */
export function urlPublica(): string {
  return (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function linkDoAgendamento(tenantId: string, agendamentoId: string, expiraEm: Date): string {
  return `${urlPublica()}/c/${gerarTokenAgendamento(tenantId, agendamentoId, expiraEm)}`;
}
