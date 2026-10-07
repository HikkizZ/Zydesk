#!/bin/sh
# Respaldo completo de Zydesk (spec fase 9 §8.1, ADR 0009/0017; spec §19 B4: solo local por ahora).
# Corre como root, a las 02:30 hora de Santiago (zydesk-respaldo.timer) y a demanda:  /srv/apps/zydesk/respaldar.sh
#
# Deja $DATOS_DIR/respaldos/respaldo-<marca>-<versión>.tar.age, cifrado con age (clave pública del .env): nada sale del
# VPS ni queda en disco sin cifrar. Dentro: bd.dump (pg_dump -Fc, con el esquema pgboss), archivos.tar.zst, bot.tar.zst,
# version.txt y sha256sum.txt. La copia remota con rclone solo corre si RCLONE_DESTINO no está vacío.
# El dump conserva dueños y permisos (ACL): los REVOKE de `evento`/`auditoria` viven en las ACL y las tablas de pgboss
# son de zydesk_app (las crea pg-boss); los roles tienen los mismos nombres en toda instalación (01-roles.sh). La spec
# decía --no-owner --no-acl: con eso la API no arrancaba tras restaurar (ver docker/vps/README.md).
#
# Lee del .env solo los nombres que necesita (nunca lo carga entero). No imprime valores del .env.
set -eu
umask 077

RAIZ="${ZYDESK_RAIZ:-/srv/apps/zydesk}"
ENV_ARCHIVO="$RAIZ/.env"
REPO="$RAIZ/repo"
LOG_RESPALDO="${ZYDESK_LOG_RESPALDO:-/var/log/zydesk-respaldo.log}"

leer_env() {
  sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1 | sed "s/[[:space:]]#.*\$//; s/\\r\$//; s/^[\"']//; s/[\"']\$//"
}

dc() {
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml" --env-file "$ENV_ARCHIVO" "$@"
}

msg() { printf '%s\n' "$*"; }
error() { printf '%s\n' "$*" >&2; }

# Aviso por Telegram: el token y el chat viajan por stdin de curl, no por la línea de comandos
avisar() {
  token="$(leer_env TELEGRAM_BOT_TOKEN)"
  chat="$(leer_env TELEGRAM_CHAT_ADMIN)"
  if [ -z "$token" ] || [ -z "$chat" ]; then
    return 0
  fi
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\ndata-urlencode = "chat_id=%s"\n' "$token" "$chat" |
    curl -fsS --max-time 10 -K - -X POST --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

if [ "$(id -u)" -ne 0 ] && [ -z "${ZYDESK_PERMITIR_NO_ROOT:-}" ]; then
  error 'respaldar.sh corre como root'
  exit 1
fi

exec 9>"${ZYDESK_BLOQUEO_RESPALDO:-/run/lock/zydesk-respaldo.lock}"
if ! flock -n 9; then
  error 'ya hay un respaldo en curso'
  exit 3
fi

DATOS_DIR="$(leer_env DATOS_DIR)"
DATOS_DIR="${DATOS_DIR:-/srv/data/zydesk}"
POSTGRES_USER="$(leer_env POSTGRES_USER)"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="$(leer_env POSTGRES_DB)"
POSTGRES_DB="${POSTGRES_DB:-zydesk}"
VERSION="$(leer_env ZYDESK_VERSION)"
VERSION="${VERSION:-sinversion}"
AGE_DESTINATARIO="$(leer_env RESPALDO_AGE_DESTINATARIO)"
RCLONE_DESTINO="$(leer_env RCLONE_DESTINO)"
RETENCION_LOCAL="$(leer_env RESPALDO_RETENCION_LOCAL_DIAS)"
RETENCION_LOCAL="${RETENCION_LOCAL:-14}"
RETENCION_REMOTA="$(leer_env RESPALDO_RETENCION_REMOTA_DIAS)"
RETENCION_REMOTA="${RETENCION_REMOTA:-90}"

MARCA="$(date -u +%Y-%m-%dT%H%M)"
CARPETA="$DATOS_DIR/respaldos"
TMP="$CARPETA/tmp-$MARCA"
FINAL="$CARPETA/respaldo-$MARCA-$VERSION.tar.age"

# Al salir (bien o mal): borra el material sin cifrar y, si falló, avisa
terminar() {
  codigo=$?
  rm -rf "$TMP" "$FINAL.parcial"
  if [ "$codigo" -ne 0 ]; then
    error "el respaldo falló (código $codigo)"
    avisar "Zydesk: el respaldo $MARCA falló (código $codigo)"
  fi
}
trap terminar EXIT

if [ -z "$AGE_DESTINATARIO" ]; then
  error 'falta RESPALDO_AGE_DESTINATARIO en el .env (clave pública age1…): no se respalda sin cifrar'
  exit 1
fi

mkdir -p "$CARPETA"
mkdir -p "$TMP"

msg "respaldo $MARCA ($VERSION)"

msg 'volcando la base de datos'
dc exec -T zydesk-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$TMP/bd.dump"

# Los archivos se copian sin detener la API: uno subido durante el tar puede faltar (descarga 404, ADR 0009)
msg 'copiando archivos'
mkdir -p "$DATOS_DIR/archivos"
tar --zstd -cf "$TMP/archivos.tar.zst" -C "$DATOS_DIR" archivos
if [ -d "$DATOS_DIR/bot" ] && [ -n "$(ls -A "$DATOS_DIR/bot" 2>/dev/null)" ]; then
  tar --zstd -cf "$TMP/bot.tar.zst" -C "$DATOS_DIR" bot
fi

{
  echo "version=$VERSION"
  echo "fecha=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base=$POSTGRES_DB"
  dc exec -T zydesk-db pg_dump --version
} >"$TMP/version.txt"

(cd "$TMP" && sha256sum ./*.dump ./*.zst version.txt >sha256sum.txt)

msg 'cifrando con age'
tar -cf - -C "$TMP" . | age -r "$AGE_DESTINATARIO" -o "$FINAL.parcial"
mv "$FINAL.parcial" "$FINAL"
rm -rf "$TMP"

REMOTO=no
if [ -n "$RCLONE_DESTINO" ]; then
  msg 'copiando al destino remoto'
  rclone copy "$FINAL" "$RCLONE_DESTINO/" --retries 3
  REMOTO=si
else
  msg 'aviso: RCLONE_DESTINO vacío, el respaldo es solo local (spec §19 B4)'
fi

# Retención
find "$CARPETA" -maxdepth 1 -name 'respaldo-*.tar.age' -mtime "+$RETENCION_LOCAL" -delete
if [ "$REMOTO" = si ]; then
  rclone delete "$RCLONE_DESTINO" --min-age "${RETENCION_REMOTA}d" --include 'respaldo-*.tar.age'
fi

TAMANO="$(du -h "$FINAL" | cut -f1)"
LINEA="$(date -u +%Y-%m-%dT%H:%M:%SZ) respaldo $MARCA version=$VERSION tamano=$TAMANO remoto=$REMOTO"
msg "$LINEA"
printf '%s\n' "$LINEA" >>"$LOG_RESPALDO" 2>/dev/null || error "no se pudo escribir $LOG_RESPALDO"
