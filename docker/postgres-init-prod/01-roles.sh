#!/bin/sh
# Roles de producción (ADR 0017; Fase 9, spec §5.2). La imagen de Postgres lo ejecuta SOLO al crear el volumen de datos.
# Las contraseñas llegan por entorno (ZYDESK_OWNER_PASSWORD, ZYDESK_APP_PASSWORD) y entran a psql con \getenv: nunca van
# en la línea de comandos ni interpoladas en el texto del SQL. No crea ninguna base de test.
# Para rotar contraseñas con el volumen ya creado: ALTER ROLE … PASSWORD … a mano (docs/despliegue.md).
set -eu

: "${POSTGRES_USER:?falta POSTGRES_USER}"
: "${POSTGRES_DB:?falta POSTGRES_DB}"
: "${ZYDESK_OWNER_PASSWORD:?falta ZYDESK_OWNER_PASSWORD}"
: "${ZYDESK_APP_PASSWORD:?falta ZYDESK_APP_PASSWORD}"

PERMISOS_SQL="${PERMISOS_SQL:-/zydesk/permisos.sql}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
\getenv owner_pwd ZYDESK_OWNER_PASSWORD
\getenv app_pwd ZYDESK_APP_PASSWORD
\getenv BD POSTGRES_DB
CREATE ROLE zydesk_owner LOGIN PASSWORD :'owner_pwd';
CREATE ROLE zydesk_app LOGIN PASSWORD :'app_pwd';
\i $PERMISOS_SQL
SQL
