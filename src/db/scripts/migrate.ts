import { aplicarMigrations } from "../migrator";

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error("DATABASE_MIGRATOR_URL não definida");
  process.exit(1);
}

aplicarMigrations(url)
  .then(() => console.log("Migrations aplicadas."))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
