// Defaults batem com o docker compose de desenvolvimento (porta 5433).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://salus_app:salus_app_dev@localhost:5433/salus_test";

export const TEST_DATABASE_MIGRATOR_URL =
  process.env.TEST_DATABASE_MIGRATOR_URL ??
  "postgres://salus_owner:salus_owner_dev@localhost:5433/salus_test";
