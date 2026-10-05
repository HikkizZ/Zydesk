#!/bin/sh
# Entrada de la imagen de la API (Fase 9, §4.1): atajos al CLI de base de datos.
#   docker compose run --rm zydesk-api migrar
#   docker compose run --rm zydesk-api demo --reiniciar
# Cualquier otro comando se ejecuta tal cual (por defecto, el servidor).
set -eu

case "${1:-}" in
  migrar | demo | admin)
    exec node apps/api/dist/database/cli.js "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
