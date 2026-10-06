#!/bin/sh
# Restauración de un respaldo de Zydesk (spec fase 9 §8.2, ADR 0009/0017). Corre como root y es interactivo:
# pide escribir el nombre de la base antes de reemplazarla.
#
#   restaurar.sh <respaldo-….tar.age> [--solo-bd | --solo-archivos]
#   restaurar.sh <…/pre-despliegue/….dump> --solo-bd        (volcado previo a un despliegue, sin cifrar)
#
# Descifra con la clave privada age (/root/.config/zydesk/age.txt), verifica sha256sum.txt, detiene la API y el bot,
# recrea la base con sus dueños y permisos (docker/postgres-init-prod/permisos.sql), repone archivos y bot (deja
# archivos.previo-<marca> sin borrar), levanta todo y comprueba la salud. No imprime valores del .env.
set -eu
umask 077

RAIZ="${ZYDESK_RAIZ:-/srv/apps/zydesk}"
ENV_ARCHIVO="$RAIZ/.env"
REPO="$RAIZ/repo"
CLAVE_AGE="${RESPALDO_AGE_CLAVE:-/root/.config/zydesk/age.txt}"

leer_env() {
  sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1 | sed "s/[[:space:]]#.*\$//; s/\\r\$//; s/^[\"']//; s/[\"']\$//"
}

dc() {
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml" --env-file "$ENV_ARCHIVO" "$@"
}

msg() { printf '%s\n' "$*"; }
error() { printf '%s\n' "$*" >&2; }

uso() {
  error 'uso: restaurar.sh <respaldo.tar.age | volcado.dump> [--solo-bd | --solo-archivos]'
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || uso
ARCHIVO="$1"
MODO=todo
if [ "$#" -eq 2 ]; then
  case "$2" in
    --solo-bd) MODO=bd ;;
    --solo-archivos) MODO=archivos ;;
    *) uso ;;
  esac
fi
[ -f "$ARCHIVO" ] || {
  error "no existe $ARCHIVO"
  exit 2
}
case "$ARCHIVO" in
  *.dump)
    [ "$MODO" = bd ] || {
      error 'un .dump solo se restaura con --solo-bd'
      exit 2
    }
    ;;
  *.tar.age) ;;
  *)
    error 'se espera un .tar.age o un .dump'
    exit 2
    ;;
esac

if [ "$(id -u)" -ne 0 ] && [ -z "${ZYDESK_PERMITIR_NO_ROOT:-}" ]; then
  error 'restaurar.sh corre como root'
  exit 1
fi

exec 9>"${ZYDESK_BLOQUEO_RESPALDO:-/run/lock/zydesk-respaldo.lock}"
flock -n 9 || {
  error 'hay un respaldo o una restauración en curso'
  exit 3
}

DATOS_DIR="$(leer_env DATOS_DIR)"
DATOS_DIR="${DATOS_DIR:-/srv/data/zydesk}"
POSTGRES_USER="$(leer_env POSTGRES_USER)"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="$(leer_env POSTGRES_DB)"
POSTGRES_DB="${POSTGRES_DB:-zydesk}"
VERSION_ACTUAL="$(leer_env ZYDESK_VERSION)"
MARCA="$(date -u +%Y-%m-%dT%H%M%S)"

# El nombre de la base entra en SQL como identificador entre comillas: solo se admiten nombres simples
case "$POSTGRES_DB" in
  *[!a-z0-9_]* | '')
    error 'POSTGRES_DB inválido (solo minúsculas, dígitos y _)'
    exit 1
    ;;
esac

mkdir -p "$DATOS_DIR/respaldos"
TMP="$(mktemp -d "$DATOS_DIR/respaldos/restaurar-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# --- 1. Descifrar y verificar ---
if [ "${ARCHIVO%.dump}" = "$ARCHIVO" ]; then
  [ -f "$CLAVE_AGE" ] || {
    error "falta la clave privada age en $CLAVE_AGE"
    exit 1
  }
  msg 'descifrando el respaldo'
  age -d -i "$CLAVE_AGE" "$ARCHIVO" | tar -xf - -C "$TMP"
  (cd "$TMP" && sha256sum -c --quiet sha256sum.txt) || {
    error 'sha256sum no coincide: el respaldo está dañado'
    exit 1
  }
  msg 'sumas de verificación correctas'
  msg '--- version.txt ---'
  cat "$TMP/version.txt"
  msg '-------------------'
  VERSION_RESPALDO="$(sed -n 's/^version=//p' "$TMP/version.txt" | head -n 1)"
  BD_DUMP="$TMP/bd.dump"
else
  msg 'volcado sin cifrar (sin sumas de verificación ni version.txt)'
  VERSION_RESPALDO=
  BD_DUMP="$ARCHIVO"
fi

# --- 2. La versión desplegada debe ser >= la del respaldo ---
# vX.Y.Z[-rc.N] -> clave ordenable (rc.N queda antes que la final)
clave_version() {
  printf '%s\n' "$1" | sed -n 's/^v\([0-9]*\)\.\([0-9]*\)\.\([0-9]*\)-rc\.\([0-9]*\)$/\1 \2 \3 0 \4/p;
    s/^v\([0-9]*\)\.\([0-9]*\)\.\([0-9]*\)$/\1 \2 \3 1 0/p' | awk '{ printf "%06d%06d%06d%d%06d\n", $1, $2, $3, $4, $5 }'
}
if [ -n "$VERSION_RESPALDO" ]; then
  K_RESP="$(clave_version "$VERSION_RESPALDO")"
  K_ACT="$(clave_version "$VERSION_ACTUAL")"
  if [ -n "$K_RESP" ] && [ -n "$K_ACT" ]; then
    if [ "$K_ACT" != "$K_RESP" ] && [ "$(printf '%s\n%s\n' "$K_ACT" "$K_RESP" | sort | head -n 1)" = "$K_ACT" ]; then
      error "la versión desplegada ($VERSION_ACTUAL) es anterior a la del respaldo ($VERSION_RESPALDO): despliega primero esa etiqueta"
      exit 1
    fi
    if [ "$K_ACT" != "$K_RESP" ]; then
      msg "aviso: la versión desplegada ($VERSION_ACTUAL) es posterior al respaldo ($VERSION_RESPALDO); al desplegar se reaplican sus migraciones"
    fi
  else
    msg 'aviso: no se pudo comparar la versión del respaldo con la desplegada'
  fi
fi

# --- 3. Confirmación ---
msg ''
msg "Se va a REEMPLAZAR (modo: $MODO) la información de $POSTGRES_DB y/o los archivos de $DATOS_DIR por la del respaldo."
printf 'Para continuar escribe el nombre de la base (%s): ' "$POSTGRES_DB"
read -r RESPUESTA || RESPUESTA=
[ "$RESPUESTA" = "$POSTGRES_DB" ] || {
  error 'confirmación incorrecta; no se hizo nada'
  exit 1
}

# --- 4. Detener quienes escriben ---
msg 'deteniendo la API y el bot'
dc stop zydesk-api zydesk-bot

psql_bd() {
  dc exec -T zydesk-db psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -v "BD=$POSTGRES_DB" "$@"
}

if [ "$MODO" != archivos ]; then
  msg 'recreando la base de datos'
  printf 'DROP DATABASE IF EXISTS :"BD" WITH (FORCE);\nCREATE DATABASE :"BD" OWNER zydesk_owner;\n' | psql_bd -d postgres
  psql_bd -d "$POSTGRES_DB" <"$REPO/docker/postgres-init-prod/permisos.sql"

  msg 'restaurando la base de datos'
  dc exec -T zydesk-db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error <"$BD_DUMP"

  # Los permisos del esquema vuelven a quedar exactamente como en el primer arranque
  psql_bd -d "$POSTGRES_DB" <"$REPO/docker/postgres-init-prod/permisos.sql"
fi

# --- 5. Archivos y datos del bot ---
if [ "$MODO" != bd ]; then
  for carpeta in archivos bot; do
    paquete="$TMP/$carpeta.tar.zst"
    if [ ! -f "$paquete" ]; then
      msg "el respaldo no trae $carpeta; se deja como está"
      continue
    fi
    if [ -e "$DATOS_DIR/$carpeta" ]; then
      mv "$DATOS_DIR/$carpeta" "$DATOS_DIR/$carpeta.previo-$MARCA"
      msg "$carpeta anterior guardado en $DATOS_DIR/$carpeta.previo-$MARCA"
    fi
    tar --zstd -xf "$paquete" -C "$DATOS_DIR"
    chown -R 1000:1000 "$DATOS_DIR/$carpeta"
    msg "$carpeta restaurado"
  done
fi

# --- 6. Levantar y comprobar ---
msg 'levantando los servicios'
dc up -d
intento=1
while [ "$intento" -le 24 ]; do
  respuesta="$(dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud 2>/dev/null || true)"
  if printf '%s' "$respuesta" | grep -q '"estado":"ok"'; then
    msg "salud correcta: $respuesta"
    msg "listo. Verifica la aplicación y, si todo está bien, borra $DATOS_DIR/archivos.previo-* y $DATOS_DIR/bot.previo-*"
    exit 0
  fi
  intento=$((intento + 1))
  sleep 5
done
error 'la API no respondió sana tras restaurar: revisa docker compose logs zydesk-api'
exit 1
