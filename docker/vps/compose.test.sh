#!/bin/bash
# shellcheck disable=SC2015  # «cond && ok || fallo»: ok y fallo nunca fallan, es el patrón de los asertos
# Pruebas del docker-compose.yml de producción (ADR 0031): la API de larga vida no lleva las credenciales del dueño de la
# base ni las contraseñas de las cuentas; solo el servicio `zydesk-herramientas`. Necesita `docker compose` (no Docker en
# marcha). Uso: bash docker/vps/compose.test.sh
set -u

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
FALLOS=0
ok() { echo "  ok    $1"; }
fallo() { echo "  FALLA $1"; FALLOS=$((FALLOS + 1)); }

ENV_PRUEBA="$(mktemp)"
trap 'rm -f "$ENV_PRUEBA"' EXIT
cat >"$ENV_PRUEBA" <<'ENV'
GHCR_OWNER=prueba
ZYDESK_VERSION=v0.0.0
POSTGRES_PASSWORD=ClavePostgresFalsa123
ZYDESK_OWNER_PASSWORD=ClaveOwnerFalsa456
ZYDESK_APP_PASSWORD=ClaveAppFalsa789
ADMIN_PASSWORD=ClaveAdminFalsa901
DEMO_PASSWORD=ClaveDemoFalsa678
ZYDESK_DEMO=true
ENV

# Con todos los perfiles, para que también se vean `zydesk-herramientas` y `zydesk-bot`
CONFIG="$(docker compose -f "$RAIZ/docker-compose.yml" --env-file "$ENV_PRUEBA" --profile herramientas --profile bot config --format json 2>&1)" || {
  echo "$CONFIG"
  fallo "docker compose config falló"
  exit 1
}
ok "docker compose config valida"

# Extrae con node (ya requerido por el repo): servicio, campo → JSON
consulta() { printf '%s' "$CONFIG" | node -e '
  const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const f = new Function("c", "return " + process.argv[1]);
  process.stdout.write(String(f(c)));' "$1"; }

API_ENV="$(consulta 'JSON.stringify(c.services["zydesk-api"].environment)')"
case "$API_ENV" in *zydesk_owner*) fallo "zydesk-api no debe llevar zydesk_owner" ;; *) ok "zydesk-api sin zydesk_owner" ;; esac
case "$API_ENV" in *ClaveOwnerFalsa456*) fallo "zydesk-api no debe llevar la contraseña del owner" ;; *) ok "zydesk-api sin la contraseña del owner" ;; esac
[ "$(consulta '"DATABASE_URL_OWNER" in c.services["zydesk-api"].environment')" = false ] && ok "zydesk-api sin DATABASE_URL_OWNER" || fallo "zydesk-api sin DATABASE_URL_OWNER"
for v in ADMIN_PASSWORD DEMO_PASSWORD ZYDESK_DEMO; do
  [ "$(consulta "\"$v\" in c.services[\"zydesk-api\"].environment")" = false ] && ok "zydesk-api sin $v" || fallo "zydesk-api sin $v"
done

for v in DATABASE_URL_OWNER ADMIN_PASSWORD DEMO_PASSWORD ZYDESK_DEMO; do
  [ "$(consulta "\"$v\" in c.services[\"zydesk-herramientas\"].environment")" = true ] && ok "zydesk-herramientas con $v" || fallo "zydesk-herramientas con $v"
done
[ "$(consulta 'c.services["zydesk-herramientas"].profiles.join()')" = herramientas ] && ok "zydesk-herramientas en el perfil herramientas" || fallo "zydesk-herramientas en el perfil herramientas"
[ "$(consulta 'c.services["zydesk-herramientas"].restart || "sin"')" = sin ] && ok "zydesk-herramientas sin restart" || fallo "zydesk-herramientas sin restart"
[ "$(consulta 'c.services["zydesk-herramientas"].image === c.services["zydesk-api"].image')" = true ] && ok "misma imagen que la API" || fallo "misma imagen que la API"
[ "$(consulta 'c.services["zydesk-herramientas"].read_only && c.services["zydesk-herramientas"].cap_drop.includes("ALL")')" = true ] && ok "zydesk-herramientas endurecido" || fallo "zydesk-herramientas endurecido"
[ "$(consulta 'JSON.stringify(c.services["zydesk-herramientas"].networks)')" = '{"interna":null}' ] && ok "zydesk-herramientas solo en interna" || fallo "zydesk-herramientas solo en interna"

for s in zydesk-db zydesk-api zydesk-web zydesk-bot zydesk-herramientas; do
  [ "$(consulta "c.services[\"$s\"].mem_limit > 0 && c.services[\"$s\"].pids_limit > 0")" = true ] && ok "$s con mem_limit y pids_limit" || fallo "$s con mem_limit y pids_limit"
  [ "$(consulta "c.services[\"$s\"].deploy ? 'si' : 'no'")" = no ] && ok "$s sin deploy.resources" || fallo "$s sin deploy.resources"
done

# Sin el perfil `herramientas`, `up` no levanta el servicio
SERVICIOS="$(docker compose -f "$RAIZ/docker-compose.yml" --env-file "$ENV_PRUEBA" config --services 2>&1)"
case "$SERVICIOS" in *herramientas*) fallo "zydesk-herramientas no debe levantarse con up" ;; *) ok "zydesk-herramientas no aparece sin su perfil" ;; esac

echo
[ "$FALLOS" -eq 0 ] && echo "compose.test.sh: todo bien" || { echo "compose.test.sh: $FALLOS fallos"; exit 1; }
