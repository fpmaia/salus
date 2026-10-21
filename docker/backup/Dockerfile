# Backup do Salus: pg_dump (mesma versão do servidor) + age (cifra) + rclone (envio externo).
FROM postgres:16-alpine
RUN apk add --no-cache age rclone
# Remotes só por variáveis RCLONE_CONFIG_<NOME>_* (sem arquivo de configuração).
ENV RCLONE_CONFIG=/dev/null
COPY entrypoint.sh backup.sh restaurar-teste.sh manifesto.sql /usr/local/lib/salus-backup/
# Remove CR (checkout no Windows): shebang com \r não executa no Linux.
RUN sed -i 's/\r$//' /usr/local/lib/salus-backup/* && chmod +x /usr/local/lib/salus-backup/*.sh && mkdir -p /var/lib/salus-backup
ENTRYPOINT ["/usr/local/lib/salus-backup/entrypoint.sh"]
CMD ["agendar"]
