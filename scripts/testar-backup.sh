#!/bin/sh
# Testa backup + restauração de ponta a ponta contra o Postgres do docker compose de dev:
# gera um par de chaves age, faz o backup de BANCO (padrão salus_test) para uma pasta local,
# restaura num banco temporário e confere o manifesto. Usado no CI e localmente:
#   npm run db:up && npm test && sh scripts/testar-backup.sh
set -eu
BANCO="${BANCO:-salus_test}"
REDE="${REDE:-salus_default}"
IMAGEM=salus-backup:teste

montagem() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
trabalho=$(mktemp -d)
limpar() {
  # Arquivos gravados pelo container são do root (no Linux): apaga por dentro dele.
  docker run --rm -v "$(montagem "$trabalho"):/trabalho" "$IMAGEM" sh -c 'rm -rf /trabalho/*' >/dev/null 2>&1 || true
  rm -rf "$trabalho" || true
  # O schema de fila criado abaixo é só do teste: sem isto, o setup dos testes (salus_owner) não o apaga.
  docker run --rm --network "$REDE" -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" "$IMAGEM"     psql -X -q -h db -U postgres -d "$BANCO" -c "drop schema if exists pgboss cascade" >/dev/null 2>&1 || true
}
trap limpar EXIT
mkdir -p "$trabalho/chaves" "$trabalho/destino"
CHAVES=$(montagem "$trabalho/chaves")
DESTINO=$(montagem "$trabalho/destino")
export MSYS_NO_PATHCONV=1

docker build -q -t "$IMAGEM" docker/backup >/dev/null
docker run --rm -v "$CHAVES:/chaves" "$IMAGEM" age-keygen -o /chaves/chave.txt 2>/dev/null
RECIPIENTE=$(docker run --rm -v "$CHAVES:/chaves" "$IMAGEM" age-keygen -y /chaves/chave.txt)

# Como em produção: o schema da fila do worker é do salus_app, que o salus_owner não lê.
docker run --rm --network "$REDE" -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" "$IMAGEM"   psql -X -q -h db -U postgres -d "$BANCO" -v ON_ERROR_STOP=1   -c "create schema if not exists pgboss authorization salus_app"   -c "set role salus_app" -c "create table if not exists pgboss.fila_teste (id int)"

echo "== backup de ${BANCO}"
docker run --rm --network "$REDE" -v "$DESTINO:/destino" \
  -e PGHOST=db -e PGDATABASE="$BANCO" -e PGUSER=salus_owner -e PGPASSWORD="${SALUS_OWNER_PASSWORD:-salus_owner_dev}" \
  -e AGE_RECIPIENT="$RECIPIENTE" -e BACKUP_DESTINO=/destino \
  "$IMAGEM" backup

# O backup sai cifrado: o dump em claro não pode aparecer no destino.
if grep -rl "PGDMP" "$trabalho/destino" >/dev/null 2>&1; then echo "dump em claro no destino!" >&2; exit 1; fi

echo "== restauração"
docker run --rm --network "$REDE" -v "$DESTINO:/destino" -v "$CHAVES:/chaves:ro" \
  -e PGHOST=db -e PGUSER=postgres -e PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" \
  -e AGE_IDENTITY_FILE=/chaves/chave.txt -e BACKUP_DESTINO=/destino \
  "$IMAGEM" restaurar-teste
