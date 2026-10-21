import { and, eq } from "drizzle-orm";
import { getDb, type Database } from "../db/client";
import { aceitesDocumentos } from "../db/schema";
import { VERSAO_DOCUMENTOS } from "../legal/documentos";

// Aceite versionado dos Termos de Uso e da Política de Privacidade. Mudou a versão: todo usuário
// aceita de novo no próximo acesso (portão em src/auth/sessao.ts).

export type OrigemAceite = "cadastro" | "reaceite" | "script";

export async function aceiteVigente(userId: string, database: Database = getDb()): Promise<boolean> {
  const [linha] = await database
    .select({ id: aceitesDocumentos.id })
    .from(aceitesDocumentos)
    .where(and(eq(aceitesDocumentos.userId, userId), eq(aceitesDocumentos.versao, VERSAO_DOCUMENTOS)))
    .limit(1);
  return Boolean(linha);
}

export async function registrarAceite(
  userId: string,
  origem: OrigemAceite,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
  database: Database = getDb(),
) {
  await database
    .insert(aceitesDocumentos)
    .values({ userId, versao: VERSAO_DOCUMENTOS, origem, ip: contexto.ip ?? null, userAgent: contexto.userAgent?.slice(0, 300) ?? null })
    .onConflictDoNothing();
}
