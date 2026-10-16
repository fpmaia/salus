import PgBoss from "pg-boss";
import type { Transaction } from "../db/client";
import { listarTenantsAtivos, withSistema } from "../db/tenant";
import { concluirReservasPassadas, materializarRecorrencias } from "../server/reservas";

// Worker separado (pg-boss). Cada job percorre os tenants ativos e processa um por vez,
// dentro do contexto do próprio tenant (withSistema), sujeito à RLS como o app.

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

type Job = {
  fila: string;
  cron: string;
  executar: (tx: Transaction, agora: Date) => Promise<unknown>;
};

const JOBS: Job[] = [
  // Diário, de madrugada: estende as recorrências até o fim da janela de 8 semanas.
  { fila: "agenda.materializar-recorrencias", cron: "0 3 * * *", executar: materializarRecorrencias },
  // Reservas que terminaram passam a "concluida" (base para o financeiro da Fase 3).
  { fila: "agenda.concluir-reservas", cron: "*/15 * * * *", executar: concluirReservasPassadas },
];

async function porTenant(job: Job) {
  const agora = new Date();
  for (const tenantId of await listarTenantsAtivos()) {
    try {
      const resultado = await withSistema(tenantId, (tx) => job.executar(tx, agora));
      console.log(`[worker] ${job.fila} tenant=${tenantId}`, resultado);
    } catch (erro) {
      // Falha num tenant não impede os demais; o job é refeito na próxima execução.
      console.error(`[worker] ${job.fila} tenant=${tenantId} falhou`, erro);
    }
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");

  // Schema "pgboss" pertence ao papel da aplicação (criado no init do Postgres).
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (erro) => console.error("[worker]", erro));

  await boss.start();
  for (const job of JOBS) {
    await boss.createQueue(job.fila);
    await boss.schedule(job.fila, job.cron, {}, { tz: "America/Sao_Paulo" });
    await boss.work(job.fila, () => porTenant(job));
  }
  // Fila da Fase 0, substituída pelos jobs acima.
  await boss.unschedule("manutencao.heartbeat").catch(() => undefined);
  console.log(`[worker] pronto: ${JOBS.map((j) => j.fila).join(", ")}`);

  const encerrar = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
