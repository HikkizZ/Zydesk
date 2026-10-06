#!/bin/bash
# shellcheck disable=SC2015  # «cond && ok || fallo»: ok y fallo nunca fallan, es el patrón de los asertos
# Ensayo local de respaldo y restauración (spec fase 9 §8.3). NO es para el VPS: levanta el docker-compose.yml de la
# raíz con un .env de prueba, un directorio de datos temporal y una red `web` ad hoc, carga la demo, respalda con
# respaldar.sh, destruye la base y los archivos, restaura con restaurar.sh y compara conteos y hashes.
#
#   docker/vps/ensayar-restauracion.sh
#
# Requisitos (Linux o WSL; en Windows, dentro de un contenedor o WSL): docker con compose, age, zstd, flock, tar y
# sha256sum, y poder usar chown (root o sudo). Las imágenes se toman de zydesk-{api,web,bot}:prueba (docker/probar-imagenes.sh
# las construye) o se construyen aquí. Usa el proyecto de Compose `zydesk-ensayo`, nunca el real. Al terminar baja todo.
set -euo pipefail

RAIZ_REPO="$(cd "$(dirname "$0")/../.." && pwd)"
VPS="$RAIZ_REPO/docker/vps"
ETIQUETA=v1.0.0-rc.0
PROYECTO=zydesk-ensayo

TMP="$(mktemp -d)"
RAIZ="$TMP/raiz"
DATOS="$TMP/datos"
RED_CREADA=
LISTA_TAGS=()
FALLOS=0
INICIO=$(date +%s)

# Contraseñas de PRUEBA, generadas al vuelo: no son secretos de nadie y no se imprimen
generar() { head -c 24 /dev/urandom | base64 | tr '+/=' 'xyz'; }
PG_PWD="$(generar)"
OWNER_PWD="$(generar)"
APP_PWD="$(generar)"
DEMO_PWD="Demo.$(generar).9"

ok() { echo "  ok  $1"; }
fallo() {
  echo "  FALLA  $1"
  FALLOS=$((FALLOS + 1))
}
tiempo() { echo "      ($(($(date +%s) - $1)) s)"; }

dc() {
  docker compose --project-directory "$RAIZ/repo" -f "$RAIZ/repo/docker-compose.yml" --env-file "$RAIZ/.env" "$@"
}

limpiar() {
  set +e
  if [ -n "${ENSAYO_CONSERVAR:-}" ]; then
    echo "ENSAYO_CONSERVAR: no se limpia nada (proyecto $PROYECTO, datos en $TMP, red web $([ -n "$RED_CREADA" ] && echo creada)); bajar a mano"
    return
  fi
  echo "Limpiando…"
  [ -f "$RAIZ/.env" ] && dc down -v --remove-orphans >/dev/null 2>&1
  [ -n "$RED_CREADA" ] && docker network rm web >/dev/null 2>&1
  for t in "${LISTA_TAGS[@]}"; do docker rmi "$t" >/dev/null 2>&1; done
  rm -rf "$TMP"
}
trap limpiar EXIT

for herramienta in docker age age-keygen zstd flock sha256sum tar; do
  command -v "$herramienta" >/dev/null 2>&1 || {
    echo "falta $herramienta" >&2
    exit 1
  }
done
SUDO=
if [ "$(id -u)" -ne 0 ]; then
  SUDO=sudo
  echo "Nota: no eres root; los pasos con chown usarán sudo y los scripts correrán con ZYDESK_PERMITIR_NO_ROOT."
fi

echo "Preparando imágenes, red y datos temporales ($TMP)"
for s in api web bot; do
  if ! docker image inspect "zydesk-$s:prueba" >/dev/null 2>&1; then
    echo "  construyendo zydesk-$s:prueba (tarda unos minutos)"
    docker build -q -f "$RAIZ_REPO/docker/$s.Dockerfile" -t "zydesk-$s:prueba" "$RAIZ_REPO" >/dev/null
  fi
  docker tag "zydesk-$s:prueba" "ghcr.io/ensayo/zydesk-$s:$ETIQUETA"
  LISTA_TAGS+=("ghcr.io/ensayo/zydesk-$s:$ETIQUETA")
done
if ! docker network inspect web >/dev/null 2>&1; then
  docker network create web >/dev/null
  RED_CREADA=1
fi

mkdir -p "$RAIZ/repo/docker" "$DATOS"
cp "$RAIZ_REPO/docker-compose.yml" "$RAIZ/repo/"
cp -r "$RAIZ_REPO/docker/postgres-init-prod" "$RAIZ/repo/docker/"
$SUDO mkdir -p "$DATOS/postgres" "$DATOS/archivos" "$DATOS/bot" "$DATOS/respaldos"
$SUDO chown 70:70 "$DATOS/postgres"
$SUDO chmod 700 "$DATOS/postgres"
$SUDO chown 1000:1000 "$DATOS/archivos" "$DATOS/bot"
age-keygen -o "$TMP/age.txt" 2>/dev/null
AGE_PUBLICA="$(age-keygen -y "$TMP/age.txt")"

cat >"$RAIZ/.env" <<EOF
COMPOSE_PROJECT_NAME=$PROYECTO
ZYDESK_VERSION=$ETIQUETA
GHCR_OWNER=ensayo
DATOS_DIR=$DATOS
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PG_PWD
POSTGRES_DB=zydesk
ZYDESK_OWNER_PASSWORD=$OWNER_PWD
ZYDESK_APP_PASSWORD=$APP_PWD
PROXY_SALTOS=3
UF_ACTUALIZAR=false
LOG_LEVEL=info
WEB_URL=https://desk.zytech.dev
ZYDESK_DEMO=true
DEMO_PASSWORD=$DEMO_PWD
RESPALDO_AGE_DESTINATARIO=$AGE_PUBLICA
RESPALDO_RETENCION_LOCAL_DIAS=14
EOF
chmod 600 "$RAIZ/.env"

# Variables que leen respaldar.sh y restaurar.sh (solo para el ensayo)
export ZYDESK_RAIZ="$RAIZ" ZYDESK_LOG_RESPALDO="$TMP/respaldo.log" ZYDESK_BLOQUEO_RESPALDO="$TMP/respaldo.lock"
export RESPALDO_AGE_CLAVE="$TMP/age.txt"
[ -n "$SUDO" ] && export ZYDESK_PERMITIR_NO_ROOT=1

psql_bd() { dc exec -T zydesk-db psql -U postgres -d zydesk -qtAX "$@"; }

esperar_salud() {
  for _ in $(seq 1 40); do
    if dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud 2>/dev/null | grep -q '"estado":"ok"'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

conteos() {
  psql_bd -c "SELECT 'usuario', count(*) FROM usuario UNION ALL SELECT 'ticket', count(*) FROM ticket
    UNION ALL SELECT 'ot', count(*) FROM ot UNION ALL SELECT 'cotizacion', count(*) FROM cotizacion
    UNION ALL SELECT 'registro_horas', count(*) FROM registro_horas UNION ALL SELECT 'aviso', count(*) FROM aviso
    UNION ALL SELECT 'archivo', count(*) FROM archivo UNION ALL SELECT 'evento', count(*) FROM evento
    UNION ALL SELECT 'auditoria', count(*) FROM auditoria UNION ALL SELECT 'indicador_uf', count(*) FROM indicador_uf"
}

hashes() { (cd "$DATOS/archivos" && $SUDO find . -type f -print0 | sort -z | xargs -0 -r $SUDO sha256sum); }

echo "1. Base de datos desde cero (01-roles.sh crea los roles)"
T=$(date +%s)
dc up -d --wait zydesk-db
roles="$(psql_bd -c "SELECT string_agg(rolname, ',' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'zydesk_%'")"
[ "$roles" = "zydesk_app,zydesk_owner" ] && ok "roles zydesk_owner y zydesk_app" || fallo "roles: $roles"
tiempo "$T"

echo "2. Migraciones (rol owner)"
T=$(date +%s)
dc run --rm --no-deps zydesk-herramientas migrar 2>&1 | grep -E 'migraciones aplicadas' || true
tiempo "$T"

echo "3. Servicios y salud"
T=$(date +%s)
dc up -d
esperar_salud && ok "/api/salud responde ok" || fallo "/api/salud no respondió"
[ "$(dc config | grep -c published || true)" = 0 ] && ok "sin puertos publicados" || fallo "hay puertos publicados"
tiempo "$T"

echo "4. Datos de la demo"
T=$(date +%s)
dc run --rm --no-deps -e ZYDESK_DEMO=true -e ZYDESK_DEMO_CONFIRMAR=zydesk zydesk-herramientas demo --reiniciar 2>&1 | tail -3
tiempo "$T"
ANTES_CONTEOS="$(conteos)"
ANTES_HASHES="$(hashes)"
echo "$ANTES_CONTEOS" | tr '\n' ' '
echo
N_ARCHIVOS="$(echo "$ANTES_HASHES" | grep -c . || true)"
[ "$N_ARCHIVOS" -gt 0 ] && ok "$N_ARCHIVOS archivos en disco" || fallo "la demo no dejó archivos en disco"

echo "5. Respaldo (respaldar.sh)"
T=$(date +%s)
"$VPS/respaldar.sh"
# shellcheck disable=SC2012
RESPALDO="$(ls -1 "$DATOS"/respaldos/respaldo-*.tar.age | head -n 1)"
[ -n "$RESPALDO" ] && ok "respaldo cifrado: $(basename "$RESPALDO") ($(du -h "$RESPALDO" | cut -f1))" || fallo "no hay respaldo"
if age -d -i /dev/null "$RESPALDO" >/dev/null 2>&1; then fallo "el respaldo se abrió sin la clave"; else ok "el respaldo no se abre sin la clave"; fi
[ -z "$(ls -d "$DATOS"/respaldos/tmp-* 2>/dev/null)" ] && ok "sin material sin cifrar en disco" || fallo "quedó un tmp-*"
tiempo "$T"

echo "6. Destruir la base y los archivos"
dc down >/dev/null 2>&1
$SUDO rm -rf "$DATOS/postgres" "$DATOS/archivos"
$SUDO mkdir -p "$DATOS/postgres" "$DATOS/archivos"
$SUDO chown 70:70 "$DATOS/postgres"
$SUDO chmod 700 "$DATOS/postgres"
$SUDO chown 1000:1000 "$DATOS/archivos"
dc up -d --wait zydesk-db
ok "volumen vacío: 01-roles.sh volvió a correr"

echo "7. Restauración (restaurar.sh)"
T=$(date +%s)
printf 'zydesk\n' | "$VPS/restaurar.sh" "$RESPALDO"
tiempo "$T"

echo "8. Comparación"
DESPUES_CONTEOS="$(conteos)"
DESPUES_HASHES="$(hashes)"
[ "$ANTES_CONTEOS" = "$DESPUES_CONTEOS" ] && ok "conteos idénticos" || {
  fallo "los conteos difieren"
  diff <(echo "$ANTES_CONTEOS") <(echo "$DESPUES_CONTEOS") || true
}
[ "$ANTES_HASHES" = "$DESPUES_HASHES" ] && ok "hashes de archivos idénticos" || fallo "los hashes de archivos difieren"
esperar_salud && ok "/api/salud 200" || fallo "/api/salud tras restaurar"

ARCHIVO_ID="$(psql_bd -c "SELECT id FROM archivo ORDER BY creado_en LIMIT 1" 2>/dev/null || psql_bd -c "SELECT id FROM archivo LIMIT 1")"
RESULTADO="$(dc exec -T -e ARCHIVO_ID="$ARCHIVO_ID" zydesk-api node --input-type=module -e '
const base = "http://127.0.0.1:3000";
const h = { "content-type": "application/json", "x-requested-with": "Zydesk", "x-forwarded-proto": "https" };
const r = await fetch(base + "/api/auth/ingresar", { method: "POST", headers: h,
  body: JSON.stringify({ correo: "phidalgo@demo.zytech.dev", contrasena: process.env.DEMO_PASSWORD }) });
const cookies = r.headers.getSetCookie();
const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
const sesion = cookies.find((c) => c.startsWith("__Host-sesion=")) ?? "";
const d = await fetch(base + "/api/archivos/" + process.env.ARCHIVO_ID, { headers: { cookie, "x-forwarded-proto": "https" } });
const bytes = (await d.arrayBuffer()).byteLength;
console.log(JSON.stringify({ ingreso: r.status, cookie_host: /; Secure/.test(sesion) && /HttpOnly/.test(sesion), descarga: d.status, bytes }));
' 2>&1 | tail -1)"
echo "      $RESULTADO"
echo "$RESULTADO" | grep -q '"ingreso":200' && ok "ingreso con una cuenta de la demo" || fallo "ingreso con una cuenta de la demo"
echo "$RESULTADO" | grep -q '"cookie_host":true' && ok "cookie __Host-sesion con Secure y HttpOnly" || fallo "cookie __Host-sesion"
echo "$RESULTADO" | grep -Eq '"descarga":200,"bytes":[1-9]' && ok "descarga de un archivo (200)" || fallo "descarga de un archivo"

SALIDA_PERMISO="$(dc exec -T zydesk-db psql -U zydesk_app -d zydesk -qtAX -c "UPDATE evento SET entidad = entidad WHERE false" 2>&1 || true)"
echo "$SALIDA_PERMISO" | grep -qi 'permission denied' && ok "UPDATE evento como zydesk_app: permission denied" || fallo "zydesk_app puede actualizar evento: $SALIDA_PERMISO"
SALIDA_PERMISO="$(dc exec -T zydesk-db psql -U zydesk_app -d zydesk -qtAX -c "DELETE FROM auditoria WHERE false" 2>&1 || true)"
echo "$SALIDA_PERMISO" | grep -qi 'permission denied' && ok "DELETE auditoria como zydesk_app: permission denied" || fallo "zydesk_app puede borrar auditoria: $SALIDA_PERMISO"
SALIDA_PERMISO="$(dc exec -T zydesk-db psql -U zydesk_app -d zydesk -qtAX -c "CREATE TABLE public.intruso (id int)" 2>&1 || true)"
echo "$SALIDA_PERMISO" | grep -qi 'permission denied' && ok "CREATE TABLE como zydesk_app: permission denied" || fallo "zydesk_app puede crear tablas: $SALIDA_PERMISO"

echo
echo "Total: $(($(date +%s) - INICIO)) s"
if [ "$FALLOS" -ne 0 ]; then
  echo "$FALLOS comprobaciones fallaron"
  exit 1
fi
echo "Ensayo de restauración: todo en orden"
