#!/bin/sh
# Executado pelo entrypoint do Postgres apenas na primeira inicialização do volume.
# Cria os dois papéis da aplicação e os bancos de desenvolvimento e de testes.
#
# - salus_owner: dono das tabelas; usado SÓ para migrations. Tem BYPASSRLS para
#   que manutenção/backfills enxerguem todos os tenants apesar do FORCE RLS.
# - salus_app: papel da aplicação (Next.js, worker, Better Auth). Sem BYPASSRLS
#   e não é dono de nenhuma tabela de tenant, então está sempre sujeito à RLS.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<EOSQL
CREATE ROLE salus_owner LOGIN PASSWORD '${SALUS_OWNER_PASSWORD}' BYPASSRLS;
CREATE ROLE salus_app LOGIN PASSWORD '${SALUS_APP_PASSWORD}' NOBYPASSRLS;
CREATE DATABASE salus OWNER salus_owner;
CREATE DATABASE salus_test OWNER salus_owner;
EOSQL

for db in salus salus_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<EOSQL
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $db TO salus_owner, salus_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- O pg-boss (worker) cria e migra o próprio schema "pgboss" e cria partições por fila,
-- então o papel da aplicação precisa ser dono desse schema. Isso exige CREATE no banco
-- (CREATE SCHEMA IF NOT EXISTS checa o privilégio antes de ver se o schema existe).
-- Não afeta a RLS: as tabelas de tenant em "public" continuam do salus_owner.
GRANT CREATE ON DATABASE $db TO salus_app;
EOSQL
done
