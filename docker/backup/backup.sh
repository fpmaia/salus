#!/bin/sh
# Backup do Postgres (pg_dump -Fc, cifrado com age) e dos anexos do prontuário (já cifrados pelo
# app), enviados por rclone para BACKUP_DESTINO (outro provedor/conta que não o do app).
#
# Estrutura no destino:
#   postgres/diario/salus-<carimbo>.dump.age   (+ .manifest.json)  apagados após BACKUP_RETENCAO_DIARIO
#   postgres/mensal/salus-<carimbo>.dump.age   (dia 1º)            nunca apagados aqui (CFM: 20 anos;
#                                                                  use Object Lock/retenção no bucket)
#   anexos/...                                                     cópia só de inclusão (nunca apaga)
#
# Variáveis: PGHOST PGDATABASE PGUSER PGPASSWORD AGE_RECIPIENT BACKUP_DESTINO
#            [BACKUP_RETENCAO_DIARIO=35d] [S3_BUCKET + remote rclone "origem" para os anexos]
set -eu
DIR=/usr/local/lib/salus-backup
: "${AGE_RECIPIENT:?defina AGE_RECIPIENT (chave pública age)}"
: "${BACKUP_DESTINO:?defina BACKUP_DESTINO (remote rclone ou caminho)}"
: "${PGDATABASE:=salus}"

carimbo=$(date -u +%Y%m%dT%H%M%SZ)
nome="salus-${carimbo}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "[backup] ${nome}: pg_dump de ${PGDATABASE}@${PGHOST:-local}"
# Sem o schema "pgboss": é a fila do worker (do papel salus_app, transitória); o pg-boss o
# recria, com os agendamentos, quando o worker sobe.
pg_dump -Fc -Z 6 --exclude-schema=pgboss -f "$tmp/salus.dump" "$PGDATABASE"
psql -X -At -v ON_ERROR_STOP=1 -f "$DIR/manifesto.sql" "$PGDATABASE" > "$tmp/${nome}.manifest.json"

# Cifra para a chave pública: o servidor não consegue ler os próprios backups.
age -r "$AGE_RECIPIENT" -o "$tmp/${nome}.dump.age" "$tmp/salus.dump"
rm "$tmp/salus.dump"

rclone copyto "$tmp/${nome}.dump.age" "${BACKUP_DESTINO}/postgres/diario/${nome}.dump.age"
rclone copyto "$tmp/${nome}.manifest.json" "${BACKUP_DESTINO}/postgres/diario/${nome}.manifest.json"
if [ "$(date -u +%d)" = "01" ]; then
  rclone copyto "$tmp/${nome}.dump.age" "${BACKUP_DESTINO}/postgres/mensal/${nome}.dump.age"
  rclone copyto "$tmp/${nome}.manifest.json" "${BACKUP_DESTINO}/postgres/mensal/${nome}.manifest.json"
fi
rclone delete --min-age "${BACKUP_RETENCAO_DIARIO:-35d}" "${BACKUP_DESTINO}/postgres/diario"

if [ -n "${S3_BUCKET:-}" ]; then
  echo "[backup] anexos: origem:${S3_BUCKET} -> ${BACKUP_DESTINO}/anexos (sem apagar)"
  rclone copy "origem:${S3_BUCKET}" "${BACKUP_DESTINO}/anexos"
fi

mkdir -p /var/lib/salus-backup
touch /var/lib/salus-backup/ultimo-ok
echo "[backup] ok: ${nome} $(cat "$tmp/${nome}.manifest.json")"
