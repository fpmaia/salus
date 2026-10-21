import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PgBoss from "pg-boss";
import { validarAmbiente } from "../env";
import { log } from "../observabilidade/log";
import { descarregarMonitoramento, iniciarMonitoramento, reportarErro } from "../observabilidade/monitoramento";
import { notificarAlerta, verificarAlertas } from "../server/alertas";
import type { Transaction } from "../db/client";
import { listarTenantsAtivos, withSistema } from "../db/tenant";
import { gerarFaturaDoMes, sincronizarFaturas } from "../server/assinatura";
import { sincronizarCobrancas } from "../server/cobrancas";
import { processarNotasFiscais } from "../server/fiscal";
import { agendarLembretes, processarFila } from "../server/notificacoes";
import { evolutionDoAmbiente } from "../server/evolution";
import { providerDoAmbiente } from "../server/provider";
import { providerDoTenant } from "../server/whatsapp";
import { limparLimitesAntigos } from "../server/limite-taxa";
import { avisarDatasNaoReservadas } from "../server/datas-nao-reservadas";
import { concluirReservasPassadas, materializarRecorrencias } from "../server/reservas";

// Worker separado (pg-boss). Cada job percorre os tenants ativos e processa um por vez,
// dentro do contexto do próprio tenant (withSistema), sujeito à RLS como o app.

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

validarAmbiente("worker");
iniciarMonitoramento("worker");

// Lido pelo healthcheck do docker-compose.prod.yml.
const ARQUIVO_HEARTBEAT = process.env.WORKER_HEARTBEAT ?? path.join(tmpdir(), "salus-worker-vivo");

type Job = {
  fila: string;
  cron: string;
  /** Roda dentro de withSistema (uma transação por tenant)… */
  executar?: (tx: Transaction, agora: Date) => Promise<unknown>;
  /** …ou gerencia as próprias transações (ex.: envio, que chama um serviço externo)… */
  porTenant?: (tenantId: string, agora: Date) => Promise<unknown>;
  /** …ou roda uma vez, fora de tenant (manutenção da plataforma). */
  global?: (agora: Date) => Promise<unknown>;
};

const provider = providerDoAmbiente();
// Evolution (QR Code): cada espaço envia pelo próprio número, só quando conectado.
const evolution = evolutionDoAmbiente();

async function enviarFila(tenantId: string, agora: Date) {
  if (!evolution) return processarFila(tenantId, provider, agora);
  const doTenant = await providerDoTenant(tenantId, evolution, agora);
  return doTenant ? processarFila(tenantId, doTenant, agora) : { pulado: "nada a enviar ou WhatsApp desconectado" };
}

const JOBS: Job[] = [
  // Horários em UTC (06:00 UTC = 03:00 em Brasília).
  // Diário, de madrugada: estende as recorrências até o fim da janela de 8 semanas.
  { fila: "agenda.materializar-recorrencias", cron: "0 6 * * *", executar: materializarRecorrencias },
  // Datas da série que ficaram sem sala: e-mail ao profissional (fora da transação da materialização).
  { fila: "agenda.avisar-datas-nao-reservadas", cron: "30 6 * * *", porTenant: (tenantId, agora) => avisarDatasNaoReservadas(tenantId, { agora }) },
  // Reservas que terminaram passam a "concluida" (base para o financeiro da Fase 3).
  { fila: "agenda.concluir-reservas", cron: "*/15 * * * *", executar: concluirReservasPassadas },
  // Lembretes D-1 (janela de 2h a 24h antes) e envio da outbox com retentativas.
  { fila: "notificacoes.agendar-lembretes", cron: "*/15 * * * *", executar: agendarLembretes },
  { fila: "notificacoes.enviar", cron: "* * * * *", porTenant: enviarFila },
  // NFS-e: reenvia pendentes (consultando antes, sem duplicar) e acompanha as em processamento.
  { fila: "fiscal.processar-notas", cron: "*/2 * * * *", porTenant: (tenantId, agora) => processarNotasFiscais(tenantId, agora) },
  // Asaas: fatura mensal do SaaS (idempotente, roda todo dia) e sincronização de reserva dos webhooks.
  { fila: "assinatura.gerar-faturas", cron: "0 9 * * *", porTenant: (tenantId, agora) => gerarFaturaDoMes(tenantId, { agora }) },
  { fila: "assinatura.sincronizar", cron: "*/30 * * * *", porTenant: (tenantId, agora) => sincronizarFaturas(tenantId, { agora }) },
  { fila: "cobrancas.sincronizar", cron: "*/15 * * * *", porTenant: (tenantId, agora) => sincronizarCobrancas(tenantId, { agora }) },
  // Contadores de rate limit parados há mais de 1 dia.
  { fila: "manutencao.limpar-rate-limits", cron: "30 7 * * *", global: (agora) => limparLimitesAntigos(agora.getTime()) },
  // Outbox com falhas ou parada: alerta (Sentry e, com ALERTAS_EMAIL, e-mail).
  { fila: "monitoramento.verificar-alertas", cron: "*/15 * * * *", global: (agora) => verificarAlertas({ agora }) },
];

async function porTenant(job: Job) {
  const agora = new Date();
  if (job.global) {
    try {
      log.debug("job concluído", { fila: job.fila, resultado: await job.global(agora) });
    } catch (erro) {
      await falhaDeJob(job.fila, erro);
    }
    return;
  }
  for (const tenantId of await listarTenantsAtivos()) {
    try {
      const resultado = job.porTenant
        ? await job.porTenant(tenantId, agora)
        : await withSistema(tenantId, (tx) => job.executar!(tx, agora));
      log.debug("job concluído", { fila: job.fila, tenantId, resultado });
    } catch (erro) {
      // Falha num tenant não impede os demais; o job é refeito na próxima execução.
      await falhaDeJob(job.fila, erro, tenantId);
    }
  }
}

/** Falha de job: erro no Sentry e alerta (e-mail com limite) para a equipe. */
async function falhaDeJob(fila: string, erro: unknown, tenantId?: string) {
  reportarErro(erro, "job falhou", { tags: { fila, tenantId } });
  await notificarAlerta(`job.${fila}`, `O job ${fila} falhou`, { tenantId, erro: erro instanceof Error ? erro.message : String(erro) }).catch(
    () => undefined,
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");

  // Schema "pgboss" pertence ao papel da aplicação (criado no init do Postgres).
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (erro) => reportarErro(erro, "erro do pg-boss"));

  await boss.start();
  for (const job of JOBS) {
    await boss.createQueue(job.fila);
    // Cron em UTC: cada job calcula datas pelo fuso de cada unidade (C13).
    await boss.schedule(job.fila, job.cron, {}, { tz: "UTC" });
    await boss.work(job.fila, () => porTenant(job));
  }
  // Fila da Fase 0, substituída pelos jobs acima.
  await boss.unschedule("manutencao.heartbeat").catch(() => undefined);
  log.info("worker pronto", { whatsapp: evolution ? "evolution" : provider.nome, filas: JOBS.map((j) => j.fila) });

  // Heartbeat para o healthcheck do container: o arquivo é tocado enquanto o banco responde.
  const batimento = setInterval(async () => {
    try {
      await boss.getQueues();
      await writeFile(ARQUIVO_HEARTBEAT, new Date().toISOString());
    } catch (erro) {
      reportarErro(erro, "heartbeat do worker falhou");
    }
  }, 30_000);
  await writeFile(ARQUIVO_HEARTBEAT, new Date().toISOString());

  const encerrar = async () => {
    clearInterval(batimento);
    await boss.stop({ graceful: true });
    await descarregarMonitoramento();
    process.exit(0);
  };
  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);
}

main().catch(async (erro) => {
  reportarErro(erro, "worker não conseguiu iniciar");
  await descarregarMonitoramento();
  process.exit(1);
});
