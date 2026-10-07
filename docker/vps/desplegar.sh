#!/bin/sh
# Despliegue de Zydesk en el VPS (ADR 0020; Fase 9, spec §5.5). Se instala UNA vez como root:root 755 en
# /srv/apps/zydesk/desplegar.sh (el despliegue no lo cambia; para actualizarlo se vuelve a copiar como root).
#
# Entrada: SSH_ORIGINAL_COMMAND (el CD, vía ForceCommand) o $1 (a mano, como zydesk-deploy):
#   sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh v1.0.0
# La ÚNICA entrada externa es la etiqueta vX.Y.Z[-rc.N], y es lo primero que se valida.
#
# Códigos de salida: 0 desplegado · 1 falló y se revirtió · 2 etiqueta inválida · 3 otro despliegue en curso ·
#   4 el respaldo previo falló (no se despliega) · 5 falló y la reversión también · 6 el repo no está limpio o la
#   etiqueta no existe (no se tocó ningún contenedor) · 7 se ejecutó como root.
# Stdout lo muestra el CD: nunca imprime valores del .env ni activa `set -x`.
set -eu

RAIZ=/srv/apps/zydesk
BLOQUEO=/run/lock/zydesk-despliegue.lock
ESPERA=5
INTENTOS=12

# Modo simulación (solo pruebas, docker/vps/desplegar.test.sh): docker, git y curl se sustituyen por funciones que
# registran las llamadas. Fuera de las pruebas la raíz es fija: el entorno de quien invoca no puede cambiarla.
if [ -n "${ZYDESK_SIMULAR:-}" ]; then
  RAIZ="${ZYDESK_RAIZ:?falta ZYDESK_RAIZ}"
  BLOQUEO="$RAIZ/.bloqueo"
  ESPERA=0
  # shellcheck source=/dev/null
  . "${ZYDESK_SIMULADOR:?falta ZYDESK_SIMULADOR}"
fi

msg() { printf '%s\n' "$*"; }
error() { printf '%s\n' "$*" >&2; }

# --- 1. Validar la etiqueta (la única entrada externa) ---
ETIQUETA="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [ -z "${SSH_ORIGINAL_COMMAND:-}" ] && [ "$#" -gt 1 ]; then
  error 'etiqueta inválida'
  exit 2
fi
etiqueta_valida() {
  case "$1" in
    '' | *'
'*) return 1 ;;
  esac
  printf '%s\n' "$1" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$'
}
if ! etiqueta_valida "$ETIQUETA"; then
  error 'etiqueta inválida'
  exit 2
fi

if [ -z "${ZYDESK_SIMULAR:-}" ] && [ "$(id -u)" -eq 0 ]; then
  error 'ejecútalo como zydesk-deploy: sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh <etiqueta>'
  exit 7
fi

# --- 2. Carpeta y bloqueo ---
cd "$RAIZ"
exec 9>"$BLOQUEO"
if ! flock -n 9; then
  error 'hay otro despliegue en curso'
  exit 3
fi

ENV_ARCHIVO="$RAIZ/.env"
REPO="$RAIZ/repo"

# Lee un valor del .env sin cargarlo en el entorno: última aparición, sin comillas ni comentario final
leer_env() {
  sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1 | sed "s/[[:space:]]#.*\$//; s/\\r\$//; s/^[\"']//; s/[\"']\$//"
}

# Fija ZYDESK_VERSION en el .env (solo esa línea; si no existe, la agrega)
fijar_version() {
  if grep -q '^ZYDESK_VERSION=' "$ENV_ARCHIVO"; then
    sed -i "s/^ZYDESK_VERSION=.*/ZYDESK_VERSION=$1/" "$ENV_ARCHIVO"
  else
    printf 'ZYDESK_VERSION=%s\n' "$1" >>"$ENV_ARCHIVO"
  fi
}

dc() {
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml" --env-file "$ENV_ARCHIVO" "$@"
}

# Aviso por Telegram (si hay token y chat en el .env). El token viaja por stdin de curl (-K -), no por la línea de
# comandos, y el script jamás lo imprime.
avisar() {
  token="$(leer_env TELEGRAM_BOT_TOKEN)"
  chat="$(leer_env TELEGRAM_CHAT_ADMIN)"
  if [ -z "$token" ] || [ -z "$chat" ]; then
    return 0
  fi
  if printf 'url = "https://api.telegram.org/bot%s/sendMessage"\ndata-urlencode = "chat_id=%s"\n' "$token" "$chat" |
    curl -fsS --max-time 10 -K - -X POST --data-urlencode "text=$1" >/dev/null 2>&1; then
    msg 'aviso enviado por Telegram'
  else
    msg 'no se pudo enviar el aviso por Telegram'
  fi
}

# Espera a que la API de la versión pedida responda sano (desde dentro de la red del Compose)
esperar_salud() {
  esperada="${1#v}"
  intento=1
  while [ "$intento" -le "$INTENTOS" ]; do
    respuesta="$(dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud 2>/dev/null || true)"
    if printf '%s' "$respuesta" | grep -q '"estado":"ok"' &&
      printf '%s' "$respuesta" | grep -q "\"version\":\"$esperada\""; then
      return 0
    fi
    intento=$((intento + 1))
    sleep "$ESPERA"
  done
  return 1
}

# --- 12. Reversión ---
DUMP_PREVIO=
revertir() {
  motivo="$1"
  error "falló: $motivo"
  if [ -z "$ANTERIOR" ]; then
    error 'primer despliegue: no hay versión anterior a la que volver'
    avisar "Zydesk: falló el despliegue de $ETIQUETA (primer despliegue, sin versión anterior): $motivo"
    exit 1
  fi
  msg "revirtiendo a $ANTERIOR"
  if git -C "$REPO" checkout --quiet --detach "refs/tags/$ANTERIOR" &&
    fijar_version "$ANTERIOR" &&
    dc up -d --remove-orphans &&
    esperar_salud "$ANTERIOR"; then
    msg "revertido a $ANTERIOR; las migraciones no se revierten: respaldo en ${DUMP_PREVIO:-no hay}"
    avisar "Zydesk: falló el despliegue de $ETIQUETA ($motivo); revertido a $ANTERIOR"
    exit 1
  fi
  error "la reversión a $ANTERIOR también falló: ver docs/despliegue.md (rollback manual)"
  avisar "Zydesk: falló el despliegue de $ETIQUETA y la reversión a $ANTERIOR también; intervención manual"
  exit 5
}

# --- 3. Versión actual ---
ANTERIOR="$(leer_env ZYDESK_VERSION)"
printf '%s\n' "ZYDESK_VERSION=$ANTERIOR" >"$RAIZ/.env.anterior"
msg "despliegue de $ETIQUETA (versión actual: ${ANTERIOR:-ninguna})"

# --- 4. Respaldo previo (local, sin cifrar, solo la base: el cron nocturno de root hace el completo) ---
if [ -n "$ANTERIOR" ]; then
  datos="$(leer_env DATOS_DIR)"
  datos="${datos:-/srv/data/zydesk}"
  pgu="$(leer_env POSTGRES_USER)"
  pgb="$(leer_env POSTGRES_DB)"
  carpeta="$datos/respaldos/pre-despliegue"
  marca="$(date -u +%Y-%m-%dT%H%M%S)"
  DUMP_PREVIO="$carpeta/$marca-$ANTERIOR.dump"
  msg 'respaldo previo de la base'
  if ! (umask 077 && mkdir -p "$carpeta" && dc exec -T zydesk-db pg_dump -U "${pgu:-postgres}" -d "${pgb:-zydesk}" -Fc >"$DUMP_PREVIO"); then
    rm -f "$DUMP_PREVIO"
    error 'el respaldo previo falló; no se despliega'
    avisar "Zydesk: no se desplegó $ETIQUETA, el respaldo previo falló"
    exit 4
  fi
  # se conservan los últimos 5
  # shellcheck disable=SC2012
  ls -1t "$carpeta"/*.dump 2>/dev/null | tail -n +6 | while read -r viejo; do rm -f -- "$viejo"; done
fi

# --- 5. Código de la etiqueta (repo público, sin credenciales) ---
msg 'actualizando el repositorio'
if ! git -C "$REPO" fetch --quiet --tags origin ||
  ! git -C "$REPO" checkout --quiet --detach "refs/tags/$ETIQUETA"; then
  error 'no se pudo obtener la etiqueta; no se tocó ningún contenedor'
  avisar "Zydesk: no se desplegó $ETIQUETA, la etiqueta no está disponible"
  exit 6
fi
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  error 'el clon del repositorio tiene cambios locales; no se despliega'
  avisar "Zydesk: no se desplegó $ETIQUETA, el clon tiene cambios locales"
  exit 6
fi

# --- 6. Imágenes (públicas en GHCR: sin login) ---
msg 'descargando imágenes'
# El .env todavía tiene la versión anterior (se fija en el paso 8, después de detener la API): la etiqueta
# nueva se pasa solo a este pull, en una subshell, porque el entorno manda sobre --env-file
if ! (ZYDESK_VERSION="$ETIQUETA" && export ZYDESK_VERSION && dc pull --quiet); then
  revertir 'no se pudieron descargar las imágenes'
fi

# --- 7. La API anterior no debe escribir mientras migra la nueva ---
msg 'deteniendo la API y el bot'
dc stop zydesk-api zydesk-bot

# --- 8. Versión nueva en el .env y base de datos arriba ---
fijar_version "$ETIQUETA"
dc up -d --wait zydesk-db

# --- 9. Migraciones con el rol owner ---
msg 'aplicando migraciones'
if ! dc run --rm --no-deps zydesk-herramientas migrar; then
  revertir 'las migraciones fallaron'
fi

# --- 10. Levantar todo ---
msg 'levantando los servicios'
if ! dc up -d --remove-orphans; then
  revertir 'no se pudieron levantar los servicios'
fi

# --- 11. Salud ---
msg 'comprobando la salud'
if ! esperar_salud "$ETIQUETA"; then
  revertir 'la API no respondió sana con la versión pedida'
fi

# --- 13. Limpieza de imágenes viejas ---
docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true

# --- 14. Aviso ---
msg "desplegado $ETIQUETA (antes ${ANTERIOR:-ninguna})"
avisar "Zydesk desplegado: $ETIQUETA (antes ${ANTERIOR:-ninguna})"
