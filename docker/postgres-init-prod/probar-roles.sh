#!/bin/bash
# shellcheck disable=SC2015  # «cond && ok || fallo»: ok y fallo nunca fallan, es el patrón de los asertos
# Prueba de humo de 01-roles.sh (spec fase 9 §5.2 y §9.3) contra un postgres:16-alpine efímero. Sin Docker Compose.
# Uso: bash docker/postgres-init-prod/probar-roles.sh   (desde la raíz del repo)
# Las contraseñas llevan comillas y símbolos a propósito: prueban que no se interpolan en el SQL.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash en Windows: no convertir las rutas de los montajes de Docker

IMAGEN="postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea"
CONTENEDOR="zydesk-prueba-roles-$$"
DIR="$(cd "$(dirname "$0")" && pwd)"
OWNER_PWD="Ow'ner\"pw\$1;x"
APP_PWD="Ap'p\"pw\$2;y"
FALLOS=0

limpiar() { docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true; }
trap limpiar EXIT

ok() { echo "  ok  $1"; }
fallo() { echo "  FALLA  $1"; FALLOS=$((FALLOS + 1)); }

# psql como un rol de la app por TCP (exige contraseña); devuelve 0 si la sentencia se ejecuta
como() {
  local rol="$1" pwd="$2" sql="$3"
  docker exec -e PGPASSWORD="$pwd" "$CONTENEDOR" psql -h "$IP" -U "$rol" -d zydesk -v ON_ERROR_STOP=1 -qtAc "$sql" >/dev/null 2>&1
}

docker run -d --name "$CONTENEDOR" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=superusuario-de-prueba -e POSTGRES_DB=zydesk \
  -e ZYDESK_OWNER_PASSWORD="$OWNER_PWD" -e ZYDESK_APP_PASSWORD="$APP_PWD" \
  -v "$DIR/01-roles.sh:/docker-entrypoint-initdb.d/01-roles.sh:ro" \
  -v "$DIR/permisos.sql:/zydesk/permisos.sql:ro" \
  "$IMAGEN" >/dev/null

echo "Esperando a que Postgres termine el arranque inicial…"
for _ in $(seq 1 60); do
  if docker logs "$CONTENEDOR" 2>&1 | grep -q "init process complete" \
    && docker exec "$CONTENEDOR" pg_isready -h 127.0.0.1 -U postgres -d zydesk >/dev/null 2>&1; then
    LISTO=1
    break
  fi
  sleep 1
done
if [ "${LISTO:-0}" != 1 ]; then
  echo "Postgres no arrancó:"
  docker logs "$CONTENEDOR" 2>&1 | tail -20
  exit 1
fi

IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTENEDOR")"  # por la IP del contenedor: en loopback la imagen usa trust
echo "Roles de producción"
como zydesk_owner "$OWNER_PWD" "SELECT 1" && ok "zydesk_owner entra con su contraseña" || fallo "zydesk_owner entra con su contraseña"
como zydesk_app "$APP_PWD" "SELECT 1" && ok "zydesk_app entra con su contraseña" || fallo "zydesk_app entra con su contraseña"
como zydesk_app "$OWNER_PWD" "SELECT 1" && fallo "zydesk_app no debe entrar con la contraseña del owner" || ok "zydesk_app rechaza la contraseña del owner"
como zydesk_app "$APP_PWD" "CREATE SCHEMA pgboss" && ok "zydesk_app puede CREATE SCHEMA pgboss (pg-boss)" || fallo "zydesk_app puede CREATE SCHEMA pgboss"
como zydesk_app "$APP_PWD" "CREATE TABLE public.intruso (id int)" && fallo "zydesk_app no debe crear tablas en public" || ok "zydesk_app no puede CREATE TABLE en public"
como zydesk_owner "$OWNER_PWD" "CREATE TABLE public.prueba (id int)" && ok "zydesk_owner puede CREATE TABLE en public" || fallo "zydesk_owner puede CREATE TABLE en public"
como zydesk_app "$APP_PWD" "INSERT INTO public.prueba VALUES (1); UPDATE public.prueba SET id = 2; DELETE FROM public.prueba" \
  && ok "zydesk_app hereda DML sobre las tablas del owner (default privileges)" || fallo "zydesk_app hereda DML sobre las tablas del owner"
[ "$(docker exec "$CONTENEDOR" psql -U postgres -d postgres -qtAc "SELECT count(*) FROM pg_database WHERE datname = 'zydesk_test'")" = "0" ] \
  && ok "no existe zydesk_test" || fallo "no debe existir zydesk_test"
[ "$(docker exec "$CONTENEDOR" psql -U postgres -d postgres -qtAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'zydesk'")" = "zydesk_owner" ] \
  && ok "la base zydesk es de zydesk_owner" || fallo "la base zydesk es de zydesk_owner"

if [ "$FALLOS" -ne 0 ]; then
  echo "$FALLOS comprobaciones fallaron"
  exit 1
fi
echo "01-roles.sh: todo en orden"
