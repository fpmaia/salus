import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";
import { definirServico, log } from "./log";

// Erros e alertas: sempre no log estruturado e, com SENTRY_DSN, também no Sentry.
// Dado de saúde não sai do servidor: o evento vai sem corpo, cookies, cabeçalhos nem query,
// e o usuário só pelo id.

let ativo = false;

/** Remove do evento tudo o que pode carregar dado pessoal ou de saúde. */
export function limparEvento<T extends ErrorEvent>(evento: T): T {
  if (evento.request) {
    delete evento.request.data;
    delete evento.request.cookies;
    delete evento.request.headers;
    delete evento.request.query_string;
    // O path real pode ter token (/c/<token>) ou ids: fica só o método.
    delete evento.request.url;
  }
  if (evento.user) evento.user = evento.user.id ? { id: evento.user.id } : undefined;
  delete evento.breadcrumbs;
  return evento;
}

export function iniciarMonitoramento(servico: "app" | "worker") {
  definirServico(servico);
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || ativo) return;
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.SALUS_VERSAO,
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    // Por padrão o SDK coleta cookies, cabeçalhos, corpos e query: tudo desligado aqui.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    beforeSend: (evento) => limparEvento(evento),
    initialScope: { tags: { servico } },
  });
  ativo = true;
  log.info("monitoramento ativo (Sentry)");
}

type Contexto = { tags?: Record<string, string | undefined>; extra?: Record<string, unknown> };

function semVazios(tags: Contexto["tags"]): Record<string, string> | undefined {
  if (!tags) return undefined;
  return Object.fromEntries(Object.entries(tags).filter((e): e is [string, string] => Boolean(e[1])));
}

/** Erro inesperado: log + Sentry. */
export function reportarErro(erro: unknown, mensagem: string, contexto: Contexto = {}) {
  log.error(mensagem, { ...contexto.tags, ...contexto.extra, erro });
  if (ativo) Sentry.captureException(erro, { tags: semVazios(contexto.tags), extra: { mensagem, ...contexto.extra } });
}

/**
 * Situação que pede atenção humana (fila parada, mensagens falhando). Agrupada no Sentry pela
 * chave, para a regra de alerta notificar uma vez por problema.
 */
export function reportarAlerta(chave: string, mensagem: string, contexto: Contexto = {}) {
  log.warn(mensagem, { alerta: chave, ...contexto.tags, ...contexto.extra });
  if (ativo) {
    Sentry.captureMessage(mensagem, { level: "warning", fingerprint: ["alerta", chave], tags: { alerta: chave, ...semVazios(contexto.tags) }, extra: contexto.extra });
  }
}

/** Envia o que estiver pendente antes de o processo sair. */
export async function descarregarMonitoramento() {
  if (ativo) await Sentry.flush(2000);
}
