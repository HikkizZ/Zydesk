# Guía de instalación de Zydesk (producción)

> Esta guía describe la **instalación definitiva**: la que hará la empresa en su propia infraestructura, con datos reales. En la Fase 9 (v1.0.0) no se ejecutó en ninguna infraestructura real: se ensayó en local y en la demo (`docs/demo.md`), con tres despliegues `rc` por CD. Quedan por ensayar con datos reales de la demo la restauración de un respaldo y la vuelta atrás por CD (`docs/demo.md` §9 y §10).
>
> Fuentes: `docs/specs/fase-9.md` §3, §5–§10 y §15.1; ADR 0001, 0009, 0017, 0020, 0027, 0031 y 0032. Cuando esta guía y un script difieran, manda el script: `docker-compose.yml`, `.env.produccion.example`, `docker/vps/*.sh` y `docker/vps/README.md`.

La guía es **portátil**: no supone nada del servidor salvo Linux con Docker y un reverse proxy con TLS delante. Donde algo es propio del VPS de Nexus (la red externa `web`, el túnel de Cloudflare, `nexus-infra`), se dice y se explica cómo reemplazarlo.

## Índice

1. [Requisitos](#1-requisitos)
2. [Arquitectura](#2-arquitectura)
3. [Preparar el servidor](#3-preparar-el-servidor)
4. [Variables y secretos](#4-variables-y-secretos)
5. [Primer arranque y carga de datos reales](#5-primer-arranque-y-carga-de-datos-reales)
6. [Actualizar y volver atrás](#6-actualizar-y-volver-atrás)
7. [Respaldos y restauración](#7-respaldos-y-restauración)
8. [Operación diaria](#8-operación-diaria)
9. [Qué hacer si](#9-qué-hacer-si)
10. [Mudanza desde la demo y apagado](#10-mudanza-desde-la-demo-y-apagado)

## 1. Requisitos

**Servidor.**

- Linux x86-64 con systemd (los scripts se probaron en Ubuntu). Docker 27 o superior con Compose v2 (`docker compose version`).
- 2 vCPU, 4 GB de RAM y 40 GB de disco como mínimo. Los datos viven en una sola carpeta (`DATOS_DIR`, por defecto `/srv/data/zydesk`): base de datos, archivos de tickets, datos del bot, respaldos y logs archivados.
- Un usuario con `sudo`. SSH solo con llave (la guía deja `PasswordAuthentication no` global).
- Herramientas: `age`, `rclone`, `zstd`, `flock`, `git`, `curl`. `instalar-vps.sh` instala con `apt` las que falten.

**Red.**

- Un dominio propio (por ejemplo `desk.empresa.cl`) con TLS terminado **delante** de Zydesk: Cloudflare Tunnel o un reverse proxy con certificado (sección 2).
- Salida a internet desde el servidor hacia: `ghcr.io` (imágenes), `api.telegram.org` (bot y avisos, opcional), Boostr y mindicador.cl (valor de la UF) y el destino remoto de los respaldos.
- Ningún puerto de Zydesk se publica en el servidor. Solo el 22 (SSH) y lo que necesite el proxy.

**Cuentas.**

- Acceso al repositorio público `HikkizZ/Zydesk` en GitHub. Las imágenes se descargan de `ghcr.io/hikkizz/zydesk-{api,web,bot}` sin credenciales. Si la empresa usa un fork, cambia `GHCR_OWNER` en el `.env` y la URL del clon.
- Opcional: un bot de Telegram propio (BotFather) y un chat para los avisos de operación.
- Un destino de respaldos fuera del servidor (Backblaze B2, Cloudflare R2, S3, SFTP; cualquier remoto de `rclone`). Es obligatorio antes de cargar datos reales (sección 7).

## 2. Arquitectura

Cuatro contenedores en un solo `docker-compose.yml` (raíz del repo), proyecto `zydesk`:

| Servicio     | Imagen                                  | Redes            | Qué hace                                                                                             |
| ------------ | --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `zydesk-db`  | `postgres:16-alpine` (por digest)       | `interna`        | Base de datos. Roles `zydesk_owner` (migraciones) y `zydesk_app` (la API). Datos en `postgres/`.     |
| `zydesk-api` | `ghcr.io/<owner>/zydesk-api:<etiqueta>` | `interna`        | API Express en el puerto 3000 interno, con los jobs (`EJECUTAR_JOBS=true`). Archivos en `archivos/`. |
| `zydesk-herramientas` | `ghcr.io/<owner>/zydesk-api:<etiqueta>` | `interna` | Misma imagen que la API, perfil `herramientas` (no arranca con `up`): `migrar`, `admin` y `demo` con el rol `zydesk_owner`. La API no lleva esas credenciales (ADR 0031). |
| `zydesk-web` | `ghcr.io/<owner>/zydesk-web:<etiqueta>` | `interna`, `web` | nginx sin privilegios en el **8080**: sirve la web y reenvía `/api/` a `zydesk-api:3000`.            |
| `zydesk-bot` | `ghcr.io/<owner>/zydesk-bot:<etiqueta>` | `interna`        | Bot de Telegram (perfil `bot`: solo se levanta con `COMPOSE_PROFILES=bot`). Datos en `bot/`.         |

Reglas que el Compose ya cumple: ningún `ports:`; `api`, `web` y `bot` corren sin root, con `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `tmpfs` para `/tmp` (256 MB en la API: ahí caen las subidas en curso) y `mem_limit`/`pids_limit` por servicio; logs `json-file` con rotación 20 MB × 10 por servicio; la API y el bot reciben del `.env` **solo** las variables que usan, y las credenciales del dueño de la base (`DATABASE_URL_OWNER`), `ADMIN_PASSWORD` y las variables de la demo solo las recibe `zydesk-herramientas` durante un `run --rm` (ADR 0031); una sola réplica de la API. `bash docker/vps/compose.test.sh` lo comprueba (también en CI).

### 2.1 Cadena con Cloudflare Tunnel (la de la demo)

```
Navegador ──TLS──▶ Cloudflare (Access opcional) ──▶ cloudflared ──▶ reverse proxy (nginx-proxy:80, red `web`)
         ──▶ zydesk-web:8080 ──▶ zydesk-api:3000 ──▶ zydesk-db:5432
```

Dentro del servidor todo es HTTP en redes privadas de Docker. Tres saltos escriben `X-Forwarded-For` (`cloudflared`, el proxy y `zydesk-web`): **`PROXY_SALTOS=3`**. La IP real del cliente llega en `CF-Connecting-IP`; la API la prefiere (ADR 0013). El proxy debe reenviar `X-Forwarded-Proto` **tal como lo fijó Cloudflare** (`$http_x_forwarded_proto`), no `$scheme`: el túnel llega por HTTP y `$scheme` reescribiría `https` como `http`, y la cookie `__Host-sesion` (`Secure`) dejaría de guardarse.

La configuración de referencia del proxy es `docker/vps/zydesk.nginx-proxy.conf`: `listen 80`, `server_name`, `client_max_body_size 25m`, `resolver 127.0.0.11`, `proxy_pass http://zydesk-web:8080` por variable y las cabeceras `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` y `CF-Connecting-IP`.

### 2.2 Variante sin Cloudflare: proxy propio con TLS

Un reverse proxy en un contenedor (Caddy, o nginx + certbot) unido a la red `web`, con el certificado del dominio. Parte de `docker/vps/zydesk.nginx-proxy.conf` y cambia solo esto:

- `listen 443 ssl` con el certificado, y una redirección de `80` a `https`.
- `proxy_set_header X-Forwarded-Proto https;` (valor fijo: aquí el proxy sí termina TLS).
- Quita `proxy_set_header CF-Connecting-IP …`: sin esa cabecera la API usa `X-Forwarded-For`.
- `PROXY_SALTOS=2` en el `.env` (el proxy y `zydesk-web`).

Con Caddy basta `reverse_proxy zydesk-web:8080` dentro del bloque del dominio: Caddy fija `X-Forwarded-Proto` y `X-Forwarded-For` por su cuenta. En ambos casos conserva el límite de cuerpo de 25 MB (subidas de 20 MB más el multipart, ADR 0009).

### 2.3 La red externa `web`

`docker-compose.yml` declara `web` como red **externa**: debe existir antes de levantar el stack. En Nexus es la red de `nginx-proxy`. En otra infraestructura:

```sh
docker network create web
```

y conecta a ella el contenedor del reverse proxy (`docker network connect web <proxy>` o `networks: [web]` en su propio Compose). Si el proxy corre **en el host** (fuera de Docker), el Compose actual no sirve tal cual: no publica puertos. Publicar `zydesk-web:8080` en `127.0.0.1` exige cambiar el Compose, y eso es una decisión que debe registrarse (ADR) antes de hacerse.

### 2.4 Cloudflare Access (recomendado en la instalación definitiva)

Cloudflare Access pone un segundo factor **delante** de la aplicación sin código en la app (ADR 0018, pregunta E1 resuelta): una aplicación Access sobre el dominio con una política «Allow» para la lista de correos del equipo (OTP por correo) y sesión de 24 h. La demo **no** lo activa (riesgo aceptado, `docs/demo.md`); en la instalación definitiva es la recomendación, o una decisión explícita de la empresa si se prescinde de él.

Consecuencias: `https://<dominio>/api/salud` desde fuera responde `302` a Access; un monitor externo necesita una **Service Token** de Access (cabeceras `CF-Access-Client-Id` / `CF-Access-Client-Secret`) o se monitorea desde dentro (sección 8). El bot no se ve afectado: habla con la API por la red interna.

## 3. Preparar el servidor

### 3.1 Estructura

```
/srv/apps/zydesk/                 zydesk-deploy:zydesk-deploy 750
├── .env                          zydesk-deploy 600 (de .env.produccion.example)
├── .env.anterior                 lo escribe desplegar.sh (ZYDESK_VERSION previo)
├── desplegar.sh                  root:root 755 (copia; el despliegue no lo cambia)
├── respaldar.sh · restaurar.sh · archivar-logs.sh · errores-ayer.sh    root:root 700
└── repo/                         clon público de solo lectura, dueño zydesk-deploy
/srv/data/zydesk/                 root 755
├── postgres/                     70:70 700
├── archivos/                     1000:1000 700
├── bot/                          1000:1000 700
├── respaldos/                    root:zydesk-deploy 710
│   └── pre-despliegue/           zydesk-deploy 700 (volcados previos a cada despliegue; se guardan 5)
└── logs/                         root 700 (archivo diario gzip, 30 días)
/root/.config/zydesk/age.txt      600 (clave privada age; copia fuera del servidor obligatoria)
/root/.config/rclone/rclone.conf  600
/etc/ssh/sshd_config.d/05-sin-contrasena.conf · 60-zydesk-deploy.conf
/etc/systemd/system/zydesk-{respaldo,logs,errores}.{service,timer}
```

`zydesk-deploy` es el usuario de servicio que ejecuta el despliegue: sin contraseña, sin `sudo`, en el grupo `docker`, con una llave SSH restringida a `desplegar.sh` (`ForceCommand` + `restrict,command=`). Existe aunque no se use el CD: `desplegar.sh` se niega a correr como root (código 7) y se invoca con `sudo -u zydesk-deploy`.

### 3.2 `instalar-vps.sh`

Lo corre root **una vez** desde `docker/vps/` de un clon del repo (se puede repetir: es idempotente). Léelo antes: imprime cada acción y pide confirmación al principio y antes de recargar `sshd`.

```sh
# En tu equipo: la llave del despliegue (ed25519, sin frase). La privada va al environment `produccion` de GitHub
# si usas el CD; si no, guárdala con el resto de secretos y no la copies al servidor.
ssh-keygen -t ed25519 -f zydesk-deploy -N "" -C zydesk-deploy

# En el servidor, como root, desde docker/vps/ del clon
sudo ./instalar-vps.sh --llave /ruta/zydesk-deploy.pub
```

Qué hace, en orden: instala `age`, `rclone` y `shellcheck` si faltan · crea `zydesk-deploy` · crea las carpetas de 3.1 con sus dueños · copia los scripts · escribe `05-sin-contrasena.conf` (`PasswordAuthentication no`, global) y `60-zydesk-deploy.conf`, valida con `sshd -t` y comprueba que el valor efectivo sea `no` (si otro archivo lo fija en `yes`, restaura y se detiene) · instala la llave en `authorized_keys` con `restrict,command="/srv/apps/zydesk/desplegar.sh"` · copia `zydesk.conf` al `conf.d` de nexus-infra **solo si existe** esa carpeta (si no, dice dónde ponerlo) · instala y activa los tres temporizadores de systemd · pide confirmación y recarga `sshd`.

**Antes de confirmar la recarga de `sshd`**: deja esa sesión abierta y prueba desde otra terminal que entras con tu llave. Si pierdes todas las llaves, la vía de recuperación es la consola de tu proveedor.

El script no se conecta a GitHub ni a Docker Hub y no toca otros proyectos. Al terminar lista lo que falta a mano (3.3).

### 3.3 Pasos manuales tras el script

1. Clonar el repo como `zydesk-deploy` (público, sin credenciales):

   ```sh
   sudo -u zydesk-deploy git clone https://github.com/HikkizZ/Zydesk.git /srv/apps/zydesk/repo
   ```

2. Escribir `/srv/apps/zydesk/.env` a partir de `.env.produccion.example` (sección 4): dueño `zydesk-deploy`, `chmod 600`. Guarda una copia como nota segura en el gestor de contraseñas de la empresa.
3. Generar la clave `age` del respaldo y poner la **pública** (`age1…`) en `RESPALDO_AGE_DESTINATARIO`:

   ```sh
   install -d -m 700 /root/.config/zydesk && age-keygen -o /root/.config/zydesk/age.txt
   ```

   Copia la clave **privada** fuera del servidor (gestor de contraseñas). Sin ella los respaldos no se abren.

4. Configurar `rclone` como root (`rclone config`) con credenciales de **escritura sin borrado** si el proveedor lo permite, y escribir el remoto en `RCLONE_DESTINO` (sección 7).
5. Publicar el dominio: la ruta del túnel hacia el proxy (Cloudflare Zero Trust → Conectores → Rutas de aplicaciones publicadas → `<subdominio>` · `<dominio>` · HTTP · `nginx-proxy:80`) o el certificado del proxy propio (2.2). Recargar el proxy: con nginx en contenedor, `docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload`.
6. Si usas el CD: en GitHub, environment `produccion` con **revisor obligatorio** y los tres secretos `DEPLOY_SSH_KEY` (la clave privada), `DEPLOY_HOST` y `DEPLOY_KNOWN_HOSTS` (la salida de `ssh-keyscan -t ed25519 <host>`). Los paquetes de GHCR deben ser **públicos** (una vez, en la configuración de cada paquete).
7. Probar el cierre del usuario de despliegue:

   ```sh
   ssh zydesk-deploy@<host> 'ls /'
   ```

   debe responder `etiqueta inválida` y nada más.

### 3.4 Actualizar los scripts instalados

Los scripts de `/srv/apps/zydesk/` son **copias** de `docker/vps/`: el despliegue cambia el clon `repo/` y los contenedores, **no** los scripts instalados. Cuando una versión nueva cambia algo de `docker/vps/` (el CHANGELOG lo dice), repite la copia **antes** de desplegarla: actualiza el clon a esa etiqueta y vuelve a correr `instalar-vps.sh` desde su `docker/vps/` (es idempotente; puedes responder que no a la recarga de `sshd` si no cambió). Si se omite, `desplegar.sh` corre con la lógica anterior; por ejemplo, un `desplegar.sh` anterior a la v1.0.0 no conoce el servicio `zydesk-herramientas`, la migración falla y el despliegue se revierte solo.

## 4. Variables y secretos

El `.env` real nunca se versiona. Plantilla: `.env.produccion.example` (solo valores de ejemplo o vacíos). Los comentarios van en línea aparte: los scripts leen el archivo con `sed`/`grep` y un comentario al final del valor se pegaría al valor.

| Variable                                                          | Quién la lee                       | Qué es                                                                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ZYDESK_VERSION`                                                  | Compose, scripts                   | Etiqueta en ejecución (`vX.Y.Z`). **La escribe `desplegar.sh`**; déjala vacía al instalar.                                                 |
| `GHCR_OWNER`                                                      | Compose                            | Dueño de las imágenes en GHCR, en minúsculas (`hikkizz`, o el fork de la empresa).                                                         |
| `DATOS_DIR`                                                       | Compose, scripts                   | Carpeta de datos (`/srv/data/zydesk`).                                                                                                     |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`               | `zydesk-db`, scripts               | Superusuario del contenedor de Postgres (no lo usa la app; solo `pg_dump`/`pg_restore`) y nombre de la base (`zydesk`).                    |
| `ZYDESK_OWNER_PASSWORD`, `ZYDESK_APP_PASSWORD`                    | `zydesk-db` (primer arranque), API | Contraseñas de `zydesk_owner` (migraciones) y `zydesk_app` (la API). El Compose arma `DATABASE_URL` (la API) y `DATABASE_URL_OWNER` (solo `zydesk-herramientas`) con ellas.      |
| `PROXY_SALTOS`                                                    | API                                | Saltos de proxy que escriben `X-Forwarded-For`: `3` con Cloudflare Tunnel + proxy + `zydesk-web`; `2` con proxy propio (2.2).              |
| `UF_ACTUALIZAR`                                                   | API                                | `true` en producción: la API consulta la UF cada hora (ADR 0030).                                                                          |
| `LOG_LEVEL`                                                       | API, bot                           | `error`, `warn` o `info`. La API **rechaza `debug`** en producción.                                                                        |
| `WEB_URL`                                                         | API, bot                           | `https://<dominio>`. Con bot, la API exige `https://`.                                                                                     |
| `COMPOSE_PROFILES`                                                | Compose                            | `bot` levanta `zydesk-bot`; vacío no lo levanta.                                                                                           |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USUARIO`                      | API, bot                           | Bot de Telegram (manual de administración §17). Opcional.                                                                                  |
| `BOT_API_KEY`                                                     | API, bot                           | Clave compartida API ↔ bot. Con token: **mínimo 32 caracteres** y distinta del valor de desarrollo, o la API no arranca.                   |
| `BOT_CLAVE_CIFRADO`                                               | bot                                | 32 bytes en base64 que cifran las sesiones del bot.                                                                                        |
| `TELEGRAM_CHAT_ADMIN`                                             | scripts                            | Chat que recibe los avisos de despliegue, respaldo fallido y errores. Opcional.                                                            |
| `ZYDESK_DEMO`, `DEMO_PASSWORD`                                    | `zydesk-herramientas` (`demo`)     | **Solo la demo.** En una instalación real quedan **vacías**: sin `ZYDESK_DEMO=true` el comando `demo` se niega a correr antes de conectar. |
| `ADMIN_PASSWORD`                                                  | `zydesk-herramientas` (`admin`)                      | Contraseña de la primera cuenta de Administración. Solo durante el comando `admin`; **se borra del `.env` después** (sección 5).           |
| `RESPALDO_AGE_DESTINATARIO`                                       | `respaldar.sh`                     | Clave pública `age1…`. Sin ella el respaldo **no corre** (nunca se respalda sin cifrar).                                                   |
| `RCLONE_DESTINO`                                                  | `respaldar.sh`                     | Remoto de `rclone`, p. ej. `b2:zydesk-respaldos`. Vacío = respaldos solo locales (la copia remota queda desactivada y el script lo avisa). |
| `RESPALDO_RETENCION_LOCAL_DIAS`, `RESPALDO_RETENCION_REMOTA_DIAS` | `respaldar.sh`                     | 14 y 90 días.                                                                                                                              |

### 4.1 Generar los secretos

```sh
# Contraseñas de Postgres: van dentro de una URL sin codificar, no pueden llevar @ / : ni #
openssl rand -base64 32 | tr '+/=' 'xyz'      # POSTGRES_PASSWORD, ZYDESK_OWNER_PASSWORD, ZYDESK_APP_PASSWORD
openssl rand -base64 32                        # BOT_API_KEY (≥ 32 caracteres) y BOT_CLAVE_CIFRADO (32 bytes exactos)
openssl rand -base64 18                        # ADMIN_PASSWORD (cumple la política de contraseñas)
```

Los secretos viven solo en `/srv/apps/zydesk/.env` (600, `zydesk-deploy`), en `/root/.config/zydesk/age.txt` y `/root/.config/rclone/rclone.conf` (600, root), y en el environment `produccion` de GitHub (solo los tres `DEPLOY_*`). Nunca en el repo, en logs ni en chats. `docker inspect` los muestra a quien tenga acceso al socket de Docker (= root): riesgo asumido en ADR 0020.

### 4.2 Qué valida la API al arrancar

Con `NODE_ENV=production` la API **no arranca** («Configuración inválida») si `DATABASE_URL` apunta a `localhost` o usa la contraseña de desarrollo (`zydesk_app:zydesk_app`), si `LOG_LEVEL=debug`, o, con `TELEGRAM_BOT_TOKEN`, si `BOT_API_KEY` tiene menos de 32 caracteres o es el valor de ejemplo, o si `WEB_URL` no es `https://`.

### 4.3 Rotar cada secreto

- **`ZYDESK_APP_PASSWORD` / `ZYDESK_OWNER_PASSWORD`.** `01-roles.sh` corre solo al crear el volumen de Postgres; con el volumen ya creado se cambia a mano, en SQL, dentro del contenedor (como `POSTGRES_USER`): `ALTER ROLE zydesk_app PASSWORD '<nueva>';` (ídem `zydesk_owner`). Luego el nuevo valor en el `.env` y `up -d` para recrear la API (sección 8, comando `dc`); `zydesk-herramientas` lee el `.env` en cada `run`.
- **`POSTGRES_PASSWORD`.** Mismo `ALTER ROLE` sobre el superusuario y el `.env`.
- **`BOT_API_KEY`, `BOT_CLAVE_CIFRADO`, `TELEGRAM_BOT_TOKEN`.** Ver el manual de administración §17 (qué pasa con las vinculaciones en cada caso). Tras cambiar el `.env`, `up -d` recrea la API y el bot.
- **Llave de `zydesk-deploy`.** Nueva llave, `instalar-vps.sh --llave` con la pública (agrega la línea), borrar la línea vieja de `/home/zydesk-deploy/.ssh/authorized_keys`, nueva privada en `DEPLOY_SSH_KEY`.
- **Clave `age`.** Nueva pareja; la pública al `.env`; conserva la privada **anterior** fuera del servidor mientras existan respaldos cifrados con ella.
- **`ADMIN_PASSWORD`.** No se rota: se borra del `.env` después del primer ingreso.

## 5. Primer arranque y carga de datos reales

Los comandos de Compose de esta guía usan el mismo invocador que los scripts del VPS. Defínelo en tu sesión (como root, o como `zydesk-deploy` con `sudo -u zydesk-deploy sh`):

```sh
dc() { docker compose --project-directory /srv/apps/zydesk/repo -f /srv/apps/zydesk/repo/docker-compose.yml --env-file /srv/apps/zydesk/.env "$@"; }
```

### 5.1 Primer despliegue

Elige una etiqueta publicada (`vX.Y.Z`; las imágenes deben existir en GHCR para esa etiqueta) y despliega **a mano** o por el CD:

```sh
sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh v1.0.0
```

El script valida la etiqueta, toma el bloqueo, omite el respaldo previo (no hay versión anterior), hace `git checkout` de la etiqueta en `repo/`, `pull` de las imágenes, levanta `zydesk-db` (el volumen vacío ejecuta `01-roles.sh`: crea `zydesk_owner` y `zydesk_app` y aplica `permisos.sql`), escribe `ZYDESK_VERSION`, corre `migrar` con el rol owner, levanta todo y espera la salud (`"estado":"ok"` y la `version` pedida). Sale con `0` si todo fue bien; los demás códigos están en 6.3.

Comprobar:

```sh
dc ps                                                              # api y web healthy; sin puertos publicados
dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud   # {"estado":"ok","version":"1.0.0","bd":"ok"}
```

y desde fuera, `https://<dominio>/api/salud` (detrás de Access responde `302`: comprueba con el navegador).

### 5.2 Primera cuenta de Administración

1. Escribe `ADMIN_PASSWORD=<contraseña>` en el `.env` (4.1).
2. Crea la cuenta (el servicio `zydesk-herramientas` usa la imagen de la API, cuyo entrypoint conoce `admin`, `migrar` y `demo`):

   ```sh
   dc run --rm --no-deps zydesk-herramientas admin --correo admin@empresa.cl --nombre "Nombre Apellido"
   ```

3. Ingresa en `https://<dominio>` con ese correo y contraseña. La app pide aceptar los Términos de uso. Cambia la contraseña desde **Perfil**.
4. Borra el valor de `ADMIN_PASSWORD` del `.env`. La API no lo lleva en su entorno (solo `zydesk-herramientas`, que no queda en marcha).

### 5.3 Revisar y versionar los documentos legales (E3) — antes de datos reales

Los textos de `docs/legal/` son **borradores con marcadores** (`[NOMBRE DE LA ORGANIZACIÓN]`, `[RESPONSABLE DEL TRATAMIENTO]`) y `borrador: true`: la app muestra el aviso de borrador al aceptarlos. Antes de cargar personas o clientes reales, la empresa debe:

1. Decidir quién es el **responsable del tratamiento** (pregunta E3 de `docs/decisiones/preguntas-abiertas.md`, pendiente) y quién revisa los textos.
2. Editar los dos archivos en el repo: reemplazar los marcadores, poner `borrador: false` y una `version` nueva en `terminos-de-uso.md` (es la versión vigente; una sola aceptación cubre términos y privacidad). Detalle en `docs/legal/README.md`.
3. Publicar: los textos van **dentro de la imagen de la API** (`docs/legal` se copia al construirla). Un cambio exige commit en `main`, etiqueta nueva y despliegue (sección 6). Al desplegar, cada persona vuelve a ver el diálogo de aceptación.

### 5.4 Cargar la configuración y los datos reales (Administración)

Todo desde **Configuración**, en este orden (manual de administración entre paréntesis):

1. Departamentos y horarios (§5), feriados del año (§6).
2. Categorías y plazos (§8), numeración y marca: nombre y logo (§9).
3. Tarifas globales, IVA, validez y condiciones (§14), plantillas de cotización (§15).
4. Equipo: cuentas y roles (§2). Cada persona cambia su contraseña temporal al primer ingreso.
5. Clientes, contactos, bolsa de horas y tarifas por cliente en CLP o UF (§7).
6. Telegram, si se usa: bot propio de producción, `COMPOSE_PROFILES=bot` y las variables del `.env`; `dc up -d` (§17).
7. Verificar en **Configuración → Tarifas** que aparece «UF del día» con fecha de hoy (`UF_ACTUALIZAR=true`; la API la trae en minutos).

### 5.5 Lo que **jamás** se ejecuta en una instalación real

- `db:sembrar` / `db:reiniciar` (semillas de desarrollo): el CLI las rechaza con `NODE_ENV=production`.
- `demo` (`db:demo`): exige `ZYDESK_DEMO=true` y `DEMO_PASSWORD`; sin `--reiniciar` se niega si existe un usuario cuyo correo no termine en `@demo.zytech.dev`; con `--reiniciar` exige además `ZYDESK_DEMO_CONFIRMAR=<nombre de la base>` y **vacía toda la base**. En una instalación real `ZYDESK_DEMO` y `DEMO_PASSWORD` se dejan vacías. Nunca se copian datos de la demo a la instalación real (sección 10).

## 6. Actualizar y volver atrás

### 6.1 Actualizar

Flujo normal (ADR 0032; lo hace quien mantiene el repo):

1. Mergear a `main` → `npm run version:fijar -- X.Y.Z` + `npm run api:openapi` (el `openapi.json` lleva la versión) + CHANGELOG → commit `chore(release): vX.Y.Z` → esperar el **CI verde de ese commit** (corre por el `push` de la rama; no corre en los `push` de etiquetas) → `git tag -a vX.Y.Z -m "Zydesk vX.Y.Z"` sobre ese commit → `git push origin main vX.Y.Z`.
2. El workflow `Desplegar` valida la etiqueta, exige CI verde del commit y que los cinco `package.json` del commit lleven la versión de la etiqueta (si no, falla antes de construir: fue lo que pasó con `v1.0.0-rc.1`, ADR 0031), construye y publica las tres imágenes en GHCR (`<etiqueta>` y `sha-<7>`; sin `latest`) y se detiene en el job `desplegar` hasta que el revisor aprueba el environment `produccion`.
3. Aprobado, el job abre SSH a `zydesk-deploy@<host>` con la etiqueta como único comando; el servidor ejecuta `desplegar.sh <etiqueta>`. Si la versión cambió algo de `docker/vps/`, antes hay que actualizar los scripts instalados (3.4).

Sin CD, el operador hace lo mismo a mano en el servidor: `sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh vX.Y.Z` (las imágenes de esa etiqueta deben estar en GHCR; el workflow las publica aunque nadie apruebe el despliegue).

Qué hace `desplegar.sh` en cada actualización: guarda la versión actual en `.env.anterior`, **vuelca la base** a `respaldos/pre-despliegue/<marca>-<anterior>.dump` (local, sin cifrar; conserva los últimos 5; si falla, no despliega), `git fetch --tags` + `checkout` de la etiqueta (el clon debe estar limpio), `pull` de las imágenes de la etiqueta nueva, **detiene la API y el bot**, escribe `ZYDESK_VERSION`, `up -d --wait zydesk-db`, `migrar` con `zydesk-herramientas` (rol owner), `up -d --remove-orphans`, salud con la `version` pedida (12 intentos cada 5 s), limpieza de imágenes de más de una semana y aviso por Telegram. Indisponibilidad de la API: migración + arranque (del orden de 30–90 s; la web estática sigue sirviéndose y muestra el error de red hasta que vuelve). En los tres despliegues de la demo no se cronometró el tiempo total.

### 6.2 Volver atrás

- **Automático.** Si `pull`, `migrar`, `up` o la salud fallan, el script vuelve solo: `checkout` de la etiqueta anterior, `ZYDESK_VERSION` anterior, `up -d`, salud. Termina con código `1` y avisa por Telegram. **Las migraciones no se revierten**: la API anterior corre sobre el esquema nuevo. Por eso **toda migración debe ser compatible con la versión anterior de la API** (columnas nuevas con `DEFAULT` o `NULL`; borrar o renombrar en dos versiones): regla de `CLAUDE.md` §2.
- **Manual.** Por CD: `Actions → Desplegar → Run workflow` con la etiqueta anterior (pasa de nuevo por la aprobación). El botón `Run workflow` solo aparece cuando `desplegar.yml` está en la rama por defecto (`main`); si no está, se re-ejecuta desde Actions el despliegue de la etiqueta anterior. A mano: `sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh <anterior>`. El ensayo de esta vuelta atrás en la demo está pendiente (`docs/demo.md` §10).
- **Migración incompatible.** Si la versión a la que vuelves no puede leer el esquema nuevo, restaura el volcado previo al despliegue (como root; pide escribir el nombre de la base):

  ```sh
  /srv/apps/zydesk/restaurar.sh /srv/data/zydesk/respaldos/pre-despliegue/<marca>-<anterior>.dump --solo-bd
  ```

  Se pierde lo escrito entre el despliegue y la restauración.

- **Código 5 (la reversión también falló).** Nada responde sano. Revisa `dc logs --since 30m zydesk-api`; lo habitual es corregir el `.env` o restaurar el `.dump` previo y `dc up -d`. Si hace falta, `dc down` y vuelve a desplegar la etiqueta anterior a mano.

### 6.3 Códigos de salida de `desplegar.sh`

`0` desplegado · `1` falló y se revirtió · `2` etiqueta inválida · `3` otro despliegue en curso · `4` el respaldo previo falló (no se despliega) · `5` falló y la reversión también · `6` etiqueta inexistente o clon con cambios (no se tocó ningún contenedor) · `7` se corrió como root.

## 7. Respaldos y restauración

### 7.1 Qué se respalda y cómo

`respaldar.sh` corre como root a las **02:30 hora de Santiago** (`zydesk-respaldo.timer`; el host puede estar en UTC: la zona va en el timer) y a demanda:

```sh
/srv/apps/zydesk/respaldar.sh
```

Produce `/srv/data/zydesk/respaldos/respaldo-<marca>-<versión>.tar.age`, cifrado con la clave pública `age` del `.env`. Dentro: `bd.dump` (`pg_dump -Fc` de toda la base, incluido el esquema `pgboss`, **con dueños y permisos**), `archivos.tar.zst` (`archivos/`), `bot.tar.zst` (`bot/`, si tiene contenido), `version.txt` y `sha256sum.txt`. Nada queda en disco sin cifrar: el material temporal se borra al terminar, también si falla. Si `RCLONE_DESTINO` no está vacío, copia el `.tar.age` al remoto (`rclone copy … --retries 3`) y aplica la retención remota (`rclone delete --min-age 90d`); la local borra los `.tar.age` de más de 14 días. En éxito escribe una línea en `/var/log/zydesk-respaldo.log`; si falla, avisa por Telegram.

Los archivos se copian sin detener la API: un archivo subido durante el `tar` puede faltar (su descarga daría 404; ADR 0009). Los logs **no** se respaldan (contienen IPs). El `.env` tampoco: guárdalo aparte.

**Qué guardar fuera del servidor**, además del remoto de respaldos: la clave privada `age` (`/root/.config/zydesk/age.txt`), el `.env` y `rclone.conf`. Sin la clave `age` los respaldos son ilegibles.

### 7.2 Resolver E2 (destino remoto) antes de datos reales

La demo arranca con respaldos **solo locales** (`RCLONE_DESTINO` vacío; riesgo aceptado: perder el servidor = perder la demo). La instalación definitiva **debe** tener un destino externo antes de cargar datos reales. Recomendación (spec §19 B4): Backblaze B2, bucket privado, **Application Key sin permiso de borrado** y reglas de ciclo de vida del bucket haciendo la retención, para que un servidor comprometido no pueda borrar los respaldos. Pasos: cuenta y bucket · `rclone config` como root (remoto `b2`) · `RCLONE_DESTINO=b2:<bucket>` en el `.env` · correr `respaldar.sh` a mano y comprobar que el remoto solo contiene `.tar.age`.

### 7.3 Restaurar

Como root; interactivo (pide escribir el nombre de la base):

```sh
/srv/apps/zydesk/restaurar.sh /srv/data/zydesk/respaldos/respaldo-<marca>-<versión>.tar.age              # todo
/srv/apps/zydesk/restaurar.sh <respaldo.tar.age> --solo-bd                                            # solo la base
/srv/apps/zydesk/restaurar.sh <respaldo.tar.age> --solo-archivos                                      # solo archivos y bot
/srv/apps/zydesk/restaurar.sh /srv/data/zydesk/respaldos/pre-despliegue/<marca>-<versión>.dump --solo-bd   # volcado previo a un despliegue
```

Qué hace: descifra con `/root/.config/zydesk/age.txt`, verifica `sha256sum.txt`, muestra `version.txt` y exige que la versión desplegada sea **igual o posterior** a la del respaldo (si es anterior, despliega primero esa etiqueta; si es posterior, avisa que las migraciones se reaplican al desplegar). Detiene la API y el bot, recrea la base (`DROP … WITH (FORCE)`, `CREATE DATABASE … OWNER zydesk_owner`, `permisos.sql`), `pg_restore`, vuelve a aplicar `permisos.sql`, repone `archivos/` y `bot/` dejando los anteriores como `archivos.previo-<marca>` y `bot.previo-<marca>`, levanta todo y espera la salud. Al terminar dice qué borrar.

Para traer un respaldo a **otro servidor** (recuperación de desastre): instala según las secciones 3–5.1 con el **mismo** `POSTGRES_DB` y las mismas versiones, despliega la etiqueta del respaldo (o una posterior), copia la clave privada `age` a `/root/.config/zydesk/age.txt` y el `.tar.age` a `respaldos/`, y corre `restaurar.sh`.

### 7.4 Ensayo de restauración

Criterio de la fase: el ensayo completo (`docker/vps/ensayar-restauracion.sh`, solo en local: respalda, destruye, restaura, compara conteos y hashes, verifica que `zydesk_app` no puede `UPDATE evento`) pasó en local en 39 s. En la demo con un respaldo real está **pendiente** (`docs/demo.md` §9; ADR 0031). En la instalación definitiva se recomienda un ensayo **trimestral** sobre un servidor de prueba (nunca sobre producción): es la única forma de saber que los respaldos sirven.

## 8. Operación diaria

- **Estado.** `dc ps` (todo `healthy`/`running`), `dc exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud`. Desde fuera, `https://<dominio>/api/salud` (con Service Token si hay Access). Monitor externo opcional (UptimeRobot, Better Stack) sobre esa URL.
- **Logs.** JSON de pino a stdout: `dc logs -f --since 1h zydesk-api` (filtrar por `req_id` con `grep`). Archivo diario: `zydesk-logs.timer` (00:10 Santiago) corre `archivar-logs.sh`, que deja `/srv/data/zydesk/logs/AAAA-MM-DD.json.gz` (30 días); se busca con `zgrep`. Los logs llevan solo ids (ADR 0017).
- **Errores.** `zydesk-errores.timer` (08:00 Santiago) corre `errores-ayer.sh`: cuenta los `"level":"error"` de la API de las últimas 24 h y, si hay alguno, envía por Telegram el conteo y los `msg` distintos. Sin errores no envía nada. Loki/Grafana no entran por defecto (ADR 0017; decisión del usuario).
- **Temporizadores.** `systemctl list-timers 'zydesk-*'`; ejecutar uno a mano: `systemctl start zydesk-respaldo.service`.
- **Respaldos.** `/var/log/zydesk-respaldo.log` debe tener una línea por día; en el remoto, solo `.tar.age`.
- **Disco.** `df -h /srv/data` y `du -sh /srv/data/zydesk/*`; `docker stats` para CPU y memoria. Los archivos de tickets no se borran solos.
- **Cada año.** Cargar los feriados del año nuevo (manual §6). Revisar `ua-parser-js` (sigue en 1.x por licencia; CHANGELOG).
- **Dependencias e imágenes.** Dependabot mantiene los SHA de las acciones; las imágenes base van por digest y se actualizan con una versión nueva. `npm audit --omit=dev` y `trivy`/`docker scout` se corren a mano al cerrar cada fase (al cerrar la v1.0.0: 3 avisos moderados en `uuid` dentro de `exceljs`, sin arreglo que no rompa `exceljs`; vigilar).

## 9. Qué hacer si

| Síntoma                                                                  | Causa probable                                                                                        | Qué hacer                                                                                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| La API no arranca: «Configuración inválida»                              | Regla de producción de 4.2 (`localhost`, contraseña de desarrollo, `debug`, `BOT_API_KEY`, `WEB_URL`) | `dc logs zydesk-api` dice el campo. Corrige el `.env` y `dc up -d`.                                                                          |
| La API no arranca: `permission denied` al crear el esquema `pgboss`      | `zydesk_app` sin `CREATE` en la base                                                                  | Aplica `docker/postgres-init-prod/permisos.sql` a la base (`restaurar.sh` lo hace; a mano con `psql` como `POSTGRES_USER` y `-v BD=<base>`). |
| El navegador no guarda la sesión; cada clic vuelve a Ingresar            | La cookie es `Secure` y la API cree que la petición llegó por `http`                                  | El proxy debe reenviar `X-Forwarded-Proto https` (2.1/2.2) y `PROXY_SALTOS` debe coincidir con los saltos reales.                            |
| Todo el equipo queda bloqueado al ingresar (`INGRESO_BLOQUEADO`)         | La API ve la misma IP para todos (la del proxy): límite de 20 por IP                                  | `PROXY_SALTOS` mal o falta `CF-Connecting-IP`. Comprueba que `auditoria.ingreso_ok.ip` sea la IP pública de cada persona, no una `172.x`.    |
| La salud responde pero la `version` no coincide y el despliegue revierte | La imagen de esa etiqueta trae otro `package.json`                                                    | Error de release (ADR 0032): la versión del `package.json` debe ser la etiqueta sin `v`. El CD lo detecta antes de construir; a mano, `npm run version:fijar` y etiqueta nueva. |
| `migrar` falla al desplegar con «no such service: zydesk-herramientas»    | Los scripts instalados son de una versión anterior                                                    | 3.4: repite `instalar-vps.sh` desde el clon actualizado y vuelve a desplegar.                                                                |
| `desplegar.sh` sale con `6`                                              | La etiqueta no existe o alguien editó `repo/`                                                         | `git -C /srv/apps/zydesk/repo status`; nadie edita el clon. Con la etiqueta publicada, repite.                                               |
| «UF del día» desactualizada                                              | Sin salida a internet, o Boostr y mindicador.cl caídos                                                | Ver `dc logs zydesk-api` (`indicadores.uf`). El valor se puede escribir a mano en cada cotización.                                           |
| No llegan los avisos de Telegram de operación                            | Falta `TELEGRAM_CHAT_ADMIN` o el token no es del bot correcto                                         | Los scripts avisan `no se pudo enviar el aviso por Telegram`; revisa el `.env`.                                                              |
| No llegan los avisos de Telegram de la app                               | `EJECUTAR_JOBS` o el perfil `bot`                                                                     | Manual de administración §17 («Si algo no llega»).                                                                                           |
| El respaldo nocturno no corrió                                           | Falta `RESPALDO_AGE_DESTINATARIO`, o `docker.service` no estaba arriba                                | `systemctl status zydesk-respaldo.service`, `journalctl -u zydesk-respaldo.service`. Sin clave pública el script no respalda.                |
| Hay que cambiar una contraseña de Postgres                               | Rotación                                                                                              | 4.3: `ALTER ROLE` dentro del contenedor y el `.env`.                                                                                         |

## 10. Mudanza desde la demo y apagado

La demo (`docs/demo.md`) **no se migra**: sus datos son ficticios y una instalación real empieza limpia (secciones 3–5). Lo que sí se reutiliza es todo lo demás: las imágenes publicadas, `docker-compose.yml`, `.env.produccion.example`, los scripts de `docker/vps/` y esta guía. No copies el `.env` de la demo: genera secretos nuevos.

Apagar la demo (o cualquier instalación) cuando se decida, como root:

1. Respaldo final: `/srv/apps/zydesk/respaldar.sh`; copia el último `.tar.age` y la clave privada `age` fuera del servidor si quieres conservarlo.
2. Bajar los contenedores: `dc down` (conserva los datos en `/srv/data/zydesk`). Para borrar también los datos, después de confirmar que el respaldo final existe: `rm -rf /srv/data/zydesk`.
3. Desactivar los temporizadores: `systemctl disable --now zydesk-respaldo.timer zydesk-logs.timer zydesk-errores.timer`.
4. Quitar la publicación: la ruta del túnel (o el certificado del proxy), el archivo del proxy (`zydesk.conf` en el `conf.d`, recarga y commit en `nexus-infra` si aplica) y la aplicación de Access si existía.
5. Quitar el usuario de despliegue: `userdel -r zydesk-deploy`, borrar `/etc/ssh/sshd_config.d/60-zydesk-deploy.conf` (conserva `05-sin-contrasena.conf`) y `systemctl reload ssh`; borrar `/srv/apps/zydesk`.
6. En GitHub: borrar los tres secretos del environment `produccion` (o el environment). Revocar el token del bot de la demo en BotFather.
