#!/bin/bash
# shellcheck disable=SC2015  # «cond && ok || fallo»: ok y fallo nunca fallan, es el patrón de los asertos
# Pruebas de desplegar.sh (spec fase 9 §5.5 y §14.2) con ZYDESK_SIMULAR=1: docker, git, curl y flock se sustituyen por
# funciones que registran las llamadas; no se necesita Docker, red ni root. Uso: bash docker/vps/desplegar.test.sh
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/desplegar.sh"
BASE="$(mktemp -d)"
trap 'rm -rf "$BASE"' EXIT
FALLOS=0
TOTAL=0

# Valores falsos que NUNCA deben aparecer en la salida del script ni en el registro de llamadas
SECRETOS=(ClavePostgresFalsa123 ClaveOwnerFalsa456 ClaveAppFalsa789 ClaveBotFalsa012 TokenTelegramFalso345 ClaveDemoFalsa678)

ok() {
  TOTAL=$((TOTAL + 1))
  echo "  ok  $1"
}
fallo() {
  TOTAL=$((TOTAL + 1))
  FALLOS=$((FALLOS + 1))
  echo "  FALLA  $1"
}
verifica() { # descripción, condición (0 = ok)
  if [ "$2" -eq 0 ]; then ok "$1"; else fallo "$1"; fi
}

# Simulador: lo carga desplegar.sh con ZYDESK_SIMULAR=1
cat >"$BASE/simulador.sh" <<'SIM'
registrar() { printf '%s\n' "$*" >>"$ZYDESK_REGISTRO"; }
sleep() { :; }
flock() { registrar "flock $*"; [ -z "${SIM_BLOQUEADO:-}" ]; }
curl() { registrar "curl $* [config por stdin]"; cat >/dev/null; return 0; }
git() {
  registrar "git $*"
  case "$*" in
    *"checkout"*"refs/tags/${SIM_ETIQUETA_INEXISTENTE:-@@@}") return 1 ;;
    *"status --porcelain") [ -n "${SIM_REPO_SUCIO:-}" ] && echo ' M docker-compose.yml' ;;
  esac
  return 0
}
docker() {
  registrar "docker $*"
  case "$*" in
    *"exec -T zydesk-db pg_dump"*)
      [ -n "${SIM_FALLA_DUMP:-}" ] && return 1
      echo 'volcado-falso'
      ;;
    *"pull --quiet")
      # versión con la que Compose resolvería las imágenes: el entorno manda sobre el .env
      printf '%s\n' "${ZYDESK_VERSION:-$(sed -n 's/^ZYDESK_VERSION=//p' "$ZYDESK_RAIZ/.env" | tail -n 1)}" \
        >"$ZYDESK_RAIZ/version-pull"
      [ -z "${SIM_FALLA_PULL:-}" ] || return 1
      ;;
    *"run --rm --no-deps zydesk-api migrar") [ -z "${SIM_FALLA_MIGRAR:-}" ] || return 1 ;;
    *"exec -T zydesk-web wget"*)
      actual="$(sed -n 's/^ZYDESK_VERSION=//p' "$ZYDESK_RAIZ/.env" | tail -n 1)"
      if [ "$actual" = "${SIM_SALUD_MALA:-@@@}" ]; then
        echo '{"estado":"error","version":"'"${actual#v}"'","bd":"error"}'
        return 1
      fi
      echo '{"estado":"ok","version":"'"${actual#v}"'","bd":"ok"}'
      ;;
  esac
  return 0
}
SIM

# Prepara una raíz limpia con un .env falso; $1 = versión actual (puede ir vacía)
preparar() {
  RAIZ="$BASE/raiz-$1-$RANDOM"
  mkdir -p "$RAIZ/repo" "$RAIZ/datos"
  cat >"$RAIZ/.env" <<EOF
ZYDESK_VERSION=$1
GHCR_OWNER=hikkizz
DATOS_DIR=$RAIZ/datos
POSTGRES_USER=postgres
POSTGRES_PASSWORD=ClavePostgresFalsa123
POSTGRES_DB=zydesk
ZYDESK_OWNER_PASSWORD=ClaveOwnerFalsa456
ZYDESK_APP_PASSWORD=ClaveAppFalsa789
BOT_API_KEY=ClaveBotFalsa012
TELEGRAM_BOT_TOKEN=TokenTelegramFalso345
TELEGRAM_CHAT_ADMIN=-100123456
DEMO_PASSWORD=ClaveDemoFalsa678
EOF
  : >"$RAIZ/registro.txt"
}

# Ejecuta desplegar.sh simulado; deja la salida en $SALIDA y el código en $CODIGO. Variables SIM_* por el entorno.
ejecutar() { # raiz, etiqueta (por SSH_ORIGINAL_COMMAND si $3 = ssh; por $1 si no)
  local raiz="$1" etiqueta="$2" modo="${3:-ssh}"
  if [ "$modo" = ssh ]; then
    SALIDA="$(ZYDESK_SIMULAR=1 ZYDESK_RAIZ="$raiz" ZYDESK_SIMULADOR="$BASE/simulador.sh" ZYDESK_REGISTRO="$raiz/registro.txt" \
      SSH_ORIGINAL_COMMAND="$etiqueta" sh "$SCRIPT" 2>&1)"
  else
    SALIDA="$(ZYDESK_SIMULAR=1 ZYDESK_RAIZ="$raiz" ZYDESK_SIMULADOR="$BASE/simulador.sh" ZYDESK_REGISTRO="$raiz/registro.txt" \
      sh "$SCRIPT" "$etiqueta" 2>&1)"
  fi
  CODIGO=$?
}

# Registro normalizado: quita la ruta de la raíz y el prefijo de `docker compose …` (queda «dc …»)
registro() {
  sed -e "s#$1#<raiz>#g" -e 's#docker compose --project-directory [^ ]* -f [^ ]* --env-file [^ ]* #dc #' "$1/registro.txt"
}

sin_secretos() { # raiz
  local s
  for s in "${SECRETOS[@]}"; do
    if printf '%s\n' "$SALIDA" | grep -q "$s" || grep -q "$s" "$1/registro.txt"; then
      return 1
    fi
  done
  return 0
}

echo "1. Etiquetas inválidas: salida 2 y ninguna llamada"
# shellcheck disable=SC2016  # son literales a propósito: no deben expandirse
INVALIDAS=('v1' 'main' 'v1.0.0; rm -rf /' '../x' '' 'v1.0.0 extra' '$(id)' 'v1.0.0-rc' 'v1.0.0-rc.1x' 'V1.0.0' '1.0.0' 'v1.0' $'v1.0.0\nrm -rf /' 'v1.0.0|ls' 'v1.0.0`id`')
for malo in "${INVALIDAS[@]}"; do
  preparar v1.0.0
  ejecutar "$RAIZ" "$malo" ssh
  etiqueta_legible="$(printf '%s' "$malo" | tr '\n' '|')"
  if [ "$CODIGO" -eq 2 ] && [ ! -s "$RAIZ/registro.txt" ] && [ "$SALIDA" = "etiqueta inválida" ]; then
    ok "ssh «$etiqueta_legible»"
  else
    fallo "ssh «$etiqueta_legible»"
  fi
done
preparar v1.0.0
ejecutar "$RAIZ" 'v1; ls' arg
if [ "$CODIGO" -eq 2 ] && [ ! -s "$RAIZ/registro.txt" ]; then ok "argumento inválido «v1; ls»"; else fallo "argumento inválido «v1; ls»"; fi
preparar v1.0.0
SALIDA="$(ZYDESK_SIMULAR=1 ZYDESK_RAIZ="$RAIZ" ZYDESK_SIMULADOR="$BASE/simulador.sh" ZYDESK_REGISTRO="$RAIZ/registro.txt" sh "$SCRIPT" v1.0.1 otro 2>&1)"
CODIGO=$?
if [ "$CODIGO" -eq 2 ] && [ ! -s "$RAIZ/registro.txt" ]; then ok "argumentos adicionales rechazados"; else fallo "argumentos adicionales rechazados"; fi

echo "2. Etiquetas válidas aceptadas"
for bueno in v1.0.0 v10.20.30 v1.0.0-rc.1 v0.0.1-rc.12; do
  preparar v0.0.0
  ejecutar "$RAIZ" "$bueno" ssh
  verifica "«$bueno»" "$CODIGO"
done

echo "3. Secuencia exacta de un despliegue correcto (v1.0.0 -> v1.0.1)"
preparar v1.0.0
mkdir -p "$RAIZ/datos/respaldos/pre-despliegue"
for n in 1 2 3 4 5 6; do : >"$RAIZ/datos/respaldos/pre-despliegue/2026-01-0${n}T000000-v0.9.0.dump"; done
ejecutar "$RAIZ" v1.0.1 ssh
ESPERADO='flock -n 9
dc exec -T zydesk-db pg_dump -U postgres -d zydesk -Fc
git -C <raiz>/repo fetch --quiet --tags origin
git -C <raiz>/repo checkout --quiet --detach refs/tags/v1.0.1
git -C <raiz>/repo status --porcelain
dc pull --quiet
dc stop zydesk-api zydesk-bot
dc up -d --wait zydesk-db
dc run --rm --no-deps zydesk-api migrar
dc up -d --remove-orphans
dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud
docker image prune -f --filter until=168h
curl -fsS --max-time 10 -K - -X POST --data-urlencode text=Zydesk desplegado: v1.0.1 (antes v1.0.0) [config por stdin]'
REAL="$(registro "$RAIZ")"
if [ "$CODIGO" -eq 0 ] && [ "$REAL" = "$ESPERADO" ]; then
  ok "llamadas en el orden de §5.5"
else
  fallo "llamadas en el orden de §5.5 (código $CODIGO)"
  diff <(printf '%s\n' "$ESPERADO") <(printf '%s\n' "$REAL") | head -20
  printf '%s\n' "$SALIDA" | tail -5
fi
if grep -qx 'ZYDESK_VERSION=v1.0.1' "$RAIZ/.env"; then ok ".env con la versión nueva"; else fallo ".env con la versión nueva"; fi
if grep -qx 'ZYDESK_VERSION=v1.0.0' "$RAIZ/.env.anterior"; then ok ".env.anterior con la versión previa"; else fallo ".env.anterior con la versión previa"; fi
if [ "$(grep -c '' "$RAIZ/.env")" -eq 12 ]; then ok ".env: solo cambió la línea de la versión"; else fallo ".env: solo cambió la línea de la versión"; fi
# shellcheck disable=SC2012
if [ "$(ls "$RAIZ"/datos/respaldos/pre-despliegue/*.dump | wc -l)" -eq 5 ]; then ok "pre-despliegue: se conservan 5 volcados (6 viejos + 1 nuevo)"; else fallo "pre-despliegue: se conservan 5 volcados (6 viejos + 1 nuevo)"; fi
if sin_secretos "$RAIZ"; then ok "salida y registro sin secretos del .env"; else fallo "salida y registro sin secretos del .env"; fi
if printf '%s\n' "$SALIDA" | grep -q 'desplegado v1.0.1'; then ok "la salida informa el resultado"; else fallo "la salida informa el resultado"; fi
if [ "$(cat "$RAIZ/version-pull" 2>/dev/null)" = "v1.0.1" ]; then ok "el pull usa la etiqueta nueva, no la del .env"; else fallo "el pull usa la etiqueta nueva, no la del .env ($(cat "$RAIZ/version-pull" 2>/dev/null))"; fi

echo "4. Primer despliegue (sin versión anterior): sin volcado previo"
preparar ''
ejecutar "$RAIZ" v1.0.0-rc.1 ssh
if [ "$(cat "$RAIZ/version-pull" 2>/dev/null)" = "v1.0.0-rc.1" ]; then ok "primer despliegue: el pull usa la etiqueta (el .env está vacío)"; else fallo "primer despliegue: el pull usa la etiqueta ($(cat "$RAIZ/version-pull" 2>/dev/null))"; fi
registro "$RAIZ" | grep -q pg_dump && fallo "no debe hacer pg_dump" || ok "sin pg_dump"
if [ "$CODIGO" -eq 0 ] && grep -qx 'ZYDESK_VERSION=v1.0.0-rc.1' "$RAIZ/.env"; then ok "despliega y fija la versión"; else fallo "despliega y fija la versión"; fi

echo "5. Salud que falla: reversión y salida 1"
preparar v1.0.0
SIM_SALUD_MALA=v1.0.1 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 1 ]; then ok "salida 1"; else fallo "salida 1"; fi
if grep -qx 'ZYDESK_VERSION=v1.0.0' "$RAIZ/.env"; then ok ".env vuelve a la versión anterior"; else fallo ".env vuelve a la versión anterior"; fi
if registro "$RAIZ" | grep -q 'checkout --quiet --detach refs/tags/v1.0.0$'; then ok "checkout de la etiqueta anterior"; else fallo "checkout de la etiqueta anterior"; fi
if [ "$(registro "$RAIZ" | grep -c 'wget -qO-')" -eq 13 ]; then ok "12 intentos de salud y 1 de la versión revertida"; else fallo "12 intentos de salud y 1 de la versión revertida"; fi
if printf '%s\n' "$SALIDA" | grep -q 'revertido a v1.0.0; las migraciones no se revierten: respaldo en '; then ok "informa la reversión y dónde está el respaldo"; else fallo "informa la reversión y dónde está el respaldo"; fi
if registro "$RAIZ" | grep -q 'text=Zydesk: falló el despliegue de v1.0.1'; then ok "aviso de fallo"; else fallo "aviso de fallo"; fi
if sin_secretos "$RAIZ"; then ok "sin secretos en la salida"; else fallo "sin secretos en la salida"; fi

echo "6. Migración que falla: reversión"
preparar v1.0.0
SIM_FALLA_MIGRAR=1 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 1 ] && grep -qx 'ZYDESK_VERSION=v1.0.0' "$RAIZ/.env"; then ok "salida 1 y versión anterior"; else fallo "salida 1 y versión anterior"; fi
registro "$RAIZ" | grep -q 'up -d --remove-orphans' && ok "levanta la versión anterior" || fallo "levanta la versión anterior"

echo "7. Reversión que también falla: salida 5"
preparar v1.0.0
SIM_FALLA_MIGRAR=1 SIM_SALUD_MALA=v1.0.0 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 5 ]; then ok "salida 5"; else fallo "salida 5"; fi

echo "8. Respaldo previo que falla: salida 4 sin desplegar"
preparar v1.0.0
SIM_FALLA_DUMP=1 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 4 ]; then ok "salida 4"; else fallo "salida 4"; fi
registro "$RAIZ" | grep -Eq 'fetch|checkout|pull|stop|migrar|up -d' && fallo "no debe tocar git ni contenedores" || ok "sin git ni contenedores"
if grep -qx 'ZYDESK_VERSION=v1.0.0' "$RAIZ/.env"; then ok ".env intacto"; else fallo ".env intacto"; fi
# shellcheck disable=SC2012
if [ "$(ls "$RAIZ"/datos/respaldos/pre-despliegue/ 2>/dev/null | wc -l)" -eq 0 ]; then ok "no queda un volcado a medias"; else fallo "no queda un volcado a medias"; fi

echo "9. Etiqueta inexistente: salida 6 sin tocar contenedores"
preparar v1.0.0
SIM_ETIQUETA_INEXISTENTE=v9.9.9 ejecutar "$RAIZ" v9.9.9 ssh
if [ "$CODIGO" -eq 6 ]; then ok "salida 6"; else fallo "salida 6"; fi
registro "$RAIZ" | grep -Eq 'pull|stop|migrar|up -d' && fallo "no debe tocar contenedores" || ok "sin contenedores"

echo "10. Clon con cambios locales: salida 6"
preparar v1.0.0
SIM_REPO_SUCIO=1 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 6 ]; then ok "salida 6"; else fallo "salida 6"; fi

echo "11. Otro despliegue en curso: salida 3"
preparar v1.0.0
SIM_BLOQUEADO=1 ejecutar "$RAIZ" v1.0.1 ssh
if [ "$CODIGO" -eq 3 ]; then ok "salida 3"; else fallo "salida 3"; fi

echo "12. Sin token de Telegram no hay aviso"
preparar v1.0.0
sed -i '/^TELEGRAM_/d' "$RAIZ/.env"
ejecutar "$RAIZ" v1.0.1 ssh
registro "$RAIZ" | grep -q '^curl' && fallo "no debe llamar a curl" || ok "sin curl"
verifica "despliega igual" "$CODIGO"

if [ "$FALLOS" -ne 0 ]; then
  echo "$FALLOS de $TOTAL comprobaciones fallaron"
  exit 1
fi
echo "desplegar.test.sh: $TOTAL comprobaciones en orden"
