import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb, type Database } from "../db/client";
import { notificacoesOutbox } from "../db/schema";
import { listarTenantsAtivos, withSistema } from "../db/tenant";
import { reportarAlerta } from "../observabilidade/monitoramento";
import { emailDoAmbiente, type ProvedorEmail } from "./email";
import { emailAlerta } from "./email-modelos";
import { consumirLimite } from "./limite-taxa";

// Alertas operacionais: sempre no log e no Sentry (agrupados pela chave) e, com ALERTAS_EMAIL,
// por e-mail, no máximo um por chave a cada 6 h. Só ids e contagens: nada de dado pessoal.

const JANELA_EMAIL_SEGUNDOS = 6 * 3600;
const ATRASO_TOLERADO_MS = 30 * 60_000;

export async function notificarAlerta(
  chave: string,
  mensagem: string,
  detalhes: Record<string, unknown> = {},
  opcoes: { agora?: Date; email?: ProvedorEmail; database?: Database } = {},
): Promise<{ emailEnviado: boolean }> {
  reportarAlerta(chave, mensagem, { extra: detalhes });
  const destino = process.env.ALERTAS_EMAIL;
  if (!destino) return { emailEnviado: false };
  const agora = opcoes.agora ?? new Date();
  const dentroDoLimite = await consumirLimite(`alerta:${chave}`, { janelaSegundos: JANELA_EMAIL_SEGUNDOS, max: 1 }, agora.getTime(), opcoes.database);
  if (!dentroDoLimite) return { emailEnviado: false };
  try {
    await (opcoes.email ?? emailDoAmbiente()).enviar(emailAlerta(destino, { chave, mensagem, detalhes, quando: agora }));
    return { emailEnviado: true };
  } catch {
    // O alerta já está no log e no Sentry; uma falha de e-mail não pode derrubar o job.
    return { emailEnviado: false };
  }
}

export type SaudeOutbox = { tenantId: string; falhas24h: number; atrasadas: number };

/** Por espaço: mensagens que falharam de vez nas últimas 24 h e as paradas além do horário. */
export async function saudeDaOutbox(agora = new Date(), database: Database = getDb()): Promise<SaudeOutbox[]> {
  const resultado: SaudeOutbox[] = [];
  for (const tenantId of await listarTenantsAtivos(database)) {
    const linha = await withSistema(
      tenantId,
      async (tx) => {
        const [falhas] = await tx
          .select({ total: count() })
          .from(notificacoesOutbox)
          .where(and(eq(notificacoesOutbox.status, "falhou"), gt(notificacoesOutbox.atualizadoEm, new Date(agora.getTime() - 86_400_000))));
        const [atrasadas] = await tx
          .select({ total: count() })
          .from(notificacoesOutbox)
          .where(
            and(
              inArray(notificacoesOutbox.status, ["pendente", "enviando"]),
              lt(notificacoesOutbox.agendarPara, new Date(agora.getTime() - ATRASO_TOLERADO_MS)),
            ),
          );
        return { tenantId, falhas24h: falhas.total, atrasadas: atrasadas.total };
      },
      database,
    );
    if (linha.falhas24h || linha.atrasadas) resultado.push(linha);
  }
  return resultado;
}

/** Job do worker: confere a outbox de todos os espaços e alerta o que pede atenção. */
export async function verificarAlertas(opcoes: { agora?: Date; email?: ProvedorEmail; database?: Database } = {}) {
  const agora = opcoes.agora ?? new Date();
  const problemas = await saudeDaOutbox(agora, opcoes.database);
  const falhas = problemas.filter((p) => p.falhas24h > 0);
  const atrasos = problemas.filter((p) => p.atrasadas > 0);
  if (falhas.length) {
    await notificarAlerta(
      "outbox.falhas",
      `Lembretes que falharam de vez nas últimas 24 h em ${falhas.length} espaço(s)`,
      { espacos: falhas.map((p) => ({ tenantId: p.tenantId, falhas: p.falhas24h })) },
      opcoes,
    );
  }
  if (atrasos.length) {
    await notificarAlerta(
      "outbox.atrasada",
      `Lembretes parados há mais de 30 min em ${atrasos.length} espaço(s): o worker ou o WhatsApp pode estar fora`,
      { espacos: atrasos.map((p) => ({ tenantId: p.tenantId, atrasadas: p.atrasadas })) },
      opcoes,
    );
  }
  return { espacosComFalha: falhas.length, espacosComAtraso: atrasos.length };
}
