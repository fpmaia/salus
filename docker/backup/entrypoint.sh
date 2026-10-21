#!/bin/sh
# agendar        : backup agora e depois a cada BACKUP_INTERVALO_SEGUNDOS (padrão: 1 dia)
# backup         : um backup e sai
# restaurar-teste: restaura o último backup num banco temporário e confere o manifesto
set -eu
DIR=/usr/local/lib/salus-backup

case "${1:-agendar}" in
  agendar)
    while true; do
      # Uma falha não derruba o agendador: o healthcheck acusa (ultimo-ok envelhece).
      "$DIR/backup.sh" || echo "[backup] FALHOU em $(date -u +%FT%TZ)" >&2
      sleep "${BACKUP_INTERVALO_SEGUNDOS:-86400}"
    done
    ;;
  backup) exec "$DIR/backup.sh" ;;
  restaurar-teste) exec "$DIR/restaurar-teste.sh" ;;
  *) exec "$@" ;;
esac
