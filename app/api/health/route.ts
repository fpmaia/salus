import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/src/db/client";

// Health check (Caddy, Docker healthcheck, monitor externo). Sem dado sensível: só se o app
// responde e alcança o banco. 503 quando o banco não responde.
export async function GET() {
  await connection();
  const inicio = Date.now();
  let banco = false;
  try {
    await getDb().execute(sql`select 1`);
    banco = true;
  } catch {
    banco = false;
  }
  return Response.json(
    { status: banco ? "ok" : "degradado", banco, latenciaMs: Date.now() - inicio, versao: process.env.SALUS_VERSAO ?? "dev" },
    { status: banco ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
