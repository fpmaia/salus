import { sql } from "drizzle-orm";
import { getDb, type Database } from "../db/client";
import { rateLimits } from "../db/schema";
import { ErroNegocio } from "./erros";

// Rate limit dos endpoints públicos (agendamento online, link do paciente), na mesma tabela do
// Better Auth (chaves com prefixo "salus:"). Janela fixa, contada num único UPSERT atômico.

export type RegraLimite = { janelaSegundos: number; max: number };

export const LIMITES = {
  agendarPorIp: { janelaSegundos: 3600, max: 10 },
  agendarPorPagina: { janelaSegundos: 3600, max: 40 },
  linkPacientePorIp: { janelaSegundos: 600, max: 30 },
} satisfies Record<string, RegraLimite>;

/** Conta mais uma tentativa e devolve se ainda está dentro do limite. */
export async function consumirLimite(
  chave: string,
  regra: RegraLimite,
  agora = Date.now(),
  database: Database = getDb(),
): Promise<boolean> {
  const k = `salus:${chave}`;
  const inicioDaJanela = agora - regra.janelaSegundos * 1000;
  const [linha] = await database
    .insert(rateLimits)
    .values({ key: k, count: 1, lastRequest: agora })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // last_request guarda o início da janela atual.
        count: sql`case when ${rateLimits.lastRequest} < ${inicioDaJanela} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${rateLimits.lastRequest} < ${inicioDaJanela} then ${agora} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return linha.count <= regra.max;
}

/** Como consumirLimite, mas recusa com mensagem para o usuário. */
export async function limitarTaxa(chave: string, regra: RegraLimite, agora = Date.now(), database?: Database) {
  if (!(await consumirLimite(chave, regra, agora, database))) {
    throw new ErroNegocio("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
  }
}

/** Limpeza diária (worker): contadores parados há mais de 1 dia. */
export async function limparLimitesAntigos(agora = Date.now(), database: Database = getDb()): Promise<number> {
  const apagados = await database
    .delete(rateLimits)
    .where(sql`${rateLimits.lastRequest} < ${agora - 86_400_000}`)
    .returning({ id: rateLimits.id });
  return apagados.length;
}
