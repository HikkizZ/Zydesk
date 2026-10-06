#!/bin/sh
# Archivo diario de logs (spec fase 9 §10.1; alternativa con cron de ADR 0017 a Loki). Corre como root
# (zydesk-logs.timer, 00:10 hora de Santiago). Guarda las últimas 24 h de api, web y bot en
# $DATOS_DIR/logs/AAAA-MM-DD.json.gz (700) y borra los de más de 30 días. Se busca con `zgrep`.
# Los logs NO entran en los respaldos (contienen IPs). Solo ids por ADR 0017: sin contenido de mensajes ni secretos.
set -eu
umask 077

RAIZ="${ZYDESK_RAIZ:-/srv/apps/zydesk}"
ENV_ARCHIVO="$RAIZ/.env"
REPO="$RAIZ/repo"

leer_env() {
  sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1 | sed "s/[[:space:]]#.*\$//; s/\r\$//; s/^[\"']//; s/[\"']\$//"
}

dc() {
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml" --env-file "$ENV_ARCHIVO" "$@"
}

DATOS_DIR="$(leer_env DATOS_DIR)"
DATOS_DIR="${DATOS_DIR:-/srv/data/zydesk}"
DESTINO="$DATOS_DIR/logs"
mkdir -p "$DESTINO"

# zydesk-bot solo existe con el perfil `bot`: si no está activo, simplemente no aporta líneas
{
  for servicio in zydesk-api zydesk-web zydesk-bot; do
    dc logs --since 24h --no-color "$servicio" 2>/dev/null || true
  done
} | gzip >"$DESTINO/$(date -u +%Y-%m-%d).json.gz"

find "$DESTINO" -maxdepth 1 -name '*.json.gz' -mtime +30 -delete
printf 'logs archivados en %s\n' "$DESTINO"
