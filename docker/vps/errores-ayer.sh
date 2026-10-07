#!/bin/sh
# Alerta mínima de errores (spec fase 9 §10.3; ADR 0017 sin Loki/Grafana). Corre como root (zydesk-errores.timer,
# 08:00 hora de Santiago, opcional). Cuenta los logs "level":"error" de la API en las últimas 24 h y, si hay alguno,
# avisa por Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ADMIN del .env) con el conteo y los `msg` distintos.
# Solo viaja el texto fijo del mensaje de log, que por ADR 0017 no contiene datos. Sin errores no envía nada.
set -eu

RAIZ="${ZYDESK_RAIZ:-/srv/apps/zydesk}"
ENV_ARCHIVO="$RAIZ/.env"
REPO="$RAIZ/repo"

leer_env() {
  sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1 | sed "s/[[:space:]]#.*\$//; s/\r\$//; s/^[\"']//; s/[\"']\$//"
}

dc() {
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml" --env-file "$ENV_ARCHIVO" "$@"
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
dc logs --since 24h --no-color zydesk-api 2>/dev/null | grep '"level":"error"' >"$TMP" || true

CUENTA="$(wc -l <"$TMP" | tr -d ' ')"
if [ "$CUENTA" -eq 0 ]; then
  echo 'sin errores en las últimas 24 h'
  exit 0
fi

MENSAJES="$(sed -n 's/.*"msg":"\([^"]*\)".*/\1/p' "$TMP" | sort | uniq -c | sort -rn | head -n 10 | sed 's/^ *//')"
TEXTO="Zydesk: $CUENTA errores en las últimas 24 h
$MENSAJES"
echo "$TEXTO"

TOKEN="$(leer_env TELEGRAM_BOT_TOKEN)"
CHAT="$(leer_env TELEGRAM_CHAT_ADMIN)"
if [ -n "$TOKEN" ] && [ -n "$CHAT" ]; then
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\ndata-urlencode = "chat_id=%s"\n' "$TOKEN" "$CHAT" |
    curl -fsS --max-time 10 -K - -X POST --data-urlencode "text=$TEXTO" >/dev/null 2>&1 ||
    echo 'no se pudo enviar el aviso por Telegram' >&2
fi
