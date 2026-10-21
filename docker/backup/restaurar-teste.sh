#!/bin/sh
# Teste de restauração: baixa o último backup diário, decifra, restaura num banco temporário
# do mesmo servidor e confere as contagens contra o manifesto gravado no backup.
# Rode todo mês (docs/deploy.md). A chave PRIVADA age entra só aqui, montada na hora.
#
# Variáveis: PGHOST PGUSER PGPASSWORD (superusuário: cria e apaga o banco temporário)
#            AGE_IDENTITY_FILE BACKUP_DESTINO [BANCO_TESTE=salus_restauro_teste] [MANTER=1]
set -eu
DIR=/usr/local/lib/salus-backup
: "${AGE_IDENTITY_FILE:?monte a chave privada age e defina AGE_IDENTITY_FILE}"
: "${BACKUP_DESTINO:?defina BACKUP_DESTINO}"
banco="${BANCO_TESTE:-salus_restauro_teste}"
tmp=$(mktemp -d)

limpar() {
  rm -rf "$tmp"
  if [ "${MANTER:-0}" != "1" ]; then psql -X -q -d postgres -c "drop database if exists ${banco}" >/dev/null 2>&1 || true; fi
}
trap limpar EXIT

ultimo=$(rclone lsf --files-only "${BACKUP_DESTINO}/postgres/diario" | grep '\.dump\.age$' | sort | tail -n 1)
[ -n "$ultimo" ] || { echo "[restauro] nenhum backup em ${BACKUP_DESTINO}/postgres/diario" >&2; exit 1; }
base="${ultimo%.dump.age}"
echo "[restauro] último backup: ${base}"
rclone copyto "${BACKUP_DESTINO}/postgres/diario/${ultimo}" "$tmp/salus.dump.age"
rclone copyto "${BACKUP_DESTINO}/postgres/diario/${base}.manifest.json" "$tmp/esperado.json"

age -d -i "$AGE_IDENTITY_FILE" -o "$tmp/salus.dump" "$tmp/salus.dump.age"

psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${banco}" -c "create database ${banco}"
pg_restore --exit-on-error -d "$banco" "$tmp/salus.dump"
psql -X -At -v ON_ERROR_STOP=1 -f "$DIR/manifesto.sql" "$banco" > "$tmp/restaurado.json"

if [ "$(cat "$tmp/esperado.json")" = "$(cat "$tmp/restaurado.json")" ]; then
  echo "[restauro] OK: contagens conferem $(cat "$tmp/restaurado.json")"
else
  echo "[restauro] DIVERGÊNCIA" >&2
  echo "  esperado:   $(cat "$tmp/esperado.json")" >&2
  echo "  restaurado: $(cat "$tmp/restaurado.json")" >&2
  exit 1
fi
