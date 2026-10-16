import PgBoss from "pg-boss";

// Worker separado (pg-boss). Na Fase 0 só registra um heartbeat agendado; os jobs de
// recorrência, lembretes e fechamentos chegam nas próximas fases.

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

const FILA_HEARTBEAT = "manutencao.heartbeat";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");

  // Schema "pgboss" pertence ao papel da aplicação (criado no init do Postgres).
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (erro) => console.error("[worker]", erro));

  await boss.start();
  await boss.createQueue(FILA_HEARTBEAT);
  await boss.schedule(FILA_HEARTBEAT, "*/5 * * * *");
  await boss.work(FILA_HEARTBEAT, async () => {
    console.log(`[worker] heartbeat ${new Date().toISOString()}`);
  });
  console.log("[worker] pronto");

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
