#!/bin/sh
# Preparación del VPS para Zydesk (spec fase 9 §5.4; §19 B1 y B2). La revisa y la corre el usuario, como root, UNA vez
# (es idempotente: se puede repetir). No se conecta a GitHub ni a Docker Hub y no toca la configuración de otros
# proyectos ni el Postgres de Nexus. Cada acción se imprime.
#
#   sudo ./instalar-vps.sh --llave /ruta/zydesk-deploy.pub
#
# --llave: archivo con la clave PÚBLICA ssh-ed25519 del CD (una línea). Se instala restringida a desplegar.sh.
#
# Lo que hace: instala age, rclone y shellcheck con apt (si faltan) · crea el usuario zydesk-deploy (sin contraseña, sin
# sudo, grupo docker) · crea /srv/apps/zydesk y /srv/data/zydesk/{postgres,archivos,bot,respaldos,logs} con sus dueños ·
# copia los scripts · escribe 05-sin-contrasena.conf (sin contraseñas por SSH, global) y 60-zydesk-deploy.conf, valida
# con `sshd -t` y pide confirmación ANTES de recargar sshd · instala la llave · copia zydesk.conf al proxy de
# nexus-infra si existe esa carpeta (no recarga nginx) · instala los temporizadores de systemd.
# Lo que NO hace: clonar el repo, escribir el .env, crear la ruta del túnel (ver el resumen final).
set -eu

ORIGEN="$(cd "$(dirname "$0")" && pwd)"
APP=/srv/apps/zydesk
DATOS=/srv/data/zydesk
SSHD_DIR=/etc/ssh/sshd_config.d
NEXUS_CONF=/srv/nexus-infra/proxy/conf.d
USUARIO=zydesk-deploy

paso() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
error() { printf 'ERROR: %s\n' "$*" >&2; }

confirmar() {
  printf '%s [s/N] ' "$1"
  read -r respuesta || respuesta=
  case "$respuesta" in s | S | si | SI | Si | sí) return 0 ;; *) return 1 ;; esac
}

# --- Argumentos y requisitos ---
LLAVE_ARCHIVO=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --llave)
      [ "$#" -ge 2 ] || {
        error '--llave necesita un archivo'
        exit 2
      }
      LLAVE_ARCHIVO="$2"
      shift 2
      ;;
    *)
      error "argumento desconocido: $1 (uso: instalar-vps.sh --llave archivo.pub)"
      exit 2
      ;;
  esac
done

[ "$(id -u)" -eq 0 ] || {
  error 'corre como root'
  exit 1
}
[ -n "$LLAVE_ARCHIVO" ] && [ -f "$LLAVE_ARCHIVO" ] || {
  error 'falta --llave con el archivo de la clave pública ssh-ed25519'
  exit 2
}
LLAVE="$(head -n 1 "$LLAVE_ARCHIVO")"
printf '%s\n' "$LLAVE" | grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( [^"]*)?$' || {
  error 'la llave debe ser una línea «ssh-ed25519 AAAA… comentario» (clave PÚBLICA)'
  exit 2
}
for archivo in desplegar.sh respaldar.sh restaurar.sh archivar-logs.sh errores-ayer.sh \
  sshd_zydesk-deploy.conf zydesk.nginx-proxy.conf; do
  [ -f "$ORIGEN/$archivo" ] || {
    error "falta $ORIGEN/$archivo (corre el script desde docker/vps/ del repositorio)"
    exit 1
  }
done
getent group docker >/dev/null || {
  error 'no existe el grupo docker: instala Docker antes'
  exit 1
}

cat <<EOF
Este script solo toca:
  - paquetes age, rclone y shellcheck (apt), si faltan
  - el usuario $USUARIO y su ~/.ssh/authorized_keys
  - $APP y $DATOS
  - $SSHD_DIR/05-sin-contrasena.conf y $SSHD_DIR/60-zydesk-deploy.conf
  - $NEXUS_CONF/zydesk.conf (solo si esa carpeta existe)
  - /etc/systemd/system/zydesk-*.service y zydesk-*.timer
No modifica nada de otros proyectos ni el Postgres de Nexus.
EOF
confirmar '¿Continuar?' || {
  info 'cancelado'
  exit 1
}

# --- 1. Paquetes ---
paso 'Paquetes (age, rclone, shellcheck; zstd y flock ya vienen con el sistema)'
FALTAN=
for paquete in age rclone shellcheck zstd; do
  command -v "$paquete" >/dev/null 2>&1 || FALTAN="$FALTAN $paquete"
done
command -v flock >/dev/null 2>&1 || FALTAN="$FALTAN util-linux"
if [ -n "$FALTAN" ]; then
  info "instalando con apt:$FALTAN"
  apt-get update -qq
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $FALTAN
else
  info 'ya están instalados'
fi

# --- 2. Usuario de despliegue ---
paso "Usuario $USUARIO (sin contraseña, sin sudo, grupo docker)"
if id "$USUARIO" >/dev/null 2>&1; then
  info 'ya existe'
  id -nG "$USUARIO" | tr ' ' '\n' | grep -qx docker || usermod -aG docker "$USUARIO"
else
  # -p '*': sin contraseña válida (no se puede entrar con una), pero la cuenta no queda bloqueada para llaves
  useradd -m -s /bin/sh -G docker -p '*' "$USUARIO"
  info 'creado'
fi

# --- 3. Carpetas y dueños ---
paso 'Carpetas'
install -d -o "$USUARIO" -g "$USUARIO" -m 750 "$APP"
install -d -o root -g root -m 755 "$DATOS"
install -d -o 70 -g 70 -m 700 "$DATOS/postgres"
install -d -o 1000 -g 1000 -m 700 "$DATOS/archivos"
install -d -o 1000 -g 1000 -m 700 "$DATOS/bot"
# respaldos: root escribe; zydesk-deploy solo atraviesa (710) hasta pre-despliegue/, donde desplegar.sh deja el volcado previo
install -d -o root -g "$USUARIO" -m 710 "$DATOS/respaldos"
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$DATOS/respaldos/pre-despliegue"
install -d -o root -g root -m 700 "$DATOS/logs"
info "$APP (750, $USUARIO)"
info "$DATOS/postgres 70:70 · archivos y bot 1000:1000 · respaldos root:$USUARIO 710 · logs root 700"

# --- 4. Scripts ---
paso "Scripts en $APP"
install -o root -g root -m 755 "$ORIGEN/desplegar.sh" "$APP/desplegar.sh"
for script in respaldar.sh restaurar.sh archivar-logs.sh errores-ayer.sh; do
  install -o root -g root -m 700 "$ORIGEN/$script" "$APP/$script"
done
info 'desplegar.sh root:root 755 · respaldar, restaurar, archivar-logs y errores-ayer root:root 700'
info 'para actualizarlos más adelante: volver a correr este script (o copiarlos como root)'

# --- 5. sshd ---
paso 'SSH: sin contraseñas (global) y usuario de despliegue restringido'
[ -d "$SSHD_DIR" ] || {
  error "no existe $SSHD_DIR (¿sshd sin Include?)"
  exit 1
}
RESPALDO_SSHD="$(mktemp -d)"
for f in 05-sin-contrasena.conf 60-zydesk-deploy.conf; do
  if [ -f "$SSHD_DIR/$f" ]; then cp -p "$SSHD_DIR/$f" "$RESPALDO_SSHD/$f"; fi
done
restaurar_sshd() {
  for f in 05-sin-contrasena.conf 60-zydesk-deploy.conf; do
    if [ -f "$RESPALDO_SSHD/$f" ]; then cp -p "$RESPALDO_SSHD/$f" "$SSHD_DIR/$f"; else rm -f "$SSHD_DIR/$f"; fi
  done
}
cat >"$SSHD_DIR/05-sin-contrasena.conf" <<'EOF'
# Zydesk (Fase 9, B2): sin contraseñas por SSH. sshd toma el PRIMER valor y lee los archivos en orden alfabético:
# este va antes que 50-cloud-init.conf (que trae PasswordAuthentication yes).
PasswordAuthentication no
EOF
install -o root -g root -m 644 "$ORIGEN/sshd_zydesk-deploy.conf" "$SSHD_DIR/60-zydesk-deploy.conf"
chmod 644 "$SSHD_DIR/05-sin-contrasena.conf"
info "escrito $SSHD_DIR/05-sin-contrasena.conf y $SSHD_DIR/60-zydesk-deploy.conf"
if ! sshd -t; then
  restaurar_sshd
  error 'sshd -t rechazó la configuración; se restauró lo anterior. No se recargó nada.'
  exit 1
fi
info 'sshd -t: configuración válida'
info 'valor efectivo global:'
sshd -T | grep -i '^passwordauthentication' | sed 's/^/      /'
EFECTIVO="$(sshd -T | sed -n 's/^passwordauthentication //p')"
if [ "$EFECTIVO" != no ]; then
  restaurar_sshd
  error 'PasswordAuthentication sigue en «'"$EFECTIVO"'»: otro archivo anterior en orden alfabético lo fija. Se restauró lo anterior.'
  exit 1
fi
info "valor efectivo para $USUARIO:"
sshd -T -C "user=$USUARIO,host=localhost,addr=127.0.0.1" | grep -Ei '^(passwordauthentication|permittty|forcecommand|allowtcpforwarding) ' | sed 's/^/      /'

# --- 6. Llave de despliegue ---
paso "Llave de $USUARIO (restringida a desplegar.sh)"
install -d -o "$USUARIO" -g "$USUARIO" -m 700 "/home/$USUARIO/.ssh"
AUTORIZADAS="/home/$USUARIO/.ssh/authorized_keys"
LINEA="restrict,command=\"$APP/desplegar.sh\" $LLAVE"
touch "$AUTORIZADAS"
if grep -qxF "$LINEA" "$AUTORIZADAS"; then
  info 'la llave ya estaba instalada'
else
  printf '%s\n' "$LINEA" >>"$AUTORIZADAS"
  info 'llave instalada'
fi
chown "$USUARIO:$USUARIO" "$AUTORIZADAS"
chmod 600 "$AUTORIZADAS"

# --- 7. Proxy de Nexus ---
paso 'nginx-proxy de nexus-infra'
if [ -d "$NEXUS_CONF" ]; then
  if [ -f "$NEXUS_CONF/zydesk.conf" ] && cmp -s "$ORIGEN/zydesk.nginx-proxy.conf" "$NEXUS_CONF/zydesk.conf"; then
    info 'zydesk.conf ya está al día'
  else
    install -o root -g root -m 644 "$ORIGEN/zydesk.nginx-proxy.conf" "$NEXUS_CONF/zydesk.conf"
    info "copiado $NEXUS_CONF/zydesk.conf"
  fi
  info 'NO se recargó nginx-proxy (afecta a otros proyectos). Cuando quieras publicarlo:'
  info '  docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload'
  info '  y haz commit en el repo nexus-infra'
else
  info "no existe $NEXUS_CONF; copia a mano docker/vps/zydesk.nginx-proxy.conf como zydesk.conf en el conf.d de tu proxy"
fi

# --- 8. Temporizadores de systemd ---
paso 'Temporizadores (respaldo 02:30, logs 00:10 y errores 08:00, hora de Santiago)'
if command -v systemctl >/dev/null 2>&1; then
  for u in respaldo logs errores; do
    install -o root -g root -m 644 "$ORIGEN/systemd/zydesk-$u.service" "/etc/systemd/system/zydesk-$u.service"
    install -o root -g root -m 644 "$ORIGEN/systemd/zydesk-$u.timer" "/etc/systemd/system/zydesk-$u.timer"
  done
  systemctl daemon-reload
  systemctl enable --now zydesk-respaldo.timer zydesk-logs.timer zydesk-errores.timer
  info 'activados; próximas ejecuciones: systemctl list-timers "zydesk-*"'
else
  info 'no hay systemctl: instala a mano los .service y .timer de docker/vps/systemd/'
fi

# --- 9. Recargar sshd (con confirmación) ---
paso 'Recargar sshd'
info 'IMPORTANTE: deja ESTA sesión SSH abierta y abre otra para probar que tu llave entra antes de cerrarla.'
info 'Si pierdes todas las llaves, la vía de recuperación es la consola KVM o el modo rescate de OVH.'
if confirmar '¿Recargar sshd ahora?'; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  info 'sshd recargado. Prueba ahora, desde otra terminal, que entras con tu llave.'
else
  info 'no se recargó. Cuando estés listo: systemctl reload ssh'
fi

# --- Resumen ---
cat <<EOF

==> Falta hacer a mano
  1. Clonar el repo como $USUARIO (público, sin credenciales):
       sudo -u $USUARIO git clone https://github.com/HikkizZ/Zydesk.git $APP/repo
  2. Escribir $APP/.env a partir de .env.produccion.example (dueño $USUARIO, chmod 600; secretos con
     openssl rand -base64 32 | tr '+/=' 'xyz') y guardar una copia como nota segura en Bitwarden.
  3. Generar la clave age del respaldo y poner la pública en RESPALDO_AGE_DESTINATARIO del .env:
       install -d -m 700 /root/.config/zydesk && age-keygen -o /root/.config/zydesk/age.txt
     (copia la clave PRIVADA fuera del VPS: sin ella los respaldos no se pueden abrir).
  4. Crear la ruta del túnel (Zero Trust > Conectores > Nexus > Rutas de aplicaciones publicadas):
       desk · zytech.dev · HTTP · nginx-proxy:80
  5. Recargar nginx-proxy y hacer commit en nexus-infra (ver arriba).
  6. Cargar en el environment «produccion» de GitHub: DEPLOY_SSH_KEY (la clave privada), DEPLOY_HOST, DEPLOY_KNOWN_HOSTS.
  7. Probar:  ssh $USUARIO@<host> 'ls /'   ->  debe responder «etiqueta inválida» y nada más.
EOF
