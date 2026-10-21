import { headers } from "next/headers";

/** Base pública do app para montar links (BETTER_AUTH_URL, APP_URL ou o host da requisição). */
export async function urlPublica(): Promise<string> {
  const configurada = process.env.BETTER_AUTH_URL || process.env.APP_URL;
  if (configurada) return configurada.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
