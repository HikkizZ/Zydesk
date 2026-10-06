#!/usr/bin/env bash
# shellcheck disable=SC2015  # «cond && ok || fallo»: ok y fallo nunca fallan, es el patrón de los asertos
# Prueba de humo de las imágenes (Fase 9, §4.5). Sin BD; corre en local (Git Bash/WSL) y en CI.
# Uso: docker/probar-imagenes.sh   (desde cualquier carpeta; construye con la raíz del repo)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
# Git Bash convierte rutas tipo /app en C:/...; se desactiva para los `docker run`
export MSYS_NO_PATHCONV=1

WEB_CONTENEDOR="zydesk-web-prueba-$$"
FALLOS=0

limpiar() { docker rm -f "$WEB_CONTENEDOR" >/dev/null 2>&1 || true; }
trap limpiar EXIT

ok() { echo "  ok    $1"; }
fallo() { echo "  FALLO $1"; FALLOS=$((FALLOS + 1)); }
comprobar() { # descripción, comando...
  local descripcion="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$descripcion"; else fallo "$descripcion"; fi
}

echo "1. Construcción"
for i in api web bot; do
  docker build -q -f "docker/$i.Dockerfile" -t "zydesk-$i:prueba" . >/dev/null && ok "build $i" || { fallo "build $i"; exit 1; }
done

echo "2. Archivos clave de la API"
comprobar "server.js y términos de uso" docker run --rm zydesk-api:prueba \
  node -e "require('fs').accessSync('apps/api/dist/server.js'); require('fs').accessSync('docs/legal/terminos-de-uso.md')"

echo "3. CLI de la API (sin conectar a la BD)"
AYUDA="$(docker run --rm -e DATABASE_URL=postgres://x:y@zydesk-db-inexistente:1/z zydesk-api:prueba node apps/api/dist/database/cli.js --help 2>&1 || true)"
for orden in migrar admin sembrar reiniciar openapi; do
  if grep -q "$orden" <<<"$AYUDA"; then ok "cli lista $orden"; else fallo "cli lista $orden"; fi
done
# (la configuración se valida al importar el CLI, por eso lleva una DATABASE_URL falsa)
# `demo` (bloque 9E) es obligatorio desde F9-T10
comprobar "cli lista demo" grep -q "demo" <<<"$AYUDA"
comprobar "entrypoint: 'migrar' llega al CLI" bash -c \
  "docker run --rm -e DATABASE_URL=postgres://x:y@zydesk-db-inexistente:1/z zydesk-api:prueba migrar --help 2>&1 | grep -qi 'migraciones'"

echo "4. Usuario sin root"
[ "$(docker run --rm zydesk-api:prueba id -u)" = "1000" ] && ok "api uid 1000" || fallo "api uid 1000"
[ "$(docker run --rm zydesk-web:prueba id -u)" = "101" ] && ok "web uid 101" || fallo "web uid 101"
[ "$(docker run --rm zydesk-bot:prueba id -u)" = "1000" ] && ok "bot uid 1000" || fallo "bot uid 1000"

echo "5. La API termina si no hay base de datos"
SALIDA="$(docker run --rm -e DATABASE_URL=postgres://x:y@zydesk-db-inexistente:1/z zydesk-api:prueba \
  node apps/api/dist/server.js 2>&1)" && CODIGO=0 || CODIGO=$?
if [ "$CODIGO" -ne 0 ] && grep -q "no se pudo conectar a la base de datos" <<<"$SALIDA"; then
  ok "salida $CODIGO con el log esperado"
else
  fallo "la API debía salir con error y el log «no se pudo conectar a la base de datos» (código $CODIGO)"
  echo "$SALIDA" | tail -5
fi

echo "6. Web (nginx, cabeceras y rutas)"
PUERTO=18080
docker run -d --name "$WEB_CONTENEDOR" -p "$PUERTO:8080" zydesk-web:prueba >/dev/null
for _ in $(seq 1 20); do curl -sf "localhost:$PUERTO/salud-web" >/dev/null 2>&1 && break; sleep 1; done
CABECERAS="$(curl -sI "localhost:$PUERTO/")"
grep -qi '^Content-Security-Policy:' <<<"$CABECERAS" && ok "CSP presente" || fallo "CSP presente"
grep -qi '^X-Frame-Options: DENY' <<<"$CABECERAS" && ok "X-Frame-Options DENY" || fallo "X-Frame-Options DENY"
grep -qiE '^Server: nginx/[0-9]' <<<"$CABECERAS" && fallo "Server no debe mostrar la versión" || ok "Server sin versión"
curl -s "localhost:$PUERTO/ayuda" | grep -qi '<div id="root"' && ok "/ayuda devuelve index.html" || fallo "/ayuda devuelve index.html"
[ "$(curl -s "localhost:$PUERTO/salud-web")" = "ok" ] && ok "/salud-web" || fallo "/salud-web"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:$PUERTO/assets/")" = "404" ] && ok "/assets/ sin listado (404)" || fallo "/assets/ sin listado (404)"
limpiar

echo "7. Tamaños (indicativos: se anotan, no bloquean)"
for par in api:350 web:60 bot:200; do
  i="${par%%:*}"; tope="${par##*:}"
  mb=$(( $(docker image inspect "zydesk-$i:prueba" --format '{{.Size}}') / 1000000 ))
  echo "  zydesk-$i: ${mb} MB (referencia <= ${tope} MB)"
done

echo "8. Contenido de la imagen de la API"
comprobar "sin .env, sin src y sin manuales" docker run --rm zydesk-api:prueba \
  sh -c 'ls /app; test ! -e /app/.env; test ! -d /app/apps/api/src; test ! -d /app/docs/manuales'
comprobar "archivos de ejemplo de la demo en la imagen" docker run --rm zydesk-api:prueba \
  sh -c 'test -s /app/apps/api/dist/database/semillas/demo/archivos/foto-rack-rancagua.png && ls /app/apps/api/dist/database/semillas/demo/archivos | grep -q ".eml$"'

echo
if [ "$FALLOS" -eq 0 ]; then echo "Imágenes: todo verde"; else echo "Imágenes: $FALLOS fallo(s)"; exit 1; fi
