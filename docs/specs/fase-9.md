# Fase 9 — Puesta en marcha (v1.0.0) · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: decisiones del usuario del 2026-10-05 (§0.1); `docs/PLAN.md` §1 (revisión de seguridad al cierre), §2 (despliegue: Docker Compose con `postgres`, `api`, `web` nginx; VPS Nexus detrás de nginx-proxy + Cloudflare Tunnel), §4 (Fase 9), §5 (`docs/despliegue.md`) y §7 (respaldos, responsable del tratamiento); ADR **0001** (Compose portable, `web` en la red externa `web`, datos en `/srv/data/zydesk/`), **0002/0013/0018** (cookie `__Host-sesion` solo en producción, `Secure`, `trust proxy` = `PROXY_SALTOS`, `CF-Connecting-IP`, Cloudflare Access como segundo factor), **0008/0030** (pg-boss, 7 colas, `EJECUTAR_JOBS`, `UF_ACTUALIZAR`), **0009** (`ARCHIVOS_DIR`, respaldo = `pg_dump` + copia de la carpeta), **0012** (`docs/despliegue.md`; CHANGELOG por versión), **0017** (logs JSON a stdout; `GRANT CREATE` para pg-boss; roles `zydesk_owner`/`zydesk_app`; Loki/Grafana o la alternativa con cron), **0020** (repo público, CI, **CD**: GHCR → SSH a `zydesk-deploy` con comando forzado, `desplegar.sh`, environment `produccion`, estructura `nexus-infra`), **0027** (bot sin BD, `API_URL=http://api:3000`, `WEB_URL` https, `BOT_DATOS_DIR`, manuales compilados en el bundle de `web`), **0029** (Playwright bloqueante en CI; `docs/manuales/img/` en el bundle; CSP con `img-src 'self' blob:`; propuesta de SemVer con v1.0.0 al cerrar esta fase), **0030** (`UF_ACTUALIZAR=true` en producción; Grafana alerta por `level=error`); `docs/CHANGELOG.md` «Pendientes para la guía de despliegue (Fase 9)» y «Pendientes de la Fase 6/8/8b»; `docs/decisiones/preguntas-abiertas.md` C (producción en el VPS del usuario, `/srv/data/zydesk/`), D1 (un solo punto de restauración en el VPS), E1 (Cloudflare Access, resuelta), E2 (destino de respaldos, **postergada**), E3 (responsable del tratamiento, **pendiente**); `.env.example`, `docker-compose.dev.yml`, `docker/postgres-init/01-roles.sql`, `.github/workflows/ci.yml`, `apps/api/src/config/env.ts`, `apps/api/src/database/cli.ts`, `apps/api/src/database/semillas/**`, `apps/api/src/modulos/legal/legal.service.ts` («en Fase 9 el Dockerfile copia `docs/legal` a esa ruta relativa»), `docs/legal/**` (borradores con `[NOMBRE DE LA ORGANIZACIÓN]` y `[RESPONSABLE DEL TRATAMIENTO]`), `docs/manuales/administracion.md` §1, §12, §16 y §17, `README.md`; `CLAUDE.md` §2, §3, §5 y §7.
>
> Rama `feat/fase-9-puesta-en-marcha`, creada desde `main` con las Fases 0–8 y 8b integradas. El PR final va a `main` con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1; **la etiqueta `v1.0.0` se crea sobre `main` después del merge**, no en la rama (§12). Entorno de partida: 15 migraciones, 7 colas de pg-boss, bot opcional, `npm run test:movil`, todos los `package.json` en `0.1.0`, sin etiquetas git, CHANGELOG en `[Unreleased]`. Todo lo construido (`crearApp`, `comprobarBd`, `/api/salud`, `cli.ts` con `migrar`/`admin`/`sembrar`/`reiniciar`, `sembrarBase`, `cargarLegal`, `env.ts` con Zod, `logger`, fábricas, `e2e/`) **se reutiliza**; esta fase casi no toca código de negocio. Convenciones de `CLAUDE.md`: español en archivos, scripts y mensajes; `logger`, nunca `console.*`; secretos jamás en el repo, en logs ni en artefactos de CI; Windows sin `rm -rf` ni variables inline (los scripts de shell de esta fase corren **en el VPS o en CI**, Linux; en local se prueban con Git Bash o WSL).

## 0. Alcance

### 0.1 Decisiones del usuario que mandan (2026-10-05)

1. **El VPS (`desk.zytech.dev`) es una DEMO en modo producción**, no la instalación definitiva. Si al equipo le gusta, el usuario bajará ese contenedor y Zydesk se instalará en infraestructura de la empresa. Por eso la fase deja el despliegue **reproducible y portátil** (imágenes publicadas, un `docker-compose.yml`, scripts y guía) y separa dos documentos: **guía de la demo** (lo que se ejecuta en esta fase) y **guía de instalación definitiva** (lo que se escribe y se ensaya en local, pero no se ejecuta en ninguna infraestructura real en esta fase).
2. **Datos de la demo: ficticios pero coherentes entre sí**, mejores que las semillas de desarrollo y **nunca datos reales**: una **semilla propia** (`db:demo`), separada de la de desarrollo, con su comando para recargarla. **El usuario debe aprobar la historia antes de que se implemente**: la tarea F9-T9 (proponer la historia y esperar el visto bueno) precede a F9-T10 (implementarla); §11.3 trae el borrador **pendiente de aprobación**.
3. **SemVer**: la salida de esta fase es la **v1.0.0**. Hace falta una ADR que fije el esquema (§12 y §20). Queda para la **v1.1.0**, fuera de esta fase: creación de tickets reenviando correos a una casilla (IMAP).

### 0.2 Entra

(a) **Imágenes Docker de producción** para `api`, `web` (nginx con el build estático y proxy `/api`) y `bot`, mínimas, sin root, con `HEALTHCHECK`, publicadas en GHCR por CI/CD (§4). (b) **`docker-compose.yml` de producción** en la raíz (PLAN §3): `zydesk-db`, `zydesk-api`, `zydesk-web`, `zydesk-bot`, red interna + red externa `web`, sin puertos publicados, datos en `/srv/data/zydesk/` (§5). (c) **Variables y secretos**: cómo se generan, dónde viven en el VPS, qué valida la API al arrancar; `.env.produccion.example` (§5.3). (d) **HTTPS y proxy**: Cloudflare Tunnel → `nginx-proxy` → `zydesk-web` → `zydesk-api`; `PROXY_SALTOS`, `CF-Connecting-IP`, cookie `__Host-`; Cloudflare Access delante (§6). (e) **Cabeceras y CSP** de la web desde nginx; Helmet sigue en la API (§4.2). (f) **Migraciones al desplegar** con el rol owner, arranque ordenado con `depends_on` + healthchecks, jobs en el proceso de la API (§7). (g) **Respaldos y restauración probada**: `respaldar.sh` (pg_dump + archivos + datos del bot, cifrado, copia a un destino externo, retención) y `restaurar.sh`, con un ensayo de restauración como criterio de aceptación (§8). (h) **CD por GitHub Actions** según ADR 0020: `desplegar.yml` por etiqueta `v*`, imágenes a GHCR, SSH con comando forzado a `zydesk-deploy`, environment `produccion` con aprobación; `desplegar.sh` con pg_dump previo, `pull`, migraciones, `up -d`, comprobación de salud y reversión (§9). (i) **CI**: acciones actualizadas a versiones que corren sobre **Node 24** (fijadas por SHA), build de las tres imágenes como paso del CI (sin publicar) (§9.3). (j) **Actualización y rollback** documentados y ensayados (§9.2). (k) **Observabilidad mínima**: logs JSON con rotación, `/api/salud`, healthchecks, aviso por Telegram al desplegar; Loki/Grafana como decisión del usuario (§10). (l) **Semilla de demo** `db:demo` con su historia aprobada, guardas para que jamás corra sobre una instalación real, y su comando de recarga (§11). (m) **ADR de versiones** + `package.json` en `1.0.0` + CHANGELOG `[1.0.0]` + etiqueta `v1.0.0` tras el merge (§12). (n) **Documentación**: `docs/despliegue.md` (instalación definitiva, portátil), `docs/demo.md` (la demo en el VPS), `docs/legal/README.md` (qué revisar antes de datos reales), README, `CLAUDE.md`, manual de administración §1 y §12 (§15). (o) **Revisión de seguridad de cierre** (PLAN §1) con foco en contenedores, secretos, CD, HTTPS/cookies, CSP, respaldos y que la demo no exponga nada sensible (§14, F9-T15).

### 0.3 No entra

Instalar Zydesk en la infraestructura de la empresa (se documenta, no se ejecuta); cargar datos reales (usuarios, clientes, tarifas reales, RUT/razón social: van en la guía de instalación definitiva como pasos de Administración); cambiar o aprobar los textos legales (siguen `borrador: true`; la guía exige su revisión antes de datos reales, E3 sigue pendiente); correo entrante IMAP (v1.1.0); correo saliente (ADR 0013); datos de la empresa en el PDF de cotización (pendiente de la Fase 4; §18.14); Loki + Grafana + Alloy salvo que el usuario lo pida (§18.10; la alternativa con cron de ADR 0017 sí entra); un runner self-hosted; Watchtower; Kubernetes o cualquier orquestador; multi-tenant; PWA; cambios funcionales en la app (ninguna pantalla nueva, ninguna migración nueva salvo que la semilla de demo lo exija, y no debería); pruebas de carga; renovación de certificados (Cloudflare termina TLS); escaneo de vulnerabilidades de imágenes como paso bloqueante del CI (se corre a mano con `docker scout`/`trivy` en F9-T15 y se anota; automatizarlo es una decisión menor para después).

## 1. Bloques y paralelismo

| Bloque                             | Contenido                                                                                                                                                                                                                                                                  | Depende de                     | Archivos que toca (exclusivos)                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9A** Versionado                  | ADR 0032 (versiones), `package.json` × 5 a `1.0.0`, script `version:fijar`, CHANGELOG reestructurado (`[Unreleased]` → `[1.0.0]` al cerrar), `/api/salud` ya expone `version`                                                                                              | —                              | `docs/decisiones/0032-*.md`, `docs/decisiones/README.md` (fila), `package.json` (raíz y 4 workspaces), `package-lock.json`, `docs/CHANGELOG.md`                       |
| **9B** Imágenes                    | `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/bot.Dockerfile`, `docker/nginx/zydesk.conf` (+ `cabeceras.conf`), `.dockerignore`, `docker/entrypoint-api.sh`                                                                                                    | —                              | `docker/*.Dockerfile`, `docker/nginx/**`, `docker/entrypoint-api.sh`, `.dockerignore`                                                                                 |
| **9C** Compose y VPS               | `docker-compose.yml`, `.env.produccion.example`, `docker/postgres-init-prod/01-roles.sh`, `docker/vps/desplegar.sh`, `docker/vps/respaldar.sh`, `docker/vps/restaurar.sh`, `docker/vps/sshd_zydesk-deploy.conf`, `docker/vps/zydesk.nginx-proxy.conf`, `docker/vps/README` | 9B (nombres de imagen y rutas) | `docker-compose.yml`, `.env.produccion.example`, `docker/postgres-init-prod/**`, `docker/vps/**`                                                                      |
| **9D** CI/CD                       | `.github/workflows/desplegar.yml`, `ci.yml` (Node 24, paso de build de imágenes), `.github/dependabot.yml` (solo `github-actions`)                                                                                                                                         | 9B                             | `.github/**`                                                                                                                                                          |
| **9E** Semilla de demo             | Historia aprobada (§11.3), `semillas/demo/**`, comando `demo` en `cli.ts`, `DEMO_PASSWORD` y `ZYDESK_DEMO` en `env.ts`, tests de la semilla                                                                                                                                | aprobación del usuario (F9-T9) | `apps/api/src/database/semillas/demo/**`, `apps/api/src/database/cli.ts`, `apps/api/src/config/env.ts`, `.env.example`, `apps/api/src/database/semillas/demo.test.ts` |
| **9F** Documentación               | `docs/despliegue.md`, `docs/demo.md`, `docs/legal/README.md`, `README.md`, `CLAUDE.md` §6/§7, `docs/manuales/administracion.md` §1 y §12, `docs/api/README.md` (URL de producción), ADR 0031                                                                               | todo                           | `docs/**` (salvo `docs/specs/fase-9.md`, que edita el arquitecto), `README.md`, `CLAUDE.md`                                                                           |
| **9G** Puesta en marcha de la demo | Pasos manuales del usuario en el VPS (§5.4), primer despliegue `v1.0.0-rc.1`, `db:demo`, Access, respaldo real, ensayo de restauración, verificación §17                                                                                                                   | 9A–9F                          | ninguno del repo (anota resultados en §21)                                                                                                                            |

**En paralelo sin conflicto**: 9A, 9B y la propuesta de historia (F9-T9) desde el inicio; 9C y 9D tras 9B; 9E tras la aprobación; 9F va cerrando cada bloque; 9G al final. Orden general en §16.

### 1.1 Base de test por bloque

Solo 9E agrega tests de la API con BD (`demo.test.ts`): usa `npm run db:test:crear -- 9e` y `TEST_BD_SUFIJO=9e`. Los demás bloques no tocan tests de la API. CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas

No cambia: esta fase no agrega transacciones de negocio. La semilla de demo inserta con SQL directo, como `desarrollo-*.ts` (ADR 0025.33, 0027.23), fuera de toda petición HTTP; `desplegar.sh` solo corre `migrar` (rol owner) antes de levantar la API nueva, con la API anterior detenida (§7.1), así que no compite con ninguna transacción.

## 2. Versiones nuevas

**Ninguna dependencia nueva de npm.** Versiones de infraestructura (todas fijadas por **digest** `@sha256:…` en los Dockerfiles y el Compose, con el tag como comentario, igual que las acciones de CI; el digest exacto se resuelve al implementar y se anota en el commit):

| Pieza                                   | Versión                                                                                                                                                                                                        | Dónde                                     | Nota                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Base de `api` y `bot`                   | `node:22-alpine` (misma serie que `.nvmrc` = 22)                                                                                                                                                               | `docker/api.Dockerfile`, `bot.Dockerfile` | Node 22 LTS (ADR 0001). **No** se sube a Node 24 en runtime en esta fase (§18.6); las acciones del CI sí (§9.3).       |
| Base de `web`                           | `nginxinc/nginx-unprivileged:1.27-alpine`                                                                                                                                                                      | `docker/web.Dockerfile`                   | Corre como uid 101, escucha en **8080** (§4.2). Si el usuario prefiere `nginx:alpine` + `user nginx`, ver §18.4.       |
| Postgres                                | `postgres:16-alpine` (como `docker-compose.dev.yml` y CI)                                                                                                                                                      | `docker-compose.yml`                      | Misma major en dev, CI y producción; cambiar de major exige `pg_dump`/restore y una ADR.                               |
| Acciones de GitHub                      | `actions/checkout`, `setup-node`, `upload-artifact` en la versión mayor que corre sobre **Node 24**; `docker/login-action`, `docker/setup-buildx-action`, `docker/build-push-action`, `docker/metadata-action` | `ci.yml`, `desplegar.yml`                 | Fijadas por SHA (ADR 0020); el SHA se toma de la release en GitHub al implementar y se escribe el tag como comentario. |
| `age` (cifrado de respaldos) y `rclone` | la del repositorio del SO del VPS                                                                                                                                                                              | solo en el VPS (`respaldar.sh`)           | Sujeto a §18.8 y a la pregunta B4.                                                                                     |

Si al implementar hace falta otro paquete o imagen, **detente y pregunta**.

## 3. Definiciones (valen para scripts, Compose, workflows y guías)

1. **Demo** = la instalación en el VPS `desk.zytech.dev` durante esta fase: modo producción real (`NODE_ENV=production`, HTTPS, cookie `__Host-`, respaldos, CD), datos **100 % ficticios** cargados con `db:demo`, `nombre_app` «Zydesk · Demo». **Instalación definitiva** = la que hará la empresa siguiendo `docs/despliegue.md`, con `db:admin` y datos reales cargados por Administración; **no se ejecuta en esta fase**.
2. **Etiqueta de versión**: `vMAJOR.MINOR.PATCH` o prelanzamiento `vMAJOR.MINOR.PATCH-rc.N` (§12). Es lo único que viaja del CD al VPS (`SSH_ORIGINAL_COMMAND`), lo único que `desplegar.sh` acepta (regex `^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$`) y el tag de las imágenes en GHCR.
3. **`ZYDESK_VERSION`**: variable del `.env` del VPS con la etiqueta en ejecución; la escribe solo `desplegar.sh` (y la lee el Compose para `image: ghcr.io/<owner>/zydesk-api:${ZYDESK_VERSION}`). «Versión anterior» = el valor previo, que el script guarda en `.env.anterior` antes de cambiarlo.
4. **Secreto**: cualquier valor que no está en el repo: contraseñas de Postgres (`ZYDESK_OWNER_PASSWORD`, `ZYDESK_APP_PASSWORD`, `POSTGRES_PASSWORD`), `BOT_API_KEY`, `BOT_CLAVE_CIFRADO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ADMIN`, `DEMO_PASSWORD`, `ADMIN_PASSWORD`, la clave privada de `zydesk-deploy`, la clave privada de `age`, las credenciales de `rclone`. Viven en el VPS en `/srv/apps/zydesk/.env` (modo 600, dueño `zydesk-deploy`) y en `/root/.config/rclone/` + `/root/.config/zydesk/age.txt` (600, root) — o en el environment `produccion` de GitHub (solo `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`). Se generan con `openssl rand -base64 32` (o `age-keygen`); nunca aparecen en logs, en `docker inspect` accesible a terceros ni en artefactos.
5. **Datos** = `/srv/data/zydesk/{postgres,archivos,bot,respaldos}` (preguntas-abiertas C, ADR 0020). Es lo que se respalda; nunca está en git ni dentro de una imagen.
6. **Respaldo** = un directorio `/srv/data/zydesk/respaldos/AAAA-MM-DDTHHMM-<versión>/` con `bd.dump` (`pg_dump -Fc` de la base completa, incluido el esquema `pgboss`), `archivos.tar.zst` (`ARCHIVOS_DIR`), `bot.tar.zst` (`BOT_DATOS_DIR`), `version.txt` y `sha256sum.txt`, empaquetado y **cifrado** como `respaldo-<marca>.tar.age` antes de salir del VPS (§8).
7. **Salud** = `GET http://zydesk-api:3000/api/salud` → `200 { estado: 'ok', version, bd: 'ok' }` desde dentro de la red del Compose; por fuera, `https://desk.zytech.dev/api/salud` (detrás de Access, si se activa: entonces la comprobación externa exige una **Service Token** de Access o se hace solo desde dentro, §6.3).
8. **Rollback** = volver a la etiqueta anterior (`checkout` del repo + `ZYDESK_VERSION` anterior + `up -d`). **Las migraciones no se revierten solas**: si la versión nueva migró y hay que volver a una anterior incompatible, se restaura el `pg_dump` previo al despliegue (§9.2).
9. **Sin root en los contenedores**: `api` y `bot` corren como `node` (uid 1000) y `web` como uid 101; `postgres` corre como el usuario `postgres` de su imagen. Los directorios de datos se crean con el uid correcto en el primer arranque (§5.4).

## 4. Imágenes Docker (bloque 9B)

### 4.1 `docker/api.Dockerfile` (multi-stage, contexto = raíz del repo)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine@sha256:<digest> AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
RUN npm ci --ignore-scripts            # el postinstall compila shared: se hace en `build` con las fuentes

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @zydesk/shared && npm run build -w @zydesk/api \
 && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine@sha256:<digest> AS runtime
ENV NODE_ENV=production TZ=UTC API_PUERTO=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node docs/legal ./docs/legal
COPY --chown=node:node docker/entrypoint-api.sh /usr/local/bin/entrypoint-api
RUN mkdir -p /datos/archivos && chown -R node:node /datos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud | grep -q '"estado":"ok"' || exit 1
ENTRYPOINT ["entrypoint-api"]
CMD ["node", "apps/api/dist/server.js"]
```

Reglas:

- **La estructura de rutas se conserva** (`/app/apps/api/dist`, `/app/packages/shared/dist`, `/app/docs/legal`): `env.ts` resuelve la raíz del repo con `../../../../` desde `dist/config/` y `legal.service.ts` con `../../../../../docs/legal/` desde `dist/modulos/legal/`; `version.ts` lee `../../package.json` desde `dist/config/` → `apps/api/package.json`. Un test de humo del Dockerfile (§4.5) lo comprueba.
- `npm ci --ignore-scripts` evita que el `postinstall` compile `shared` sin fuentes; `npm prune --omit=dev` deja solo dependencias de producción (`tsx`, `vitest`, `cross-env`, tipos fuera). El `start` de `package.json` usa `cross-env` (devDependency): por eso `CMD` llama a `node` directo con `TZ=UTC` en `ENV`.
- `entrypoint-api.sh` (sh POSIX, 15 líneas): si `$1` es `migrar` o `demo` o `admin` ejecuta `node apps/api/dist/database/cli.js "$@"` y termina; si no, `exec "$@"`. Así `docker compose run --rm zydesk-api migrar` y `… demo --reiniciar` funcionan sin recordar la ruta del CLI. No lee ni escribe secretos.
- `ARCHIVOS_DIR=/datos/archivos` en el Compose (ruta absoluta; `env.ts` la acepta). `BOT_DATOS_DIR` no aplica a la API.
- `wget` existe en Alpine (BusyBox); no se instala `curl`.
- La imagen no contiene `.env`, `docs/` salvo `legal/`, tests, `src/` ni `.git`. `.dockerignore` (nuevo, raíz): `node_modules`, `**/dist`, `.env*` (salvo `.env.example` y `.env.produccion.example`, que tampoco hacen falta: se excluyen igual), `datos`, `.git`, `docs/**` **excepto** `docs/legal/**` y `docs/manuales/**` (los necesita `web`), `apps/web/e2e`, `apps/web/test-results`, `**/*.test.ts*`, `coverage`, `.claude`, `*.md` de la raíz.
- Etiquetas OCI: `org.opencontainers.image.source=https://github.com/<owner>/<repo>`, `.version=<etiqueta>`, `.revision=<sha>` (las pone `docker/metadata-action` en CI; en local, `--label`). Con `source` apuntando al repo, GHCR enlaza el paquete al repositorio y hereda su visibilidad pública (ADR 0020).

### 4.2 `docker/web.Dockerfile` y `docker/nginx/`

```dockerfile
FROM node:22-alpine@sha256:<digest> AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY docs/manuales docs/manuales          # la ayuda importa los .md con ?raw y los PNG de img/ (ADR 0027.47, 0029.24)
RUN npm run build -w @zydesk/shared && npm run build -w @zydesk/web

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:<digest>
COPY docker/nginx/zydesk.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/cabeceras.conf /etc/nginx/cabeceras.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/salud-web || exit 1
```

`docker/nginx/zydesk.conf`:

```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  server_tokens off;
  client_max_body_size 25m;                 # 20 MB por archivo + multipart (ADR 0009); nginx-proxy lleva el mismo valor
  include /etc/nginx/cabeceras.conf;

  location = /salud-web { access_log off; return 200 'ok'; add_header Content-Type text/plain; }

  location /api/ {
    proxy_pass http://zydesk-api:3000;      # sin barra final: conserva /api/... (ADR 0020)
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;   # lo fija nginx-proxy en https
    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    proxy_read_timeout 60s;
    proxy_request_buffering off;            # subidas de 20 MB sin doble buffer
    # Las cabeceras de seguridad de /api las pone Helmet (la API); nginx no las duplica aquí
  }

  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; include /etc/nginx/cabeceras.conf; try_files $uri =404; }
  location / { try_files $uri /index.html; add_header Cache-Control "no-cache"; include /etc/nginx/cabeceras.conf; }
}
```

`docker/nginx/cabeceras.conf` (se incluye en cada `location` porque `add_header` no se hereda cuando el bloque define las suyas):

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header X-Frame-Options DENY always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()" always;
add_header Cross-Origin-Opener-Policy same-origin always;
add_header Cross-Origin-Resource-Policy same-origin always;
```

Justificación de cada fuente de la CSP (verificable en F9-T3 con la web compilada en el navegador: **cero** violaciones en la consola recorriendo las 14 pantallas con las semillas): `style-src 'unsafe-inline'` porque Radix, Recharts y `sonner` escriben `style=""` en línea (Tailwind v4 compilado no lo necesita, pero los componentes sí; una CSP con nonces para estilos exige tocar cada componente: fuera de alcance, §18.5); `img-src blob:` para las vistas previas locales de fotos (ADR 0029) y `data:` para el logo de la marca (base64 en `configuracion`, ADR 0018.5) y el QR de vinculación (ADR 0027.46); `font-src 'self'` porque las fuentes son autoalojadas (`@fontsource`); `connect-src 'self'` porque la web solo habla con `/api`; `camera=(self)` para `capture="environment"`. **No** hay `unsafe-eval` ni `unsafe-inline` en `script-src`. `HSTS` no se pone aquí: lo pone Cloudflare en el borde (si el usuario activa «Always Use HTTPS» + HSTS en el panel; §6.1). La API conserva Helmet (`/api/docs` sin CSP, como hoy); como la web y la API responden en el mismo origen pero rutas distintas, no hay conflicto de cabeceras.

### 4.3 `docker/bot.Dockerfile`

Igual que el de la API con `apps/bot` en lugar de `apps/api`, `CMD ["node", "apps/bot/dist/main.js"]`, sin `EXPOSE` (long polling), `BOT_DATOS_DIR=/datos/bot` (volumen), sin `HEALTHCHECK` (no escucha nada; el log `bot iniciado` y `restart: unless-stopped` bastan; si se quiere, el bot ya termina con error ante `401` de Telegram y Compose lo reinicia). Sin `docs/legal`. `API_URL=http://zydesk-api:3000` (nombre del servicio del Compose; ADR 0013/0027: nunca el dominio público).

### 4.4 Qué **no** va en las imágenes

Semillas de desarrollo sí van (son código del CLI: `sembrar`/`reiniciar` siguen prohibidos en producción por `reiniciarDesarrollo` y por §11.4), pero la guía dice que en producción solo se usan `migrar`, `admin` y, en la demo, `demo`. No van: `.env`, claves, `datos/`, tests, Playwright, fixtures (`apps/api/test/`), capturas de los manuales fuera de `docs/manuales/img` (que sí van, en el bundle de `web`).

### 4.5 Pruebas de las imágenes (sin BD, en CI y en local)

Script `docker/probar-imagenes.sh` (lo corre el paso «Imágenes» del CI, §9.3, y F9-T2/T3 en local):

1. `docker build -f docker/api.Dockerfile -t zydesk-api:prueba .` (ídem `web`, `bot`).
2. `docker run --rm zydesk-api:prueba node -e "require('fs').accessSync('apps/api/dist/server.js'); require('fs').accessSync('docs/legal/terminos-de-uso.md')"` → sale 0.
3. `docker run --rm zydesk-api:prueba node apps/api/dist/database/cli.js --help` → lista `migrar`, `admin`, `sembrar`, `reiniciar`, `demo`, `openapi` (no conecta a la BD).
4. `docker run --rm zydesk-api:prueba id -u` → `1000`; `docker run --rm zydesk-web:prueba id -u` → `101`; `docker run --rm zydesk-bot:prueba id -u` → `1000`.
5. `docker run --rm -e DATABASE_URL=postgres://x:y@localhost:1/z zydesk-api:prueba node apps/api/dist/server.js`; espera salida ≠ 0 en ≤ 30 s con el log «no se pudo conectar a la base de datos» (la configuración se valida y el proceso **termina**, no se queda colgado).
6. `docker run --rm -d -p 18080:8080 zydesk-web:prueba`; `curl -sI localhost:18080/` contiene `Content-Security-Policy`, `X-Frame-Options: DENY` y no contiene `Server: nginx/<versión>`; `curl -s localhost:18080/ayuda` devuelve el `index.html`; `curl -s localhost:18080/salud-web` → `ok`; `curl -sI localhost:18080/assets/` → `404` (sin listado de directorios).
7. `docker image inspect zydesk-api:prueba --format '{{.Size}}'` ≤ 350 MB; `zydesk-web` ≤ 60 MB; `zydesk-bot` ≤ 200 MB (cifras indicativas; si una supera el tope se anota y se revisa el `prune`, no se bloquea el CI por ello: el script las imprime, el tope duro es solo del test 2–6).
8. `docker run --rm zydesk-api:prueba sh -c 'ls /app; test ! -e /app/.env; test ! -d /app/apps/api/src; test ! -d /app/docs/manuales'` → 0.

En CI el script corre sin publicar imágenes; en `desplegar.yml` las mismas imágenes se publican (§9.1) solo tras pasar el CI del commit etiquetado.

## 5. Compose de producción, variables y estructura en el VPS (bloque 9C)

### 5.1 `docker-compose.yml` (raíz; portátil: no asume nada de Nexus salvo la red externa `web`, que la guía de instalación definitiva explica cómo reemplazar)

```yaml
name: zydesk
services:
  zydesk-db:
    image: postgres:16-alpine@sha256:<digest>
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER} # superusuario del contenedor; no lo usa la app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB} # zydesk
      ZYDESK_OWNER_PASSWORD: ${ZYDESK_OWNER_PASSWORD}
      ZYDESK_APP_PASSWORD: ${ZYDESK_APP_PASSWORD}
      TZ: UTC
    volumes:
      - ${DATOS_DIR}/postgres:/var/lib/postgresql/data
      - ./docker/postgres-init-prod:/docker-entrypoint-initdb.d:ro
    networks: [interna]
    healthcheck:
      {
        test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}'],
        interval: 10s,
        timeout: 3s,
        retries: 10,
      }
    logging: &log { driver: json-file, options: { max-size: '20m', max-file: '10' } }

  zydesk-api:
    image: ghcr.io/${GHCR_OWNER}/zydesk-api:${ZYDESK_VERSION}
    restart: unless-stopped
    stop_grace_period: 15s
    env_file: [.env] # el .env de /srv/apps/zydesk (--env-file lo resuelve el script)
    environment:
      NODE_ENV: production
      API_PUERTO: '3000'
      ARCHIVOS_DIR: /datos/archivos
      DATABASE_URL: postgres://zydesk_app:${ZYDESK_APP_PASSWORD}@zydesk-db:5432/${POSTGRES_DB}
      DATABASE_URL_OWNER: postgres://zydesk_owner:${ZYDESK_OWNER_PASSWORD}@zydesk-db:5432/${POSTGRES_DB}
      PROXY_SALTOS: ${PROXY_SALTOS:-2} # nginx-proxy + zydesk-web (ADR 0020)
      EJECUTAR_JOBS: 'true'
      UF_ACTUALIZAR: ${UF_ACTUALIZAR:-true}
    volumes:
      - ${DATOS_DIR}/archivos:/datos/archivos
    networks: [interna]
    depends_on: { zydesk-db: { condition: service_healthy } }
    logging: *log

  zydesk-web:
    image: ghcr.io/${GHCR_OWNER}/zydesk-web:${ZYDESK_VERSION}
    restart: unless-stopped
    networks: [interna, web]
    depends_on: { zydesk-api: { condition: service_started } }
    logging: *log

  zydesk-bot:
    image: ghcr.io/${GHCR_OWNER}/zydesk-bot:${ZYDESK_VERSION}
    restart: unless-stopped
    env_file: [.env]
    environment:
      { NODE_ENV: production, API_URL: 'http://zydesk-api:3000', BOT_DATOS_DIR: /datos/bot }
    volumes:
      - ${DATOS_DIR}/bot:/datos/bot
    networks: [interna]
    depends_on: { zydesk-api: { condition: service_healthy } }
    profiles: [bot] # se levanta solo con COMPOSE_PROFILES=bot (si hay TELEGRAM_BOT_TOKEN)
    logging: *log

networks:
  interna: {}
  web: { external: true } # la red del nginx-proxy de Nexus (ADR 0001/0020)
```

Reglas: **ningún servicio publica puertos** al host; `zydesk-db` solo en `interna`; `zydesk-web` es el único en `web`; nombres de servicio = nombres que usan `nginx/zydesk.conf` (`zydesk-api`) y el `.conf` de nginx-proxy (`zydesk-web:8080`). Las URL de BD se arman en el Compose desde las dos contraseñas, así el `.env` no repite la contraseña en tres variables. Las contraseñas de Postgres no pueden contener `@`, `/`, `:` ni `#` (van dentro de una URL sin codificar): `openssl rand -base64 32 | tr '+/=' 'xyz'` en la guía. `DATOS_DIR=/srv/data/zydesk` en Nexus; en otra infraestructura, lo que diga la guía. El perfil `bot` evita un contenedor reiniciándose en bucle cuando no hay token (`apps/bot` termina en silencio sin token; con `restart: unless-stopped` Compose lo reiniciaría cada vez).

### 5.2 `docker/postgres-init-prod/01-roles.sh`

Versión de producción de `01-roles.sql`: un script `sh` que Postgres ejecuta **solo al crear el volumen**, con `psql -v ON_ERROR_STOP=1` y las contraseñas desde `ZYDESK_OWNER_PASSWORD`/`ZYDESK_APP_PASSWORD` pasadas como variables de `psql` (`-v owner_pwd="$ZYDESK_OWNER_PASSWORD"` y `PASSWORD :'owner_pwd'`; **nunca** interpoladas en el texto del SQL). Crea `zydesk_owner` y `zydesk_app`, `ALTER DATABASE … OWNER TO zydesk_owner`, `GRANT CREATE ON DATABASE … TO zydesk_app` (pg-boss, ADR 0017 y CHANGELOG), `ALTER SCHEMA public OWNER`, `GRANT USAGE`, los dos `ALTER DEFAULT PRIVILEGES`. **No** crea `zydesk_test`. Un test de humo lo ejecuta contra un `postgres:16-alpine` efímero en CI (§9.3): tras el script, `psql -U zydesk_app` puede `CREATE SCHEMA pgboss` y no puede `CREATE TABLE` en `public`; `zydesk_owner` sí. Si el volumen ya existe (instalación que rota contraseñas), el script no corre: la guía documenta `ALTER ROLE … PASSWORD` a mano (§15.1).

### 5.3 `.env.produccion.example` (raíz, versionado, **solo valores de ejemplo** o vacíos)

```
# Zydesk · producción / demo. Copiar a /srv/apps/zydesk/.env (chmod 600). Nunca versionar el .env real.
ZYDESK_VERSION=            # la escribe desplegar.sh (etiqueta vX.Y.Z)
GHCR_OWNER=                # dueño del repo en GitHub, en minúsculas
DATOS_DIR=/srv/data/zydesk
POSTGRES_USER=postgres
POSTGRES_PASSWORD=         # openssl rand -base64 32 | tr '+/=' 'xyz'
POSTGRES_DB=zydesk
ZYDESK_OWNER_PASSWORD=     # ídem
ZYDESK_APP_PASSWORD=       # ídem
PROXY_SALTOS=2
UF_ACTUALIZAR=true
LOG_LEVEL=info
WEB_URL=https://desk.zytech.dev
# Telegram (opcional; en la demo un bot distinto del de desarrollo y del definitivo)
COMPOSE_PROFILES=          # `bot` para levantar apps/bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USUARIO=
BOT_API_KEY=               # openssl rand -base64 32 (≥ 32 caracteres; la API no arranca con el de desarrollo)
BOT_CLAVE_CIFRADO=         # openssl rand -base64 32 (exactamente 32 bytes)
TELEGRAM_CHAT_ADMIN=       # chat que recibe el aviso de despliegue/respaldo (opcional)
# Solo la demo (§11): sin ZYDESK_DEMO=true el comando `demo` se niega a correr
ZYDESK_DEMO=
DEMO_PASSWORD=
# Solo la instalación definitiva, y solo durante `admin`: luego se borra del .env
ADMIN_PASSWORD=
# Respaldos (los lee respaldar.sh, como root)
RESPALDO_AGE_DESTINATARIO=   # clave pública age1…
RESPALDO_RCLONE_REMOTO=      # p. ej. b2:zydesk-respaldos (la configuración de rclone vive en /root/.config/rclone)
RESPALDO_RETENCION_LOCAL_DIAS=14
RESPALDO_RETENCION_REMOTA_DIAS=90
```

`env.ts` gana `ZYDESK_DEMO` (`'true' | 'false'`, por defecto `false`) y `DEMO_PASSWORD` (opcional), y una regla en `superRefine`: con `NODE_ENV=production`, `DATABASE_URL` no puede apuntar a `localhost` ni contener `zydesk_app:zydesk_app` (la contraseña de desarrollo), y `LOG_LEVEL` no puede ser `debug`; viola → la API no arranca («Configuración inválida»). `.env.example` (desarrollo) gana las dos variables nuevas con comentario. Test en `env.test.ts`.

### 5.4 Estructura en el VPS y pasos manuales (los ejecuta el usuario como root, guiado por `docs/demo.md`; el repo entrega los archivos en `docker/vps/`)

```
/srv/apps/zydesk/
├── .env                 zydesk-deploy:zydesk-deploy 600   (de .env.produccion.example)
├── .env.anterior        lo escribe desplegar.sh (ZYDESK_VERSION previo)
├── desplegar.sh         root:root 755  (copia de docker/vps/desplegar.sh; NO lo cambia el despliegue)
├── respaldar.sh         root:root 700  (copia de docker/vps/respaldar.sh; cron de root)
├── restaurar.sh         root:root 700
└── repo/                clon público de solo lectura, dueño zydesk-deploy; desplegar.sh hace fetch --tags + checkout
/srv/data/zydesk/
├── postgres/            70:70  (uid de postgres en la imagen alpine)
├── archivos/            1000:1000
├── bot/                 1000:1000
└── respaldos/           root:root 700
/root/.config/zydesk/age.txt      600  (clave privada age; copia fuera del VPS obligatoria)
/root/.config/rclone/rclone.conf  600
```

`docker/vps/instalar-vps.sh` (idempotente, lo corre root **una vez**; no se conecta a GitHub ni a Docker Hub): crea el usuario `zydesk-deploy` (`useradd -m -s /bin/sh -G docker`), los directorios con sus dueños, copia `sshd_zydesk-deploy.conf` a `/etc/ssh/sshd_config.d/` (bloque `Match User zydesk-deploy` con `PasswordAuthentication no`, `PubkeyAuthentication yes`, `AllowTcpForwarding no`, `X11Forwarding no`, `AllowAgentForwarding no`, `PermitTTY no`, `ForceCommand /srv/apps/zydesk/desplegar.sh`), valida con `sshd -t`, recarga `sshd`, instala `authorized_keys` desde un archivo que el usuario pega (`restrict,command="/srv/apps/zydesk/desplegar.sh" ssh-ed25519 …`), copia `zydesk.nginx-proxy.conf` a `/srv/apps/nexus-infra/proxy/conf.d/zydesk.conf` **solo si existe** esa ruta (si no, imprime dónde ponerlo), instala el cron de respaldo (`/etc/cron.d/zydesk-respaldo`: `30 2 * * * root /srv/apps/zydesk/respaldar.sh`), y termina listando lo que falta hacer a mano (clonar el repo como `zydesk-deploy`, escribir `.env`, crear la ruta del túnel y la aplicación de Access). Todo lo que depende de Nexus se confirma en §19 (B1, B2).

`docker/vps/zydesk.nginx-proxy.conf` (ADR 0020): `server { listen 80; server_name desk.zytech.dev; client_max_body_size 25m; set $up_zydesk zydesk-web:8080; location / { proxy_pass http://$up_zydesk; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; proxy_set_header CF-Connecting-IP $http_cf_connecting_ip; proxy_request_buffering off; } }`. **Puerto 8080**, no 80: la imagen `web` corre sin privilegios (§4.2); ADR 0020 decía `zydesk-web:80` y queda precisado (§20).

### 5.5 `docker/vps/desplegar.sh` (ADR 0020; sh POSIX, `set -eu`, sin bashisms)

Entrada: `SSH_ORIGINAL_COMMAND` (desde el CD) o `$1` (a mano, como root o `zydesk-deploy`). Pasos, cada uno con una línea de log en stdout (que el CD muestra; **sin** valores del `.env`):

1. Valida la etiqueta con la regex de §3.2; cualquier otra cosa → `echo 'etiqueta inválida' >&2; exit 2` (sin ejecutar nada más: es la única entrada externa y lo primero que se comprueba).
2. `cd /srv/apps/zydesk`; `flock -n /run/lock/zydesk-despliegue.lock` (dos despliegues a la vez → `exit 3`).
3. Lee `ZYDESK_VERSION` actual (`anterior`), lo guarda en `.env.anterior`.
4. **Respaldo previo**: `./respaldar.sh --motivo pre-despliegue-<anterior>` (si `anterior` está vacío —primer despliegue— lo omite). Si falla → `exit 4` sin desplegar (D1: nunca desplegar sin respaldo). `respaldar.sh` es de root y `zydesk-deploy` no tiene sudo: por eso el `ForceCommand` y la línea de cron corren el script **como root** vía una entrada `sudoers` acotada a ese único comando sin argumentos libres (`zydesk-deploy ALL=(root) NOPASSWD: /srv/apps/zydesk/respaldar.sh --motivo pre-despliegue-*`), o bien el respaldo previo lo hace `desplegar.sh` por su cuenta con `docker compose exec pg_dump` (sin cifrar ni subir, solo local). **Decisión: la segunda** (§18.9): `desplegar.sh` no necesita root; el respaldo previo es local y sin cifrar en `respaldos/pre-despliegue/` (700, dueño `zydesk-deploy`), y el cron nocturno de root hace el completo.
5. `cd repo && git fetch --tags --prune origin && git checkout --quiet "<etiqueta>"` (repo público, sin credenciales); `git status --porcelain` debe estar vacío (nadie editó el clon).
6. `docker compose --env-file ../.env pull --quiet` (imágenes públicas de GHCR: sin login).
7. `docker compose --env-file ../.env stop zydesk-api zydesk-bot` (la API anterior no debe escribir mientras migra la nueva, §7.1).
8. Escribe `ZYDESK_VERSION=<etiqueta>` en `../.env` (con `sed -i` sobre esa única línea).
9. **Migraciones**: `docker compose --env-file ../.env run --rm --no-deps zydesk-api migrar` (entrypoint → `cli.js migrar`, rol owner). Falla → **reversión** (paso 12).
10. `docker compose --env-file ../.env up -d --remove-orphans`.
11. **Salud**: hasta 12 intentos cada 5 s: `docker compose exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud` debe contener `"estado":"ok"` y `"version":"<etiqueta sin la v>"` (la API publica el `version` de su `package.json`: comprueba que la imagen que corre es la de la versión pedida, §12.2). Si no → reversión.
12. **Reversión**: `git checkout --quiet "<anterior>"`, `ZYDESK_VERSION=<anterior>` en `.env`, `up -d`, misma comprobación de salud; imprime «revertido a <anterior>; las migraciones no se revierten: respaldo en <ruta>» y `exit 1`. Si la reversión también falla, `exit 5` (la guía dice qué hacer: §9.2).
13. `docker image prune -f --filter 'until=168h'` (imágenes sin usar de hace más de una semana).
14. **Aviso** (si `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ADMIN` existen en `.env`): `curl -fsS --max-time 10 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" --data-urlencode "chat_id=…" --data-urlencode "text=Zydesk desplegado: <etiqueta> (antes <anterior>)"` (o «falló; revertido a …»); el token se pasa como variable, nunca aparece en el log (`set +x` siempre; el script jamás hace `echo` del `.env`; `curl` sin `-v`).

El script **solo** usa `docker compose`, `git`, `sed`, `flock`, `wget` dentro de los contenedores y `curl`; no instala nada, no hace `sudo`, no lee argumentos adicionales. Pruebas: `docker/vps/desplegar.test.sh` (shell, corre en CI en el paso «Scripts del VPS» y en local) ejecuta el script con `ZYDESK_SIMULAR=1`, que sustituye `docker`, `git` y `curl` por funciones que registran las llamadas: etiqueta inválida (`v1`, `main`, `v1.0.0; rm -rf /`, `../x`, vacía) → `exit 2` sin ninguna llamada; etiqueta válida → la secuencia exacta de llamadas en orden; salud que falla → reversión y `exit 1`; `pg_dump` previo que falla → `exit 4` sin `pull`. `shellcheck` sobre todos los `.sh` de `docker/` (se instala en el job de CI con `apt`, no es dependencia de npm).

## 6. HTTPS, proxy, Cloudflare Access y cookies

### 6.1 Cadena

Navegador → Cloudflare (TLS público, HSTS si el usuario lo activa en el panel, Access) → `cloudflared` (túnel ya existente en Nexus, ADR 0020) → `nginx-proxy:80` (red `web`; `server_name desk.zytech.dev`) → `zydesk-web:8080` (nginx del Compose) → `zydesk-api:3000`. Dentro del VPS todo es HTTP en redes Docker privadas; **ningún puerto** de Zydesk está publicado en el host (solo 22, ufw). La guía de instalación definitiva (§15.1) describe la alternativa sin Cloudflare: un reverse proxy con TLS propio (Caddy o nginx + certbot) que fije `X-Forwarded-Proto https` y, en ese caso, `PROXY_SALTOS=2` y sin `CF-Connecting-IP` (la API cae a `X-Forwarded-For`, ADR 0013).

### 6.2 Lo que la API necesita y ya hace

`NODE_ENV=production` → cookie `__Host-sesion` con `Secure` (ADR 0018.2): exige que la petición llegue como `https` según `X-Forwarded-Proto` con `trust proxy = PROXY_SALTOS` (= 2: nginx-proxy y zydesk-web). Verificación (§17): `Set-Cookie: __Host-sesion=…; Path=/; HttpOnly; Secure; SameSite=Lax` en el ingreso por `https://desk.zytech.dev`; la IP registrada en `auditoria.ingreso_ok` es la del cliente (de `CF-Connecting-IP`), no la del proxy (si fuera siempre la misma, el límite de 20 por IP bloquearía a todo el equipo: ADR 0013). `WEB_URL=https://…` obligatoria con token (ya validado).

### 6.3 Cloudflare Access (E1, resuelta: segundo factor sin código en la app)

Si el usuario confirma activarlo para la demo (B3): aplicación Access «Zydesk demo» sobre `desk.zytech.dev`, política «Allow» con la lista de correos del equipo (OTP por correo), duración de sesión 24 h. Consecuencias que la fase respeta: (1) el bot sigue hablando con la API por la red interna, Access no lo afecta; (2) la comprobación de salud externa (`curl https://desk.zytech.dev/api/salud`) recibe un `302` a Access: para monitoreo externo se crea una **Service Token** de Access y se pasa en `CF-Access-Client-Id/Secret`, **o** se monitorea solo desde dentro (recomendación §18.11); (3) Playwright contra la demo (§13.3) necesita la misma Service Token o una regla «Bypass» temporal para la IP de quien lo corre; (4) `/terminos` y `/privacidad` quedan detrás de Access también (aceptable: solo el equipo los lee). Si no se activa, la app queda protegida solo por contraseña + límites (D2); la demo no tiene datos reales, así que es aceptable **solo para la demo**; la guía de instalación definitiva lo marca como obligatorio o como decisión explícita de la empresa.

## 7. Arranque, migraciones y jobs

### 7.1 Orden

`zydesk-db` sano → (despliegue) `run --rm zydesk-api migrar` con la API anterior detenida → `zydesk-api` arranca (`cargarLegal` → conecta → `sembrarBase` → pg-boss con las 7 colas → `listen 3000`) → `zydesk-web` → `zydesk-bot` (perfil). `sembrarBase` en producción inserta solo configuración por defecto, contadores, la clave `tarifas` y los feriados (idempotente; **no** inserta `indicador_uf`, spec 8b §10.1). El `send` de arranque de `indicadores.uf` trae la UF en minutos (`UF_ACTUALIZAR=true`). Los cron de pg-boss corren con `tz: 'America/Santiago'` aunque el contenedor esté en `TZ=UTC` (como hoy en desarrollo).

### 7.2 Una sola instancia de la API

El Compose levanta **una** réplica de `zydesk-api`: pg-boss tolera varias, pero `conectarDespachador` y el `send` con `singletonKey` están pensados para un proceso (ADR 0008, 0027). Escalar exige una ADR.

### 7.3 Apagado

`docker compose stop` envía `SIGTERM`; `server.ts` cierra el servidor, detiene pg-boss (`graceful`) y la conexión en ≤ 10 s (ya implementado). `stop_grace_period: 15s` en `zydesk-api`.

## 8. Respaldos y restauración (bloque 9C; D1 y E2)

### 8.1 `docker/vps/respaldar.sh` (root, cron diario 02:30 hora de Santiago —expresado en la zona del host, B16— y a demanda)

1. `set -eu`; `flock` propio; lee de `/srv/apps/zydesk/.env` **solo** `DATOS_DIR`, `POSTGRES_USER`, `POSTGRES_DB`, `ZYDESK_VERSION`, `RESPALDO_*`, `TELEGRAM_*` (con `grep '^NOMBRE=' | cut -d= -f2-`, nunca `source` del archivo completo).
2. `marca=$(date -u +%Y-%m-%dT%H%M)`; `dir=$DATOS_DIR/respaldos/tmp-$marca`.
3. `docker compose --env-file … exec -T zydesk-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl > "$dir/bd.dump"` (formato custom, comprimido; sin `--no-owner` el restore en otra instalación fallaría por los roles). Incluye el esquema `pgboss` (ADR 0008) y todas las tablas.
4. `tar --zstd -cf "$dir/archivos.tar.zst" -C "$DATOS_DIR" archivos` y lo mismo con `bot` (si existe y no está vacío). Los archivos se copian **sin detener la API**: un archivo subido durante el `tar` puede faltar y su fila `archivo` también faltará en el dump solo si se subió después; a lo sumo queda una fila sin archivo (descarga 404; ADR 0009 ya cubre «falta el archivo en disco»). Se acepta y se documenta.
5. `version.txt` (etiqueta, fecha, `pg_dump --version`), `sha256sum bd.dump *.zst version.txt > sha256sum.txt`.
6. `tar -cf - -C "$dir" . | age -r "$RESPALDO_AGE_DESTINATARIO" > "$DATOS_DIR/respaldos/respaldo-$marca-$ZYDESK_VERSION.tar.age"`; borra `tmp-*`. **Nada sale del VPS sin cifrar.** La clave privada `age` está en `/root/.config/zydesk/age.txt` (para restaurar rápido) **y** fuera del VPS (sin la copia externa, perder el VPS = perder los respaldos): §18.8.
7. `rclone copy "$archivo.age" "$RESPALDO_RCLONE_REMOTO/" --retries 3` (si `RESPALDO_RCLONE_REMOTO` está vacío, lo omite y lo registra como `warn`).
8. Retención: local `find … -name 'respaldo-*.tar.age' -mtime +$RESPALDO_RETENCION_LOCAL_DIAS -delete`; remota `rclone delete --min-age ${RESPALDO_RETENCION_REMOTA_DIAS}d "$REMOTO"`. Los `pre-despliegue/*.dump` de `desplegar.sh` (§5.5.4) se conservan los últimos **5** (el script borra el sexto).
9. Aviso por Telegram (como `desplegar.sh` paso 14) solo si **falla**; en éxito, una línea en `/var/log/zydesk-respaldo.log` (fecha, etiqueta, tamaño, remoto sí/no). Sin contenido de datos.

### 8.2 `docker/vps/restaurar.sh <archivo.tar.age> [--solo-bd | --solo-archivos]` (root, interactivo: pide confirmar escribiendo el nombre de la base)

1. `age -d -i /root/.config/zydesk/age.txt` a un directorio temporal 700; `sha256sum -c sha256sum.txt`; muestra `version.txt`.
2. Exige que la **versión de la app** desplegada sea ≥ la del respaldo (`version.txt`); si no, avisa que primero despliegue esa etiqueta (una versión **anterior** no sabría leer un dump con migraciones posteriores; una posterior reaplica sus migraciones al desplegar).
3. `docker compose stop zydesk-api zydesk-bot`.
4. BD: `dropdb`/`createdb` como `POSTGRES_USER` (con `OWNER zydesk_owner` y `GRANT CREATE … TO zydesk_app`) y `pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --role=zydesk_owner bd.dump`; luego `ALTER SCHEMA public OWNER TO zydesk_owner` y los `GRANT`/`DEFAULT PRIVILEGES` de `01-roles.sh` (mismo SQL, factorizado en `docker/postgres-init-prod/permisos.sql` que usan ambos) para que `zydesk_app` conserve exactamente sus permisos (verificado en el ensayo: `UPDATE evento` como `zydesk_app` → `permission denied`).
5. Archivos: `mv archivos archivos.previo-<marca>` y `tar --zstd -xf archivos.tar.zst -C "$DATOS_DIR"`; `chown -R 1000:1000`. Ídem `bot`.
6. `docker compose up -d`; comprobación de salud; imprime qué hacer con `archivos.previo-*` (borrar tras verificar).

### 8.3 Ensayo de restauración (criterio de aceptación; **dos** veces: en local con Docker y en la demo)

En local (`docker/vps/ensayar-restauracion.sh`, con un `.env` de prueba, `DATOS_DIR` temporal y una red `web` creada ad hoc): levanta `docker-compose.yml`, `migrar`, `demo`, anota conteos (`SELECT count(*)` de `usuario`, `ticket`, `ot`, `cotizacion`, `registro_horas`, `aviso`, `archivo`, `evento`, `auditoria`, `indicador_uf`) y `sha256sum` de todos los archivos de `archivos/`; corre `respaldar.sh`; destruye el volumen de Postgres y `archivos/`; levanta de nuevo (volumen vacío → `01-roles.sh` corre), `restaurar.sh`; los conteos y los hashes son **idénticos**, `GET /api/salud` 200, ingresa una cuenta de la demo y descarga un archivo de un ticket (200). Además, en la base restaurada `UPDATE evento` como `zydesk_app` → `permission denied` (ADR 0017). En la demo (F9-T16) el mismo ensayo con un respaldo real, restaurando sobre la propia demo (es una demo: se puede) y anotando tiempos en §21.

## 9. CI/CD (bloque 9D)

### 9.1 `.github/workflows/desplegar.yml` (ADR 0020, opción B)

```yaml
name: Desplegar
on:
  push: { tags: ['v*'] }
  workflow_dispatch:
    {
      inputs:
        {
          etiqueta:
            { description: 'Etiqueta vX.Y.Z[-rc.N] ya existente', required: true, type: string },
        },
    }
permissions: { contents: read, packages: write }
concurrency: { group: desplegar, cancel-in-progress: false }
jobs:
  verificar-etiqueta: # regex de §3.2 sobre ETIQUETA (variable de entorno, nunca interpolada en el shell); la etiqueta existe;
    # el workflow CI del commit etiquetado terminó en success (gh api); si no, falla sin construir
  imagenes: # needs: verificar-etiqueta · checkout en la etiqueta (persist-credentials: false) · setup-buildx ·
    # login a ghcr.io con GITHUB_TOKEN · metadata-action (tags <etiqueta> y sha-<7>, labels OCI) ·
    # build-push-action × 3 (api, web, bot) con provenance: false y caché type=gha
  desplegar: # needs: imagenes · environment: produccion (revisor obligatorio: el usuario) ·
    # escribe DEPLOY_SSH_KEY en un archivo 600 y DEPLOY_KNOWN_HOSTS en known_hosts ·
    # ssh -o StrictHostKeyChecking=yes -o BatchMode=yes -o IdentitiesOnly=yes -i llave zydesk-deploy@$DEPLOY_HOST "$ETIQUETA" ·
    # muestra la salida del script (sin secretos) · `shred -u` de la llave en un paso `if: always()`
```

Reglas: ninguna acción de terceros fuera de `actions/*` y `docker/*`, todas por SHA. Sin `pull_request_target`, sin runner self-hosted. El `GITHUB_TOKEN` basta para GHCR; no hay PAT. Los paquetes GHCR se enlazan al repo (label `source`) y se dejan **públicos** (ADR 0020; el usuario lo confirma una vez en la configuración del paquete: B6). `workflow_dispatch` con una etiqueta **antigua** = rollback por CD (§9.2). El job `desplegar` no ejecuta `ssh` con ningún otro argumento: lo único que cruza es la etiqueta ya validada.

### 9.2 Actualización y rollback (lo que la guía dice y lo que se ensaya en F9-T16)

- **Actualizar**: mergear a `main` → `npm run version:fijar X.Y.Z` + CHANGELOG → commit `chore(release): vX.Y.Z` → `git tag -a vX.Y.Z -m "Zydesk vX.Y.Z"` → `git push origin main vX.Y.Z` (**con confirmación del usuario**, CLAUDE.md §5) → el workflow construye → el usuario aprueba el environment → `desplegar.sh` respalda, migra, levanta, comprueba y avisa. Objetivo total < 15 min; indisponibilidad de la API durante migración + arranque (≈ 30–90 s; la web estática sigue sirviéndose y muestra el error de red de TanStack Query hasta que vuelve).
- **Rollback automático**: lo hace `desplegar.sh` si la salud falla (§5.5.12).
- **Rollback manual**: `workflow_dispatch` con la etiqueta anterior (vuelve a pasar por aprobación). Si la versión revertida tenía migraciones **incompatibles**, se restaura el `pre-despliegue/*.dump` con `restaurar.sh --solo-bd` (acepta también un `.dump` sin cifrar de esa carpeta). Regla nueva para los programadores (`CLAUDE.md` §2): **toda migración debe ser compatible con la versión anterior de la API** (columnas nuevas con `DEFAULT` o `NULL`; borrar o renombrar en dos versiones: primero dejar de usar, después borrar), para que el rollback automático nunca necesite el dump. Se comprueba en revisión, no con test.
- **Ensayo** (F9-T16): desplegar `v1.0.0-rc.1`; luego `v1.0.0-rc.2` (un cambio trivial si no hay otro); luego `workflow_dispatch` con `rc.1` (rollback) y de nuevo `rc.2`; cada paso con salud 200 y aviso de Telegram; anotar tiempos en §21.

### 9.3 `ci.yml`

- **Node 24 en las acciones**: `actions/checkout`, `actions/setup-node` y `actions/upload-artifact` pasan a la versión mayor que corre sobre Node 24 (GitHub retira Node 20; CHANGELOG), fijadas por **SHA** con el tag en comentario. `.nvmrc` sigue en 22 (`node-version-file`): el Node que ejecuta la **acción** y el que ejecuta **nuestro código** son cosas distintas (§18.6).
- Paso nuevo **«Imágenes»** tras «Build»: `docker/probar-imagenes.sh` (§4.5) con `docker/setup-buildx-action` y caché `type=gha` (sin publicar; sin login). Si tarda más de 6 min, pasa a un job paralelo `imagenes` (decisión al implementar, anotada en §21).
- Paso nuevo **«Scripts del VPS»**: `shellcheck docker/**/*.sh`, `docker/vps/desplegar.test.sh` y `01-roles.sh` contra un Postgres efímero (§5.2).
- `.github/dependabot.yml` con `package-ecosystem: github-actions`, semanal (ADR 0020 lo dejó como decisión menor: se toma aquí porque desde esta fase hay dos workflows y un SHA desactualizado es la vía más probable de quedarse sin Node soportado). **No** se activa Dependabot para npm.
- `permissions: contents: read` se mantiene. Cifra objetivo: job `verificar` ≤ 12 min (hoy 8–9 con Playwright).

## 10. Observabilidad mínima

1. **Logs**: pino JSON a stdout (ADR 0017), Docker `json-file` con rotación `20m × 10` por servicio (§5.1). Lectura: `docker compose logs -f --since 1h zydesk-api | grep <req_id>`. **Alternativa con cron de ADR 0017** (entra: `docker/vps/archivar-logs.sh`, cron diario 00:10): `docker compose logs --since 24h --no-color zydesk-api zydesk-bot zydesk-web | gzip > $DATOS_DIR/logs/AAAA-MM-DD.json.gz` + `find -mtime +30 -delete`; se busca con `zgrep`. Los logs **no** entran en los respaldos (contienen IPs; retención 30 días).
2. **Salud**: `/api/salud` (ya), healthchecks de Docker (§4), `docker compose ps` muestra `healthy`. Monitoreo externo: §18.11.
3. **Alertas**: Telegram desde `desplegar.sh` (siempre) y `respaldar.sh` (fallos) a `TELEGRAM_CHAT_ADMIN`. **No** hay alerta por `level=error` de la API (eso es Loki/Grafana, §18.10); mientras tanto, `docker/vps/errores-ayer.sh` (cron 08:00, opcional) cuenta `"level":"error"` en los logs de las últimas 24 h y, si hay ≥ 1, envía el conteo y los `msg` distintos por Telegram (solo el texto fijo del mensaje de log, que por ADR 0017 no contiene datos).
4. **Recursos**: `docker stats` y `df -h /srv/data` en la guía (ADR 0009: vigilar el disco); sin Prometheus.
5. **Versión en ejecución**: `/api/salud.version` = etiqueta sin `v` (§12.2). La web muestra «Zydesk v1.0.0» en el pie legal leyendo `/api/salud` (texto de 12 px, `data-letra="insignia"`; una consulta con `staleTime: Infinity`): son unas 15 líneas en `apps/web` y es el **único** cambio de interfaz de la fase; el usuario lo confirma (§18.13). La demo lo necesita para que el equipo pueda decir qué versión vio.

## 11. Semilla de demo (bloque 9E)

### 11.1 Comando y guardas

- `npm run db:demo` → `cli.ts demo [--reiniciar]` → `semillas/demo/cargar.ts`: `sembrarDemo(password)`. Idempotente por correo/código como la de desarrollo. `--reiniciar` hace `TRUNCATE … RESTART IDENTITY CASCADE` de todas las tablas salvo `migracion` (como `reiniciarDesarrollo`) **y** borra los archivos de `ARCHIVOS_DIR` que la semilla haya creado antes (los suyos están bajo `ARCHIVOS_DIR/demo/`, §11.2), y vuelve a sembrar.
- **Guardas** (todas con test): (1) exige `ZYDESK_DEMO=true` en el entorno; si no, `logger.error('db:demo solo corre con ZYDESK_DEMO=true')` y `exit 1` **antes de conectar**; (2) exige `DEMO_PASSWORD` (política de contraseñas de `shared`); (3) **se niega si la base tiene algún usuario cuyo correo no termine en `@demo.zytech.dev`** ni esté vacía (una instalación real nunca tiene esos correos; igual que `soloSemillas` de ADR 0029.23); (4) `--reiniciar` exige además la variable de entorno `ZYDESK_DEMO_CONFIRMAR=<nombre de la base>` (el operador escribe `zydesk`) para que un `reiniciar` por error no borre nada; (5) `sembrar`/`reiniciar` (desarrollo) **no corren con `NODE_ENV=production`**: `reiniciarDesarrollo` ya lo rechaza; `sembrarTodo` gana el mismo rechazo.
- En la demo se ejecuta desde el VPS: `docker compose --env-file ../.env run --rm --no-deps -e ZYDESK_DEMO=true -e ZYDESK_DEMO_CONFIRMAR=zydesk zydesk-api demo --reiniciar` (el `.env` ya trae `ZYDESK_DEMO=true` y `DEMO_PASSWORD`; en la instalación definitiva ambas están vacías y la guía dice que así deben quedar).
- Las cuentas de la demo nacen con `debe_cambiar_contrasena = false` y `terminos_aceptados_version` = la vigente (para que el equipo entre y use la app sin trámites); una sola `DEMO_PASSWORD` común que el usuario comunica fuera de la app. La semilla **no** crea vínculos de Telegram, códigos ni `aviso_envio`; sí avisos en la app (`en_app = true`) construidos con `construirAviso` (ADR 0027.23).
- Separación: `semillas/demo/` no importa nada de `semillas/desarrollo*.ts` salvo utilidades puras si las hay (p. ej. `jornada`); comparte `sembrarBase` (ya corre al arrancar). La semilla de desarrollo **no cambia**.

### 11.2 Archivos de ejemplo

La demo necesita archivos reales en disco para que fotos, correos y respaldos de aprobación se abran: `semillas/demo/archivos/` trae **un puñado de archivos pequeños y libres**, generados en el repo (sin datos personales ni EXIF): 6 fotos JPG sintéticas (gradientes/formas con el código del ticket superpuesto, ≤ 150 KB cada una, generadas con un script `tsx` que usa `pngjs`… **no**: sin dependencias nuevas; se generan **una vez** a mano con cualquier herramienta y se versionan como binarios, ≤ 1 MB en total), 2 `.eml` ficticios (de `contacto@<cliente ficticio>.cl`), 2 PDF de una página («Orden de compra OC-2026-…», «Aprobación cotización COT-…», generados con pdfmake en el propio script de semilla, no versionados), 1 `.xlsx` (generado con exceljs en la semilla). La semilla los copia a `ARCHIVOS_DIR/demo/aaaa/mm/<uuid>.<ext>` a través de `StorageLocal` y crea las filas `archivo` con `categoria`, `tipo_mime` y `tamano` reales. Si el usuario prefiere no versionar binarios, las fotos también se generan en la semilla como PNG planos de un color con `Buffer` a mano (sin librería): §18.16.

### 11.3 Historia de la demo — **APROBADA por el usuario el 2026-10-05 (F9-T9)**

> El usuario pidió que se le avise antes de crear estos datos. El usuario aprobó esta historia tal cual el 2026-10-05, con un solo cambio: las cuentas usan `@demo.zytech.dev` (subdominio suyo; el dominio no envía correo) y los contactos de clientes, dominios reservados `.test`. Todo es ficticio: empresa, personas, clientes, RUT (válidos por dígito verificador pero inventados), correos (`@demo.zytech.dev` y dominios reservados `.test`), teléfonos (`+56 9 0000 …`). Ningún nombre coincide con los de las semillas de desarrollo ni con personas reales del equipo del usuario.

**La organización**: **Servicios Técnicos Patagua** («Patagua»), empresa chilena de soporte TI y mantención electromecánica para pymes, 12 personas, oficina central en Santiago y una base en Rancagua. `nombre_app` = «Zydesk · Demo Patagua»; logo: un SVG simple generado (círculo + «P»), ≤ 20 KB, en `configuracion.logo`.

**Departamentos**: Mesa de ayuda (L–V 08:30–18:00, viernes hasta 16:30, colación 13:00 60 min, extendido desde 19:00, 80 % para tickets), Terreno (L–V 08:00–17:00, 90 %), Coordinación (L–V 09:00–18:00, 50 %). Feriados: los de `feriados-cl.json` más uno propio de Terreno («Aniversario base Rancagua»).

**Personas (12; correos `<usuario>@demo.zytech.dev`)**: Administración: Paula Hidalgo (`phidalgo`, Coordinación). Coordinación: Rodrigo Álamos (`ralamos`, Mesa de ayuda) y Carolina Bustos (`cbustos`, Coordinación). Técnicos: Andrés Loyola (`aloyola`, Mesa), Daniela Pizarro (`dpizarro`, Mesa), Felipe Carrasco (`fcarrasco`, Terreno), Marcela Núñez (`mnunez`, Terreno), Joaquín Riquelme (`jriquelme`, Terreno), Antonia Sepúlveda (`asepulveda`, Mesa), Gonzalo Tapia (`gtapia`, Mesa). Solo lectura: Ximena Arrau (`xarrau`, Coordinación; gerencia) e Ignacio Vera (`ivera`, Coordinación; finanzas, **desactivado** para mostrar el estado). Colores de avatar distintos entre sí.

**Categorías (7)** con responsable propuesto y plazos (respuesta h / resolución alta en días): ERP y facturación (Loyola, 2 h/1 d), Redes y conectividad (Carrasco, 1 h/1 d), Correo y colaboración (Pizarro, 2 h/2 d), Equipos y periféricos (Núñez, 4 h/3 d), Accesos y cuentas (Sepúlveda, 4 h/1 d), Climatización y energía (Riquelme, 4 h/3 d), Proyectos y mejoras (Álamos, 8 h/10 d).

**Clientes (7 externos + 3 áreas internas)**: Frutícola Valle de Aconcagua SpA (bolsa de 20 h/mes, tarifas por cliente en CLP: 36 000 / 44 000), Clínica Dental Sonrisa Austral Ltda. (tarifas en **UF**: 0,85 / 1,05), Transportes Río Claro S.A., Colegio Bicentenario Los Aromos (sin fines de lucro; OT internas frecuentes), Inmobiliaria Cumbres del Maipo, Panadería y Pastelería Doña Rosa EIRL (cliente chico, 1 ticket), Constructora Puente Alto Norte Ltda. (cliente con cotización rechazada). Cada uno con 1–3 contactos (nombre, cargo, correo `@<cliente>.test`, teléfono ficticio) y RUT válido inventado. Áreas internas: Administración y Finanzas, Operaciones, Base Rancagua. Tarifas globales: hora normal $38 000, extendida $45 000, urgencia $60 000, traslado $450/km, costo interno $18 000, IVA 19 %, validez 30 días, condiciones por defecto («Precios netos… pago a 30 días…»).

**Numeración**: `TK-` correlativo desde 2000 (dígitos 4), `OT-` desde 300.

**Tickets (36, repartidos en las últimas 10 semanas respecto de la fecha de carga; fechas relativas a `hoy`, nunca fijas)**: 8 Nuevos (3 de hoy, 2 desde correo `.eml`), 9 En curso (2 vencidos, 3 que vencen hoy o mañana, 1 detenido hace 5 días), 4 En espera (2 del cliente, 1 de proveedor, 1 interno), 10 Resueltos (6 archivados, 4 recientes), 3 Descartados (con motivo), 2 Duplicados (apuntando a originales). Prioridades repartidas (6 urgentes, 10 altas, 14 medias, 6 bajas). Cada ticket con descripción de 2–4 frases coherente con su categoría, 1–6 seguimientos/notas con menciones reales entre personas, tareas (≈ 40 en total, mitad hechas), `horas_estimadas` en los abiertos, y el historial (`evento`) que la propia secuencia genera (creado → asignado → cambios de estado). 4 tickets con fotos (las de §11.2), 2 con correo original y adjunto extraído.

**OT (11)**: 6 facturables y 5 internas. Facturables: OT-0300 Frutícola (cerrada, cotización CLP v1 aprobada $412 000 neto, **facturada** F-2041, descuenta de la bolsa), OT-0301 Clínica (cerrada, cotización en **UF** v2 aprobada, UF 9,40 neto con `valor_uf` de la demo, **por facturar**), OT-0302 Transportes (en ejecución, cotización CLP aprobada con OC `OC-7781`, tareas con horas reales), OT-0303 Constructora (cotizada, v1 **rechazada**, v2 enviada «esperando al cliente»), OT-0304 Inmobiliaria (borrador con cotización en borrador, importar horas pendiente), OT-0305 Panadería (**cancelada** con motivo). Internas: OT-0306 Colegio (aprobada, en ejecución, costo interno visible), OT-0307 Operaciones (borrador «por aprobar» con aprobador Bustos → aparece en su Mi día), OT-0308 Base Rancagua (cerrada que **no resolvió** el ticket: volvió a En curso), OT-0309 Administración y Finanzas (cerrada con nueva OT → OT-0310), OT-0310 (en ejecución). Cada OT con 2–5 tareas, mensajes con «Copiar al ticket» en 3, archivos en 4 (respaldo de aprobación PDF en las aprobadas).

**Cotizaciones (8)**: las descritas arriba; una plantilla aplicada («Visita técnica estándar»), una con horas importadas de tareas, descuentos en 2 líneas, una sin IVA (Colegio, exenta: `aplica_iva = false`). `indicador_uf`: filas de los últimos 10 días hábiles con fuente `semilla` y valores plausibles alrededor de 41 1xx (crecientes); las cotizaciones guardan `valor_uf` con fuente `semilla` y fecha coherente. 3 plantillas.

**Horas (8 semanas)**: planilla de los 7 técnicos y de Álamos con 25–40 h/semana, mezcla de ticket, OT (con tarea) y «Sin ticket» («Reunión semanal», «Capacitación»), 10 % fuera de horario, totales que cuadran con la jornada de cada departamento; ninguna fila en fecha futura ni en OT cerrada (las horas de OT cerradas se registraron antes del cierre).

**Avisos**: 6–12 por persona activa (mezcla de leídos y sin leer), coherentes con los hechos anteriores (menciones reales, asignaciones, vencimientos, «OT por aprobar» para Bustos, «OT cerrada y lista para facturar» para Hidalgo/Álamos/Bustos); preferencias por defecto salvo Álamos (Telegram apagado en `seguimiento`).

**Auditoría**: `ingreso_ok` de cada persona en días recientes desde IPs privadas ficticias (`10.20.0.x`), 2 `ingreso_fallido`, 1 `contrasena_restablecida`, `config_cambiada` de tarifas y numeración, 1 `exportacion` de OT. Sin `cuenta_bloqueada`.

**Lo que la demo debe permitir mostrar** (checklist de F9-T10 y §17): Mi día con las cinco listas no vacías para Álamos y Bustos; Tablero con las 4 columnas pobladas; Línea de tiempo con vencidos; detalle de ticket con fotos, correo original, tareas y OT vinculadas; OT en cada etapa; cotizador con CLP y UF, versiones y rechazada; `/ots` con los cuatro indicadores y «Exportar para facturación»; Horas con 8 semanas; Reportes del mes y de los últimos 90 días con cifras no triviales (horas facturables ≈ 55–65 %, 2 personas sobre el 100 % de carga, resolución por prioridad con una sobre plazo); Avisos con sin leer; Configuración completa; Ayuda con capturas.

### 11.4 Cifras verificables (`demo.test.ts`, BD real, `ZYDESK_DEMO=true` solo en el test)

Tras `sembrarDemo` dos veces: 12 usuarios (1 inactivo), 3 departamentos, 7 categorías, 10 clientes (7 externos), 1 bolsa, 2 clientes con `tarifa_cliente` (uno en UF), 36 tickets (6 archivados), 11 OT, 8 cotizaciones, 3 plantillas, 10 `indicador_uf`, ≥ 14 archivos con su archivo en disco (`fs.stat` de cada `clave`), `registro_horas` sin fechas futuras ni en OT finales, avisos ≥ 60, `GET /api/mi-dia` como Álamos con las 5 listas no vacías, `GET /api/reportes` del mes con `tickets_cerrados > 0` y `horas_facturables_pct` entre 40 y 80, todos los `evento` con `req_id` nulo (semilla), ninguna fila con correo que no termine en `@demo.zytech.dev` o `.test`. Guardas: sin `ZYDESK_DEMO` → sale 1 sin conectar; con un usuario `real@empresa.cl` en la base → sale 1 y la base no cambia; `--reiniciar` sin `ZYDESK_DEMO_CONFIRMAR` → sale 1. El test de permisos genérico no cambia (no hay rutas nuevas). Las cifras exactas se fijan al aprobar la historia; si el usuario cambia la historia, cambian aquí.

## 12. Versionado SemVer y publicación (bloque 9A; ADR 0032)

1. **Una sola versión para todo el monorepo**: raíz y los cuatro workspaces llevan el **mismo** `version` (hoy `0.1.0`). Script raíz `version:fijar` = `npm version <X.Y.Z> --workspaces --include-workspace-root --no-git-tag-version` (sin dependencias nuevas), que también actualiza `package-lock.json`. No se publica en npm (`private: true`).
2. **La API expone la versión** en `/api/salud.version` (ya) y en cada log (`version`, ADR 0017), leyéndola de `apps/api/package.json`: por eso debe coincidir con la etiqueta (sin `v`). `desplegar.sh` lo comprueba (§5.5.11). El bot hace lo mismo con `apps/bot/package.json`.
3. **Etiquetas**: `vX.Y.Z` anotadas (`git tag -a`), solo sobre commits de `main`; prelanzamientos `vX.Y.Z-rc.N` admitidos para ensayar un despliegue (pueden apuntar a la rama de la fase; §18.2). SemVer: MAJOR para cambios incompatibles de datos o de API que exijan intervención (migraciones destructivas, cambio de contrato del bot), MINOR para fases/funcionalidades, PATCH para correcciones. Una fase = un MINOR salvo decisión contraria.
4. **CHANGELOG** (Keep a Changelog, ADR 0012): `[Unreleased]` se renombra a `[1.0.0] - AAAA-MM-DD` al cerrar la fase y se agrega un `[Unreleased]` vacío arriba; se agregan enlaces de comparación al pie (`[1.0.0]: https://github.com/<owner>/<repo>/releases/tag/v1.0.0`). Las secciones «Pendientes…» se mueven a un apartado final «Pendientes conocidos» por versión (no se borran). Cada futuro PR escribe en `[Unreleased]`.
5. **Release de GitHub**: el workflow `desplegar.yml` **no** crea releases (permiso `contents: write` innecesario); el usuario crea la release en GitHub a mano desde la etiqueta con el texto del CHANGELOG, o no la crea (opcional).
6. **Quién etiqueta**: el usuario, tras el merge, con confirmación explícita (`git push` nunca lo hace el agente sin pedirlo, CLAUDE.md §5). La secuencia exacta está en §9.2.
7. **Imágenes**: tags `<etiqueta>` y `sha-<7>`; sin `latest` (un `latest` ambiguo contradice «lo que corre es una imagen trazable al commit», ADR 0020).
8. **v1.1.0** = correo entrante IMAP (ADR 0029.27), con su ADR; **no** entra aquí.

## 13. Pruebas

### 13.1 Qué registra esta fase (ADR 0003/0017)

| Acción                                                  | `evento`                                                                | `auditoria`           | logs                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Despliegue, migración, rollback, respaldo, restauración | —                                                                       | —                     | stdout del script (sin secretos) · `migración aplicada` de `cli.ts` · aviso Telegram |
| `db:demo` / `--reiniciar`                               | los que la propia historia genera (autor = persona de la demo o `null`) | las sembradas (§11.3) | `info` «semilla de demo aplicada» con conteos; `error` con el motivo de la guarda    |
| `GET /api/salud`                                        | —                                                                       | —                     | log de fin de petición (`info`), como hoy                                            |

Nada nuevo en `evento`, `auditoria`, `AccionAuditoria` ni `shared/eventos.ts`. `CLAUDE.md` §2 gana la fila «Despliegue, respaldo y restauración — / — (scripts de `docker/vps/`; registro en stdout y Telegram)».

### 13.2 Automáticas (lo que corre `npm test` y el CI)

- `env.test.ts`: `ZYDESK_DEMO`, `DEMO_PASSWORD`, las reglas de producción de §5.3 (`localhost`, contraseña de desarrollo, `debug`).
- `demo.test.ts` (§11.4) y las guardas de `sembrarTodo` en producción.
- `probar-imagenes.sh`, `desplegar.test.sh`, `01-roles.sh` efímero, `shellcheck` (solo en CI y a mano: necesitan Docker; no entran en `npm test`).
- Un test de la web para la versión en el pie (si se aprueba §18.13).
- Playwright `test:movil` sin cambios.

### 13.3 Playwright contra la demo (**opcional**, F9-T17)

`npm run test:movil -- --config apps/web/playwright.demo.config.ts` con `E2E_URL=https://desk.zytech.dev`, `E2E_PASSWORD` (= `DEMO_PASSWORD`) y usuarios de la demo equivalentes a `crojas`/`sdiaz`/`hikki` (Álamos / Loyola / Hidalgo), sin `webServer`, con `CF-Access-Client-Id/Secret` como `extraHTTPHeaders` si Access está activo. Los tests de **fotos** se excluyen (`grep-invert @escribe`: dejan seguimientos en la demo; aceptable pero ensucia). Las guardas `soloLocal`/`soloSemillas` siguen impidiendo `docs:capturas` contra la demo. Si el config duplica demasiado del actual, se parametriza el existente con `E2E_URL` (decisión al implementar). No es parte del CI.

### 13.4 Manuales (en §17)

Recorrido de las 14 pantallas en la demo a 1440 y 375 px, consola sin violaciones de CSP, descarga de archivos, PDF y `.xlsx`, vinculación de Telegram si hay bot, resumen diario al día siguiente, `docker compose ps` todo `healthy`, respaldo nocturno presente en el remoto, restauración ensayada.

## 14. Pruebas de seguridad obligatorias (F9-T15; PLAN §1 con foco en infraestructura)

1. **Contenedores**: `id -u` ≠ 0 en api, web y bot (§4.5.4); ningún `ports:` en `docker-compose.yml` (test: `docker compose config | grep -c 'published'` = 0); `zydesk-db` solo en `interna`; `cap_drop: [ALL]` + `cap_add` mínimo si nginx-unprivileged lo tolera (probar; si no, se anota); `read_only: true` con `tmpfs` para `/tmp` en `web` (api y bot escriben en sus volúmenes y en `/tmp` de multer → `tmpfs: /tmp`); `security_opt: [no-new-privileges:true]` en los cuatro. Imágenes escaneadas con `docker scout cves` o `trivy image` (a mano): sin CRITICAL conocidas con corrección disponible en la base; resultado anotado en §21.
2. **Secretos**: `git ls-files | xargs grep -lE 'ghp_|AKIA|BEGIN (OPENSSH|RSA) PRIVATE|age-secret-key|[0-9]{9}:[A-Za-z0-9_-]{35}'` vacío; `.env.produccion.example` sin valores reales; `docker image history` de las tres imágenes sin `ENV` ni `ARG` con secretos; los workflows no imprimen `env` ni usan `::add-mask::` como excusa para interpolar; `desplegar.sh` con `ZYDESK_SIMULAR=1` y un `.env` falso: la salida no contiene ninguna de las contraseñas del `.env` (test en `desplegar.test.sh`); `docker inspect zydesk-api` muestra las variables (inevitable para quien tiene acceso al socket de Docker = root; documentado como riesgo asumido, ADR 0020).
3. **CD**: `permissions` de cada workflow mínimos (`contents: read`; `packages: write` solo en `imagenes`); ninguna acción sin SHA (`grep -E 'uses: .*@v[0-9]'` vacío); `pull_request_target` ausente; la etiqueta pasa siempre por `env:` y regex; `StrictHostKeyChecking=yes` con `known_hosts` del secreto; la llave se borra `always()`; el environment `produccion` tiene revisor obligatorio y los tres secretos solo ahí (verificación manual con captura descrita, no imagen, en §21); en el VPS `sshd -T -C user=zydesk-deploy` muestra `passwordauthentication no`, `permittty no`, `forcecommand /srv/apps/zydesk/desplegar.sh`; `ssh zydesk-deploy@host 'ls /'` devuelve «etiqueta inválida» y nada más; `ssh zydesk-deploy@host v9.9.9` (etiqueta inexistente) falla en `git checkout` sin tocar los contenedores.
4. **HTTPS y cookies**: ingreso por `https://desk.zytech.dev` deja `__Host-sesion` con `Secure; HttpOnly; SameSite=Lax; Path=/`; `curl -H 'X-Forwarded-Proto: http'` directo a `zydesk-web` desde dentro de la red → la API responde pero la cookie sigue `Secure` (Express la marca igual: el navegador la descartaría; comprobar que no hay un camino `http` publicado). `auditoria.ingreso_ok.ip` = IP pública del cliente; dos ingresos desde dos redes distintas → dos IP distintas (si no, `PROXY_SALTOS` o `CF-Connecting-IP` están mal).
5. **CSP y cabeceras**: `curl -sI https://desk.zytech.dev/` con `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, sin `Server: nginx/x.y`, sin `X-Powered-By`; `curl -sI …/api/salud` con las de Helmet; recorrido de 14 pantallas con la consola abierta: 0 violaciones; `Content-Security-Policy-Report-Only` no se usa (sin endpoint de reportes).
6. **Respaldos**: el `.tar.age` no se abre sin la clave (`age -d` falla); el remoto solo contiene `.tar.age`; `rclone` con credenciales de **escritura sin borrado** si el proveedor lo permite (B4: en B2 una Application Key sin `deleteFiles`, con `lifecycle` del bucket haciendo la retención → el VPS comprometido no puede borrar los respaldos); el respaldo no incluye logs ni `.env`; `restaurar.sh` exige confirmación y verifica `sha256sum`.
7. **Demo sin datos sensibles**: `demo.test.ts` afirma que no hay correos fuera de los dominios ficticios; revisión a ojo de los textos de la historia (ningún nombre real); `nombre_app` «Zydesk · Demo Patagua»; los documentos legales siguen con `borrador: true` y su aviso visible; `/api/docs` solo con sesión de Administración (ya); `GET /api/salud` no revela más que `estado`, `version`, `bd` (ya); la `version` expuesta no es un secreto.
8. **Postgres**: `zydesk_app` no puede `UPDATE`/`DELETE` en `evento`/`auditoria` en la base de producción (`psql` como `zydesk_app` desde `docker compose exec`); el superusuario `postgres` no lo usa ningún servicio (solo `pg_dump`/`pg_restore` por `exec`); `pg_hba` por defecto de la imagen (md5/scram dentro de la red interna; sin puerto publicado).
9. **Dependencias**: `npm audit --omit=dev` sin HIGH/CRITICAL con corrección disponible (o justificadas en §21); `ua-parser-js` sigue en 1.x (CHANGELOG).
10. **Revisión de código de la fase**: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo (Dockerfiles, nginx, Compose, scripts, workflows, `env.ts`, semilla). Hallazgos confirmados → corrección con test (o con un paso del script de prueba) antes del PR.

## 15. Documentación (bloque 9F)

### 15.1 `docs/despliegue.md` — Guía de instalación (portátil; **instalación definitiva**)

Secciones: 1 Requisitos (Linux x86-64, Docker 27+ con Compose v2, 2 vCPU / 4 GB / 40 GB, un dominio con TLS delante, salida a internet para GHCR, Telegram, Boostr/mindicador y el remoto de respaldos); 2 Arquitectura (diagrama en texto de §6.1 y la variante sin Cloudflare: Caddy/nginx + certbot con los `proxy_set_header` exactos); 3 Preparar el servidor (`instalar-vps.sh` o sus pasos a mano; usuario `zydesk-deploy` solo si se usará el CD; sin CD, el operador corre `desplegar.sh <etiqueta>` a mano como root); 4 Variables y secretos (`.env.produccion.example` comentado línea a línea; generación; qué pasa al rotar cada uno; por qué `ADMIN_PASSWORD` se borra tras usarla); 5 Primer arranque (`desplegar.sh vX.Y.Z` → `migrar` → `admin --correo … --nombre …` → ingresar → cambiar contraseña → aceptar términos → **revisar y versionar los documentos legales** (E3; `borrador: false` y `version` nueva; quién es el responsable del tratamiento) → cargar departamentos, horarios, feriados del año, categorías, equipo, clientes, tarifas (CLP/UF), plantillas, numeración y marca (enlaces al manual de administración §2–§9, §14–§15) → Telegram (manual §17) → verificar `UF del día`); **`db:demo` y `db:sembrar` jamás en una instalación real** (y por qué no pueden); 6 Actualizar y volver atrás (§9.2); 7 Respaldos y restauración (§8; qué guardar fuera: clave `age`, `.env`, `rclone.conf`; ensayo trimestral de restauración recomendado); 8 Operación diaria (logs, salud, disco, `errores-ayer.sh`, rotación de claves, feriados de cada año, `ua-parser-js`); 9 Qué hacer si (la API no arranca por «Configuración inválida»; `pg-boss` sin `CREATE`; cookie que no se guarda = `X-Forwarded-Proto`; todos bloqueados por IP = `CF-Connecting-IP`/`PROXY_SALTOS`; UF desactualizada; Telegram no llega); 10 Mudanza desde la demo (cómo **no** llevar los datos de la demo: instalación limpia; qué sí se reutiliza: imágenes, Compose, scripts; cómo apagar la demo: `docker compose down`, respaldo final, borrar `/srv/data/zydesk`, quitar la ruta del túnel y la app de Access, borrar al usuario `zydesk-deploy` y los secretos del environment).

### 15.2 `docs/demo.md` — La demo en el VPS (esta fase)

Qué es y qué no es (§3.1), el checklist exacto que ejecutó el usuario en Nexus (fechas y resultados se anotan al final), cómo recargar los datos (`demo --reiniciar`), las cuentas y qué ve cada una (sin la contraseña), el guion de demostración de 20 minutos para el equipo (orden de pantallas y hechos de la historia: «Álamos entra a Mi día…»), cómo reportar observaciones (un ticket **en la propia demo** con categoría «Proyectos y mejoras» y asunto que empiece por «[Demo]»), qué se borra al terminar y el enlace a §15.1.10.

### 15.3 Lo demás

`docs/legal/README.md`: sección «Antes de datos reales» (marcadores, `borrador: false`, versión, quién revisa; E3). `README.md`: sección «Producción» corta que enlaza a las dos guías, scripts nuevos (`db:demo`, `version:fijar`), nota de que `docker-compose.yml` es producción y `docker-compose.dev.yml` desarrollo. `CLAUDE.md` §2 (fila de la tabla; regla de migraciones compatibles con la versión anterior; «`db:demo` solo con `ZYDESK_DEMO=true` y correos `@demo.zytech.dev`»), §6 (comandos nuevos), §7 (los `.sh` de `docker/` son para Linux: probarlos con Git Bash o WSL; `shellcheck`). `docs/manuales/administracion.md` §1 (enlace a la guía de despliegue para el `admin`), §12 (el respaldo lo hace `respaldar.sh`; enlace), §16 (`ZYDESK_DEMO`, `DEMO_PASSWORD` como variables «solo demo»). `docs/api/README.md`: una frase sobre `https://desk.zytech.dev/api` y Access (si aplica). `docs/CHANGELOG.md` (§12.4). ADR 0031 y 0032 con sus filas en `docs/decisiones/README.md`; la línea **Estado** de ADR 0020 gana «precisada por ADR 0031 (puerto 8080 de `web`, respaldo previo local, imágenes por digest, Dependabot para acciones)», la de 0017 «precisada por ADR 0031 (rotación de logs y alternativa con cron en la Fase 9)» y la de 0029 «precisada por ADR 0032 (versiones)». `preguntas-abiertas.md` **no se edita** (E2 y E3 se resuelven o se anotan en ADR 0031 según las respuestas de §19).

## 16. Tareas (en orden; cada una termina con `typecheck`, `lint`, `format:check`, los tests que le correspondan verdes y un commit convencional en español, sin `Co-Authored-By`)

| Tarea                                                              | Bloque | Crea/edita                                                                                                                                                                                                 | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F9-T1 ADR de versiones y `1.0.0`**                               | 9A     | `docs/decisiones/0032-versionado-y-publicacion.md`, `README.md` de decisiones, `package.json` × 5, `package-lock.json`, script `version:fijar`, CHANGELOG                                                  | §12 escrito en la ADR; `npm run version:fijar 1.0.0` deja los cinco `version` en `1.0.0` y el lock coherente; `npm ci` limpio; `/api/salud` devuelve `"version":"1.0.0"`; CHANGELOG con `[1.0.0] - <fecha prevista>` encabezado **provisional** marcado «(al cerrar)» y `[Unreleased]` vacío. Sin etiqueta todavía.                                                       |
| **F9-T2 Imagen de la API y del bot**                               | 9B     | `docker/api.Dockerfile`, `docker/bot.Dockerfile`, `docker/entrypoint-api.sh`, `.dockerignore`, `docker/probar-imagenes.sh` (parte api/bot)                                                                 | §4.1, §4.3, §4.4; `probar-imagenes.sh` pasa los puntos 1–5, 7 y 8 para api y bot; con un Postgres local, `docker run --network host -e DATABASE_URL=… zydesk-api:prueba migrar` aplica las 15 migraciones y `… node apps/api/dist/server.js` responde `/api/salud` 200 y arranca las 7 colas.                                                                             |
| **F9-T3 Imagen de la web y CSP**                                   | 9B     | `docker/web.Dockerfile`, `docker/nginx/zydesk.conf`, `docker/nginx/cabeceras.conf`, `probar-imagenes.sh` (parte web)                                                                                       | §4.2; punto 6 de §4.5; con `zydesk-api` local en una red Docker, recorrido de las 14 pantallas con las semillas de desarrollo a 1440 y 375 px: **0** violaciones de CSP en la consola, la ayuda muestra las capturas, el logo y el QR se ven, una foto se previsualiza y sube; `proxy_pass` conserva `/api/...`; subida de 19 MB pasa y de 21 MB responde 413 de la API.  |
| **F9-T4 Compose, roles y variables de producción**                 | 9C     | `docker-compose.yml`, `.env.produccion.example`, `docker/postgres-init-prod/{01-roles.sh,permisos.sql}`, `env.ts` (+ test), `.env.example`                                                                 | §5.1–§5.3; `docker compose config` sin `published`; en local con una red `web` creada a mano y un `.env` de prueba: `docker compose up -d` desde cero deja `db` sano, `run --rm zydesk-api migrar` aplica 15, `up -d` deja api/web `healthy` y `wget` interno a `/api/salud` 200; `env.test.ts` cubre las reglas de producción; `01-roles.sh` pasa su test efímero.       |
| **F9-T5 Scripts del VPS**                                          | 9C     | `docker/vps/{desplegar.sh,desplegar.test.sh,respaldar.sh,restaurar.sh,ensayar-restauracion.sh,instalar-vps.sh,archivar-logs.sh,errores-ayer.sh,sshd_zydesk-deploy.conf,zydesk.nginx-proxy.conf,README.md}` | §5.4, §5.5, §8, §10; `shellcheck` limpio; `desplegar.test.sh` verde (etiquetas inválidas, secuencia, reversión, respaldo fallido, salida sin secretos); `ensayar-restauracion.sh` en local termina con conteos y hashes idénticos y `permission denied` para `zydesk_app` sobre `evento` (usa la semilla de **desarrollo** hasta que exista la demo; se repite en T10).   |
| **F9-T6 CI: Node 24, imágenes y scripts**                          | 9D     | `ci.yml`, `.github/dependabot.yml`                                                                                                                                                                         | §9.3; CI verde en la rama con los pasos «Imágenes» y «Scripts del VPS»; ninguna acción sin SHA; el job sigue sin secretos; tiempo del job anotado en §21.                                                                                                                                                                                                                 |
| **F9-T7 CD: `desplegar.yml`**                                      | 9D     | `.github/workflows/desplegar.yml`                                                                                                                                                                          | §9.1; `actionlint` (binario descargado en el job, fijado por versión y checksum) limpio; `workflow_dispatch` con etiqueta inválida falla en `verificar-etiqueta` sin construir; con una etiqueta `v1.0.0-rc.0` sobre la rama (creada **solo** con confirmación del usuario) el job `imagenes` publica las tres imágenes en GHCR y `desplegar` queda esperando aprobación. |
| **F9-T8 Documentación de despliegue (borrador)**                   | 9F     | `docs/despliegue.md`, `docs/demo.md` (esqueleto), `docs/legal/README.md`, README, `CLAUDE.md`, manual §1/§12/§16, `docs/api/README.md`                                                                     | §15 completo salvo lo que depende de la demo real; una persona que solo lea `docs/despliegue.md` puede levantar Zydesk en un Linux limpio con Docker (prueba: Opus lo sigue al pie de la letra en una VM o en WSL y anota cada tropiezo).                                                                                                                                 |
| **F9-T9 Proponer la historia de la demo y esperar el visto bueno** | 9E     | esta spec (§11.3: de «BORRADOR» a «APROBADA el …» o a la versión corregida)                                                                                                                                | **Puerta**: el usuario responde con «aprobada» o con cambios; la spec registra la respuesta. **Nada de F9-T10 empieza antes.** Opus presenta §11.3 en el chat con un resumen de una pantalla (organización, personas, clientes, qué muestra) y las preguntas B7–B8.                                                                                                       |
| **F9-T10 Semilla de demo**                                         | 9E     | `semillas/demo/**`, `cli.ts`, `env.ts`, `demo.test.ts`, `semillas/demo/archivos/**`                                                                                                                        | §11.1, §11.2, §11.4 con las cifras de la historia aprobada; `npm run db:demo` dos veces en local (con `ZYDESK_DEMO=true`) deja las cifras; en el navegador el checklist «Lo que la demo debe permitir mostrar»; `ensayar-restauracion.sh` repetido con la demo; las guardas verdes; `desarrollo.test.ts` sin cambios.                                                     |
| **F9-T11 Versión en el pie de la web**                             | 9F     | `apps/web/src/app/**` (pie), test                                                                                                                                                                          | Solo si §18.13 se confirma: «Zydesk v1.0.0» en el pie, 12 px `data-letra="insignia"`, leído de `/api/salud`; `test:movil` sigue verde (sin cambios en `movil.spec.ts`).                                                                                                                                                                                                   |
| **F9-T12 Preparación del VPS (usuario)**                           | 9G     | nada en el repo; anota en `docs/demo.md`                                                                                                                                                                   | Con las respuestas a B1–B6: el usuario corre `instalar-vps.sh`, clona el repo, escribe `.env`, crea la llave `zydesk-deploy` y los 3 secretos del environment `produccion` con revisor, publica la ruta del túnel y (si B3) la app de Access; `ssh zydesk-deploy@host 'ls'` responde «etiqueta inválida».                                                                 |
| **F9-T13 Primer despliegue de la demo (`v1.0.0-rc.1`)**            | 9G     | etiqueta `v1.0.0-rc.1` (con confirmación), `docs/demo.md`                                                                                                                                                  | El CD construye y, aprobado, `desplegar.sh` levanta todo; `https://desk.zytech.dev/api/salud` → 200 (detrás de Access si aplica); `demo --reiniciar` carga la historia; ingreso con una cuenta de la demo deja `__Host-sesion` y la IP real en auditoría; recorrido §13.4; Telegram si B5.                                                                                |
| **F9-T14 Respaldo real y restauración ensayada**                   | 9G     | `docs/demo.md`                                                                                                                                                                                             | El cron deja un `.tar.age` local y en el remoto (B4); `restaurar.sh` sobre la demo reproduce conteos y hashes (§8.3); tiempos anotados; la clave `age` está también fuera del VPS (el usuario lo confirma).                                                                                                                                                               |
| **F9-T15 Revisión de seguridad de la fase**                        | —      | correcciones con test o con paso de script                                                                                                                                                                 | §14 completa (los 10 puntos), PLAN §1: Fable + Opus sobre el diff y sobre la demo viva; nada se mergea con hallazgos abiertos; `trivy`/`docker scout` y `npm audit` anotados en §21.                                                                                                                                                                                      |
| **F9-T16 Ensayo de actualización y rollback**                      | 9G     | etiqueta `v1.0.0-rc.2`, `docs/demo.md`                                                                                                                                                                     | §9.2 ensayo completo (rc.1 → rc.2 → rc.1 → rc.2) con salud 200 y aviso de Telegram en cada paso; tiempos anotados; `pre-despliegue/*.dump` presentes.                                                                                                                                                                                                                     |
| **F9-T17 Playwright contra la demo (opcional)**                    | —      | `apps/web/playwright.demo.config.ts` o parametrización                                                                                                                                                     | §13.3: la suite (sin `@escribe`) verde contra `https://desk.zytech.dev`; si Access lo impide sin Service Token y el usuario no quiere crearla, se anota y se omite.                                                                                                                                                                                                       |
| **F9-T18 ADR 0031, cierre, PR y `v1.0.0`**                         | 9F     | `docs/decisiones/0031-precisiones-de-la-fase-9.md`, README de decisiones, líneas Estado de 0017/0020/0029, CHANGELOG `[1.0.0]` con fecha, esta spec §21                                                    | Criterios de §17 desde un clon limpio; PR a `main` con CI verde **con confirmación del usuario** antes de abrirlo y de mergearlo; tras el merge, el usuario crea y empuja `v1.0.0` (§9.2); el CD despliega `v1.0.0` en la demo con aprobación; `/api/salud` → `"version":"1.0.0"`. Las etiquetas `rc` se conservan (historia del ensayo).                                 |

## 17. Criterios de aceptación de la fase (verificación final, en este orden)

```
# Local (Windows + Docker Desktop o WSL)
npm ci && npm run typecheck && npm run lint && npm run format:check                      → 0 errores
npm test                                                                                 → verde (api incluye env.test y demo.test con ZYDESK_DEMO=true solo en el test)
docker/probar-imagenes.sh                                                                → 8/8 por imagen; uid 1000/101/1000; tamaños impresos
shellcheck docker/**/*.sh && docker/vps/desplegar.test.sh                                → limpio / verde (sin secretos en la salida)
docker network create web; cp .env.produccion.example .env.prueba (+ valores de prueba)
docker compose --env-file .env.prueba up -d zydesk-db                                    → healthy; 01-roles.sh creó zydesk_owner y zydesk_app
docker compose --env-file .env.prueba run --rm zydesk-api migrar                         → 15 migraciones aplicadas
docker compose --env-file .env.prueba up -d                                              → api y web healthy; sin puertos publicados (docker compose ps)
docker compose exec -T zydesk-web wget -qO- http://zydesk-api:3000/api/salud             → {"estado":"ok","version":"1.0.0","bd":"ok"}
docker compose run --rm -e ZYDESK_DEMO=true -e ZYDESK_DEMO_CONFIRMAR=zydesk zydesk-api demo --reiniciar  → cifras de §11.4
docker compose run --rm zydesk-api demo (sin ZYDESK_DEMO)                                → exit 1, "solo corre con ZYDESK_DEMO=true", sin conectar
docker/vps/ensayar-restauracion.sh                                                       → conteos y hashes idénticos; permission denied para zydesk_app en evento
npm run db:reiniciar (base de desarrollo)                                                → sin cambios respecto de la Fase 8b (18 tickets, 7 OT, 5 cotizaciones, 4 tarifa_cliente, 1 indicador_uf)
npm run api:openapi && git diff --exit-code docs/api/openapi.json                        → sin diff (ninguna ruta cambia)
git ls-files | xargs grep -lE '<patrones de §14.2>'                                      → vacío

# GitHub
CI verde en la rama y en el PR (job verificar con «Imágenes» y «Scripts del VPS»; ≤ 12 min; sin secretos)
grep -rE 'uses: .*@v[0-9]' .github                                                       → vacío (todo por SHA; Node 24 en checkout/setup-node/upload-artifact)
Desplegar v1.0.0-rc.N: imagenes publica ghcr.io/<owner>/zydesk-{api,web,bot}:<etiqueta>; desplegar espera aprobación; aprobado → salida del script sin secretos

# Demo (desk.zytech.dev)
curl -sI https://desk.zytech.dev/ (con Service Token si Access)                          → 200, CSP, X-Frame-Options DENY, sin Server nginx/x.y
curl -s https://desk.zytech.dev/api/salud                                                → {"estado":"ok","version":"<etiqueta>","bd":"ok"}
Ingreso con una cuenta de la demo                                                        → Set-Cookie __Host-sesion …; Secure; HttpOnly; SameSite=Lax; auditoria.ip = IP pública real
Recorrido de 14 pantallas a 1440 y 375 px                                                → 0 violaciones de CSP; fotos, PDF, .xlsx, ayuda con capturas, QR (si bot)
docker compose ps en el VPS                                                              → 3 (o 4) servicios healthy/running; docker compose config sin published
Respaldo nocturno                                                                        → .tar.age local y en el remoto; respaldar.log con la línea del día; nada sin cifrar fuera
restaurar.sh sobre la demo                                                               → conteos y hashes idénticos; tiempo anotado
Ensayo rc.1 → rc.2 → rc.1 → rc.2                                                         → 4 despliegues con salud 200 y 4 avisos de Telegram; pre-despliegue/*.dump presentes
ssh zydesk-deploy@host 'ls /' ; ssh … 'v9.9.9'                                           → "etiqueta inválida" / falla en checkout sin tocar contenedores
sshd -T -C user=zydesk-deploy | grep -E 'passwordauthentication|permittty|forcecommand'  → no / no / desplegar.sh
Tras el merge: etiqueta v1.0.0 desplegada en la demo; /api/salud "version":"1.0.0"; CHANGELOG [1.0.0] con fecha
```

Detener los procesos locales de desarrollo con `taskkill /PID <pid> /T /F` (CLAUDE.md §7); `docker compose --env-file .env.prueba down -v` y `docker network rm web` al terminar la verificación local.

## 18. Decisiones tomadas en esta spec (con justificación)

1. **Demo en modo producción real, no un «staging» relajado**: todo lo que se ensaya (HTTPS, `__Host-`, CD con aprobación, respaldos cifrados, migraciones al desplegar) es exactamente lo que necesitará la instalación definitiva; una demo con atajos no habría probado nada. Lo único que la distingue es el origen de los datos (`db:demo`) y el nombre visible.
2. **Prelanzamientos `vX.Y.Z-rc.N` admitidos** (precisa ADR 0020, cuya regex no los aceptaba): sin ellos el primer despliegue real sería `v1.0.0`, sin margen para fallar; con `rc` se ensaya el CD completo (incluido el rollback) antes de la etiqueta definitiva. Las `rc` pueden apuntar a la rama de la fase; la final solo a `main`. Pregunta §19.13.
3. **Dos guías**: la decisión 1 del usuario obliga a que lo que se ejecuta (demo en Nexus) y lo que se entrega (instalación portátil) sean documentos distintos; mezclarlos haría que la empresa heredara pasos de Nexus que no aplican (red `web`, túnel, `nexus-infra`).
4. **`nginx-unprivileged` en 8080** en vez de `nginx:alpine` como root: cumple «usuario no root» sin `cap_add`; el único costo es cambiar `zydesk-web:80` por `:8080` en el `.conf` de nginx-proxy (ADR 0020 queda precisado). Pregunta §19.14 por si el usuario prefiere lo contrario.
5. **CSP desde nginx para la web, Helmet para la API**: la web es estática y nginx es el lugar natural; la API ya tiene Helmet. `style-src 'unsafe-inline'` es el único relajo y está justificado por Radix/Recharts/sonner; `script-src 'self'` estricto es lo que importa contra XSS. Pasar a nonces para estilos tocaría cada componente: fuera de alcance, anotado como mejora.
6. **Node 22 en runtime, Node 24 solo en las acciones**: ADR 0001 fija Node 22 LTS y `.nvmrc`/`engines` lo exigen; subir el runtime en la fase de puesta en marcha mezclaría dos riesgos. Lo que GitHub retira es el Node que ejecuta las **acciones** (`checkout`, `setup-node`, `upload-artifact`), que no tiene relación con el Node de la app. Subir a Node 24 en runtime es una tarea menor para la v1.1.0 (cuando sea LTS activo y `argon2`/`pg` lo soporten en Alpine).
7. **Imágenes y acciones por digest/SHA**: coherente con ADR 0020 («fijadas por SHA»); un tag flotante (`16-alpine`, `v4`) puede cambiar bajo los pies. Dependabot para `github-actions` mantiene los SHA sin trabajo manual; para npm no, porque las actualizaciones se revisan con la suite y a mano.
8. **Respaldos cifrados con `age` antes de salir del VPS y copiados con `rclone`**: E2 pedía un destino externo; D1 dice que el VPS tiene un solo punto de restauración. `age` es un binario sin dependencias, con claves cortas, más simple que GPG; `rclone` cubre cualquier proveedor (B2, R2, S3, SFTP). El respaldo nocturno lo hace root (acceso al socket de Docker y a la clave); el despliegue no necesita root (decisión 9). Pregunta §19.4 (destino) y §19.8 (dónde vive la clave privada).
9. **Respaldo previo al despliegue local y sin cifrar**: ADR 0020 pedía `pg_dump` antes de desplegar; hacerlo con el script de root exigiría `sudo` para `zydesk-deploy` (más superficie) y el cifrado no aporta nada en un dump que vive 5 despliegues en el propio VPS (si el VPS está comprometido, la base también). Los dumps `pre-despliegue/` son 700 de `zydesk-deploy`.
10. **Loki + Grafana + Alloy no entran por defecto**: para 12 personas y una demo, la alternativa con cron de ADR 0017 (logs gzip 30 días, `zgrep`) y el aviso de errores por Telegram cubren el diagnóstico; el stack de observabilidad son tres contenedores más que mantener, un subdominio más detrás de Access y ≈ 1 GB de RAM. ADR 0017 lo preveía como opción; la decisión queda en el usuario (§19.10) y, si dice que sí, es un bloque aparte con su propia tarea (no bloquea la v1.0.0).
11. **Salud externa**: con Access delante, un monitor externo necesita Service Token; recomendación: monitorear desde dentro (healthchecks + `errores-ayer.sh`) y, si el usuario quiere un monitor externo gratuito (UptimeRobot, Better Stack), crear la Service Token solo para `/api/salud` con una política «Service Auth». Pregunta §19.11.
12. **Semilla de demo con guardas duras**: la decisión 2 del usuario exige que la demo tenga datos ficticios, pero el riesgo real es que `db:demo` corra alguna vez sobre la instalación definitiva. Tres candados independientes (`ZYDESK_DEMO=true`, correos `@demo.zytech.dev` exclusivos, `ZYDESK_DEMO_CONFIRMAR` para borrar) hacen que un error de operación no baste; `sembrar`/`reiniciar` de desarrollo quedan además prohibidos con `NODE_ENV=production`.
13. **Versión visible en el pie de la web**: es el único cambio de interfaz y rompe la regla «ningún cambio funcional», pero sin él el equipo de la demo no puede decir «vi la v1.0.0-rc.2» y el ensayo de rollback no se ve desde la web; 15 líneas y un test. Pregunta §19.15.
14. **Datos de la empresa en el PDF (RUT, razón social, dirección) no entran**: pendiente de la Fase 4, pero es una funcionalidad nueva (pantalla de Configuración, columna o clave nueva, cambio del PDF); la demo usa el nombre y el logo de la marca que ya existen. Va a la v1.1.0 con el correo entrante salvo que el usuario lo adelante (§19.16).
15. **Una instancia de la API** (§7.2): nada en el código fue diseñado para dos despachadores; la escala no lo pide.
16. **Archivos de la demo generados o versionados pequeños**: la demo sin archivos reales no permite mostrar fotos, correos ni respaldos de aprobación; versionar ≤ 1 MB de binarios sintéticos es aceptable (ya hay 3,5 MB de capturas). Los PDF y `.xlsx` se generan en la semilla con las librerías existentes. Pregunta §19.17.
17. **Numeración de las ADR**: por indicación del usuario, **ADR 0031 = «Precisiones de la Fase 9»** (se escribe al cerrar) y **ADR 0032 = «Versionado y publicación»** (se escribe en F9-T1, al inicio). El orden cronológico de escritura es el inverso; se acepta para respetar la instrucción recibida y porque el número no implica fecha (cada ADR lleva la suya). Si el usuario prefiere invertirlas, es un renombrado antes de F9-T1 (§19.18).
18. **Migraciones compatibles con la versión anterior** como regla de `CLAUDE.md`: es lo que hace que el rollback automático de `desplegar.sh` sea seguro sin restaurar la base; no cuesta nada en las migraciones típicas y evita el caso peor (API vieja contra esquema nuevo con columna `NOT NULL` sin default).

## 19. Preguntas para el usuario

### Bloqueantes (la tarea indicada no puede ejecutarse sin la respuesta; todo lo demás avanza mientras tanto)

1. **B1 · Estado real de Nexus (bloquea F9-T12/T13).** ADR 0020 describe el VPS a partir de tu vault (Ubuntu, Docker, ufw solo 22, `cloudflared`, `nginx-proxy` en la red externa `web`, `/srv/apps/nexus-infra/proxy/conf.d/`, `/srv/apps/<proyecto>/`, `/srv/data/<proyecto>/`). ¿Sigue siendo así hoy (versión de Docker/Compose, nombre exacto de la red, ruta del `conf.d`, cómo se recarga nginx-proxy, si `zstd`, `age`, `rclone` y `flock` están o se pueden instalar)? **Recomendación**: pégame la salida de `docker --version && docker compose version && docker network ls && ls /srv/apps /srv/apps/nexus-infra/proxy/conf.d && which age rclone zstd flock` y los scripts se ajustan a eso; si falta algo, `instalar-vps.sh` lo instala desde los repos de Ubuntu.
2. **B2 · Pasos de root en el VPS (bloquea F9-T12).** Crear `zydesk-deploy`, tocar `sshd_config.d`, el cron y `sudoers` requieren root y los haces tú (el agente no entra al VPS). ¿De acuerdo con que `instalar-vps.sh` los haga en un solo paso (tú lo revisas antes de correrlo) y con `PasswordAuthentication no` **global** aprovechando el cambio (ADR 0020 lo recomienda; hoy sigue activo)? **Recomendación**: sí a ambas; el script imprime cada acción y pide confirmación antes de recargar `sshd` (y deja una sesión abierta hasta verificar que la llave entra).
3. **B3 · Cloudflare Access en la demo (bloquea F9-T12 y la forma de F9-T13/T17).** ¿Activas Access delante de `desk.zytech.dev` ya en la demo, con OTP por correo y la lista de correos del equipo, o la demo va solo con contraseña? **Recomendación**: sí, Access desde la demo (es exactamente lo que E1 resolvió y así el equipo lo vive desde el primer día); con Service Token solo si quieres monitor externo o Playwright remoto.
4. **B4 · Destino externo de los respaldos (E2; bloquea F9-T14 y la configuración de `rclone`).** ¿Backblaze B2, Cloudflare R2, S3, un SFTP/servidor de la empresa, o Google Drive/OneDrive? ¿Quién paga la cuenta y quién guarda las credenciales? **Recomendación**: **Backblaze B2** (≈ USD 6/TB/mes, 10 GB gratis: la demo cabe), bucket privado con **Application Key sin permiso de borrado** y reglas de ciclo de vida del bucket haciendo la retención (90 días), para que un VPS comprometido no pueda borrar los respaldos. Si prefieres no abrir ninguna cuenta ahora, la demo arranca con respaldos **solo locales** (el script lo tolera) y queda anotado como riesgo abierto hasta la instalación definitiva.
5. **B5 · Telegram en la demo (bloquea la parte del bot de F9-T13).** ¿Creas un bot **nuevo** en BotFather para la demo (distinto del de desarrollo), y un chat/grupo para `TELEGRAM_CHAT_ADMIN`? ¿Quieres que el equipo vincule sus Telegram reales en la demo? **Recomendación**: sí al bot de demo y al chat de avisos (los avisos de despliegue y respaldo son útiles desde ya); la vinculación de personas reales es opcional y los `chat_id` se quedan en la base de la demo (se borra al apagarla).
6. **B6 · Dueño de GHCR y del environment (bloquea F9-T7).** Las imágenes irán a `ghcr.io/<owner>/zydesk-{api,web,bot}`: ¿`owner` = tu usuario `HikkizZ` (el repo es personal) o una organización? ¿Tú eres el único revisor obligatorio del environment `produccion`? Los paquetes GHCR nacen **privados** aunque el repo sea público: hay que ponerlos públicos a mano una vez (ADR 0020). **Recomendación**: tu usuario, tú como único revisor, paquetes públicos (el `desplegar.sh` hace `pull` sin credenciales).
7. **B7 · Historia de la demo (bloquea F9-T10).** ¿Apruebas el borrador de §11.3 tal cual, o qué cambias (nombre de la empresa, cantidad de personas, clientes, mezcla de casos, idioma de los nombres)? **Recomendación**: aprobarlo con los ajustes que quieras en el chat de F9-T9; cualquier cambio se refleja en §11.3 antes de implementar. Nota: ningún nombre debe coincidir con personas o clientes reales de tu empresa; si quieres que la demo «se parezca» a tu operación real, dime los **tipos** de clientes y casos, no los nombres.
8. **B8 · Cuentas de la demo (bloquea F9-T10).** Una sola `DEMO_PASSWORD` para las 12 cuentas, sin cambio obligatorio, con términos ya aceptados (§11.1), ¿o prefieres que cada persona del equipo reciba una cuenta propia creada por ti desde Configuración con contraseña temporal? **Recomendación**: la primera para «mirar», y además **una cuenta por persona real del equipo** creada por ti en la demo (con correo real: es solo el identificador; no se envía correo) para que registren observaciones con su nombre; esas cuentas no las crea la semilla y `demo --reiniciar` las borra (se avisa en `docs/demo.md`).

### No bloqueantes (se implementan con la recomendación si no hay respuesta, regla acordada en la Fase 7)

9. **B9 · Grafana/Loki/Alloy ahora o después.** ADR 0017 lo preveía para esta fase. **Recomendación**: después (decisión §18.10); la alternativa con cron entra ahora.
10. **B10 · Monitor externo de disponibilidad.** ¿Quieres UptimeRobot/Better Stack sobre `/api/salud` (gratis), con Service Token de Access? **Recomendación**: no en la demo; sí en la instalación definitiva (la guía lo describe).
11. **B11 · Hora y retención de respaldos.** 02:30 Santiago, 14 días locales, 90 remotos, 5 dumps pre-despliegue. **Recomendación**: esos valores.
12. **B12 · Clave privada `age`**: ¿también en el VPS (restauración rápida) o solo fuera (más seguro, restauración exige traerla)? **Recomendación**: en ambos lados; si el VPS se compromete, el atacante ya tiene la base viva.
13. **B13 · Etiquetas `rc`** para ensayar antes de `v1.0.0` (§18.2). **Recomendación**: sí, `v1.0.0-rc.1`/`rc.2`.
14. **B14 · `nginx-unprivileged` en 8080** (§18.4) o `nginx` root en 80. **Recomendación**: unprivileged.
15. **B15 · Versión en el pie de la web** (§18.13). **Recomendación**: sí.
16. **B16 · Zona horaria del host del VPS** (para expresar el cron de respaldo; si está en UTC, `30 2` Santiago = `30 5`/`30 6` UTC según horario de verano). **Recomendación**: cron con `CRON_TZ=America/Santiago` si el `cron` de Ubuntu lo admite (cronie sí; vixie no); si no, hora UTC fija y se acepta la hora de desvío estacional.
17. **B17 · Archivos de la demo versionados** (≤ 1 MB de JPG/EML sintéticos) o generados en la semilla sin binarios en el repo (§18.16). **Recomendación**: versionados (fotos reconocibles como fotos).
18. **B18 · Numeración de ADR** (§18.17): 0031 Precisiones + 0032 Versionado como pediste, o invertidas por orden de escritura. **Recomendación**: como pediste.
19. **B19 · Datos de la empresa en el PDF** (§18.14) a la v1.1.0. **Recomendación**: v1.1.0.
20. **B20 · Dependabot para `github-actions`** (§9.3). **Recomendación**: sí, semanal, PR que tú revisas.
21. **B21 · Textos legales en la demo**: siguen `borrador: true` con los marcadores (el equipo verá el aviso de borrador al aceptar). ¿Rellenar los marcadores con la empresa ficticia «Patagua» solo para la demo (en la imagen `rc`, no en `main`)? **Recomendación**: no; dejar el borrador visible evita que alguien crea que ya están revisados, y E3 sigue pendiente de tu decisión antes de la instalación definitiva.
22. **B22 · Qué hacer con la demo al terminar la fase**: ¿se mantiene encendida hasta la decisión del equipo (respaldos y actualizaciones incluidas) o se apaga al cerrar la fase? **Recomendación**: encendida con `v1.0.0` hasta que decidan; `docs/despliegue.md` §10 describe el apagado.

### Respuestas del usuario (2026-10-05)

**B1 · Estado real de Nexus.** El usuario corrió los comandos de solo lectura en el VPS. Se cruzaron con `knowledge-vault/06_nexus_server/`. Mandan sobre lo que suponían ADR 0020 y esta spec:

- **Sistema y Docker:**
  - Ubuntu 26.04.1 LTS, Docker 29.8.1, Compose v5.5.1, systemd 259.
  - 11 GiB de RAM, 6 CPU, 92 GB libres en `/`.
  - Host en `Etc/UTC`; cron vixie (`cron 3.0pl1`).
- **Redes externas:**
  - `web` (`cloudflared`, `nginx-proxy`, `portfolio`).
  - `db`, con el Postgres 18 compartido de Nexus. Zydesk **no** lo usa: ver B23.
- **`nexus-infra` vive en `/srv/nexus-infra/`, no en `/srv/apps/nexus-infra/`.** Es el repo privado `HikkizZ/nexus-infra`, con dueño `hikki`.
  - La configuración del proxy está en `/srv/nexus-infra/proxy/conf.d/`, montada en `nginx-proxy` como `/etc/nginx/conf.d:ro`.
  - Los archivos actuales son `00-default.conf`, `zytech.conf` y `portfolio.conf`.
  - `nginx-proxy` es `nginx:alpine` y no tiene `real_ip` ni `client_max_body_size` (rige 1 MB).
  - Recarga: `docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload`. Después se hace commit en `nexus-infra`.
  - Todas las rutas de §5.4, ADR 0020 y los scripts usan `/srv/nexus-infra/proxy/conf.d/`.
- **`zydesk.conf` (`docker/vps/zydesk.nginx-proxy.conf`)** sigue la convención de `portfolio.conf`, con estos ajustes:
  - `listen 80` y `server_name desk.zytech.dev`.
  - `set $up_zydesk zydesk-web:8080; proxy_pass http://$up_zydesk;`.
  - `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;`: **no** `$scheme`, porque el túnel llega por HTTP y `$scheme` reescribiría `https` como `http`.
  - `client_max_body_size 25m`.
  - `Host`, `X-Real-IP` y `X-Forwarded-For $proxy_add_x_forwarded_for` como en `portfolio.conf`.
- **Cloudflare Tunnel** está en modo token, sin `config.yml`. El usuario crea la ruta en Zero Trust → Conectores → Nexus → Rutas de aplicaciones publicadas: `desk` · `zytech.dev` · HTTP · `nginx-proxy:80`.
- **Cadena de proxies:** `cloudflared` → `nginx-proxy` → `zydesk-web` → API. Son tres saltos que escriben `X-Forwarded-For`, así que **`PROXY_SALTOS=3`** (no 2). Se verifica en F9-T13: `auditoria.ip` de un `ingreso_ok` real debe ser la IP pública del usuario, no una `172.x`.
- **Herramientas:**
  - Están `zstd` y `flock`.
  - Faltan `age`, `rclone` y `shellcheck`: `instalar-vps.sh` las instala con `apt`. `rclone` queda instalado aunque no se use todavía (B4).
- **SSH:**
  - `Include /etc/ssh/sshd_config.d/*.conf` está activo.
  - `PasswordAuthentication yes` viene de `50-cloud-init.conf`. sshd toma el primer valor y lee los archivos en orden alfabético.
  - Por eso la desactivación global va en `05-sin-contrasena.conf` y la regla de `zydesk-deploy` en `60-zydesk-deploy.conf`. El script valida con `sshd -t` y muestra `sshd -T` antes de recargar.
  - `PermitRootLogin prohibit-password`.
  - ufw permite solo el 22 y fail2ban está activo.
- **Logs:** `/etc/docker/daemon.json` limita todo a `json-file` 10m×3. El Compose de Zydesk lo sobrescribe por servicio (§10).
- **Convenciones de Nexus que se respetan:**
  - Un stack, una carpeta, un `docker-compose.yml` y un `.env`.
  - `chmod 750` en la carpeta de la app.
  - Sin puertos publicados.
  - Datos en `/srv/data/<app>/` (hoy `root:root`).
  - Respaldo del `.env` como nota segura en Bitwarden.
- **Excepción a las convenciones:** `/srv/apps/zydesk/` y su `.env` son de `zydesk-deploy` y no de `hikki`, porque `desplegar.sh` corre como ese usuario (ADR 0020).
- **Respaldos:** hoy Nexus no tiene más respaldo que el backup diario de OVH (1 día); Zydesk es el primero con `pg_dump`.
- **Web Analytics:** no se activa para `desk.zytech.dev`. Su beacon choca con la CSP (`pendientes.md` del vault) y una herramienta interna no lo necesita.

**B2 · Pasos de root.**
- Sí a `instalar-vps.sh`, que el usuario revisa y ejecuta como root.
- Sí a `PasswordAuthentication no` **global**.
- `sudo` sigue igual: pide la contraseña local de `hikki`, porque solo cambia el login SSH. Hay que conservarla en Bitwarden.
- La consola KVM o el modo rescate de OVH siguen siendo la vía de recuperación si se pierden todas las llaves.
- Antes de recargar `sshd`, el usuario confirma que entra con su llave y deja abierta una sesión.
- `zydesk-deploy`: sin contraseña, sin `sudo`, en el grupo `docker` y con su llave restringida a `desplegar.sh`.
- El usuario preguntó por qué no usar su propio usuario y aceptó la explicación: la llave vive en GitHub, el usuario de servicio se revoca sin tocar su cuenta y la instalación es portátil.

**B3 · Cloudflare Access: no en la demo.**
- La demo va solo con el login de Zydesk y sus límites de intentos (ADR 0013).
- Riesgo aceptado: es pública en internet, pero con datos 100 % ficticios.
- `DEMO_PASSWORD` debe ser fuerte (la política de `shared`; recomendado `openssl rand -base64 18`), porque abre las 12 cuentas, incluida Administración.
- `docs/demo.md` lo dice explícitamente. Access sigue recomendado para la instalación definitiva (`docs/despliegue.md`).
- Sin Service Token. Playwright contra la demo (F9-T17) entra directo.

**B4 · Respaldos solo locales por ahora (E2 sigue abierta).**
- `respaldar.sh` cifra con `age` y deja `respaldo-<marca>.tar.age` en `/srv/data/zydesk/respaldos/`, con retención local de 14 días.
- La copia remota con `rclone` queda implementada pero desactivada: solo corre si `RCLONE_DESTINO` no está vacío.
- **Riesgo abierto**, anotado en `docs/demo.md` y en el CHANGELOG: si se pierde el VPS, se pierde la demo. Lo mismo vale hoy para el resto de Nexus.
- La instalación definitiva debe resolver E2 antes de tener datos reales.

**B5 · Telegram en la demo.**
- El usuario crea un bot nuevo en BotFather solo para la demo, distinto del de desarrollo.
- También crea un chat para `TELEGRAM_CHAT_ADMIN`, donde llegan los avisos de despliegue, respaldo y errores.
- Los tokens van solo en el `.env` del VPS, nunca en el chat ni en el repo.
- Vincular Telegram de personas reales es opcional.

**B6 · GHCR.**
- Imágenes en `ghcr.io/hikkizz/zydesk-{api,web,bot}`, en minúsculas.
- El usuario es el único revisor del environment `produccion`.
- Los paquetes se hacen públicos a mano una vez y el VPS hace `pull` sin credenciales.

**B7 · Historia de la demo (§11.3): aprobada tal cual.**
- Cambio en las cuentas: correos `<usuario>@demo.zytech.dev`, no `@demo.zydesk.cl` (dominio ajeno).
- Cambio en los contactos de clientes: dominios reservados `@<cliente>.test`.
- §11.1 (guarda 3), §11.3 y §11.4 quedaron actualizados con esos dominios.

**B8 · Cuentas.**
- Una `DEMO_PASSWORD` común para las 12 cuentas ficticias.
- Además, el usuario crea desde Configuración una cuenta por persona real del equipo, con su correo real como identificador y contraseña temporal.
- La semilla no crea esas cuentas.
- **Precisión de la guarda 3 de §11.1** (si no, chocaría con B8):
  - Sin `--reiniciar`, `db:demo` se niega si existe un usuario cuyo correo no termine en `@demo.zytech.dev`.
  - Con `--reiniciar`, que ya exige `ZYDESK_DEMO=true` y `ZYDESK_DEMO_CONFIRMAR=<base>`, la guarda no aplica: vacía todo, incluidas las cuentas del equipo, y vuelve a sembrar.
  - `docs/demo.md` avisa que `--reiniciar` borra las cuentas del equipo y sus observaciones.
  - Test: con una cuenta `persona@empresa.cl`, `demo` sin `--reiniciar` sale con 1 y no cambia nada; `demo --reiniciar` con las dos variables deja solo las 12 ficticias.

**B23 · Postgres propio o el compartido de Nexus (nueva, bloqueaba F9-T4): propio.**
- Contenedor `zydesk-db` con `postgres:16-alpine`, en la red interna `zydesk`, sin unirse a `db`. Es lo que ya decía §5.1.
- Razones:
  - La demo ensaya exactamente el `docker-compose.yml` portátil, los respaldos y la restauración de la instalación definitiva.
  - Misma versión mayor en dev, CI y producción.
  - `restaurar.sh` reemplaza la base sin tocar otros proyectos.
  - Usa roles propios (`zydesk_owner`, `zydesk_app`) y `GRANT CREATE` para pg-boss.
- El Postgres 18 de Nexus no se toca.

**No bloqueantes (B9–B22):**
- Se implementan con su recomendación (regla de la Fase 7).
- B16 queda resuelta por B1: **timer de systemd** con `OnCalendar=*-*-* 02:30:00 America/Santiago` (systemd 259 admite zona horaria y respeta el horario de verano). `CRON_TZ` no se usa. `instalar-vps.sh` instala `zydesk-respaldo.service` y `zydesk-respaldo.timer`, y el resto de §8.1 no cambia.

## 20. Cambios de ADR propuestos (no se editan las ADR; ADR 0032 nace en F9-T1 con §12; ADR 0031 «Precisiones de la Fase 9» se escribe al cerrar con §18, las respuestas de §19 y las desviaciones; solo cambia la línea **Estado** de 0017, 0020 y 0029)

- **ADR 0001**: el Compose de producción vive en la raíz como `docker-compose.yml` con cuatro servicios (`zydesk-db`, `zydesk-api`, `zydesk-web`, `zydesk-bot` con perfil); `web` es `nginx-unprivileged` en 8080; datos en `/srv/data/zydesk/`; imágenes por digest; portabilidad: la red externa `web` es el único supuesto del entorno.
- **ADR 0009 / 0017**: respaldo = `pg_dump -Fc` + `tar --zstd` de `archivos` y `bot`, cifrado con `age`, copiado con `rclone`, retención 14/90; los logs no se respaldan; rotación `json-file 20m×10` y archivado diario gzip 30 días como alternativa a Loki (opción prevista en 0017); `errores-ayer.sh` como alerta mínima por Telegram; Grafana/Loki quedan como decisión del usuario (B9).
- **ADR 0012**: `docs/despliegue.md` (instalación definitiva, portátil) y **`docs/demo.md`** (nuevo); CHANGELOG por versión con `[1.0.0]`.
- **ADR 0013 / 0018**: en la demo, cookie `__Host-sesion` y `Secure` verificados detrás de Cloudflare con `PROXY_SALTOS=2`; Access activado (si B3) como segundo factor; la alternativa sin Cloudflare documentada.
- **ADR 0020**: regex de etiqueta admite `-rc.N`; `zydesk-web:8080`; respaldo previo local sin cifrar hecho por `desplegar.sh` (sin `sudo`); `.env.anterior`; comprobación de `version` en la salud; tres imágenes (se suma `zydesk-bot`); `imagenes` con `provenance: false` y `metadata-action`; `verificar-etiqueta` exige CI verde del commit; Dependabot para `github-actions`; `probar-imagenes.sh` y `desplegar.test.sh` en CI; acciones sobre Node 24; `sshd_config.d` + `restrict,command=` (doble cierre, como decía).
- **ADR 0027**: `API_URL=http://zydesk-api:3000` (nombre del servicio real del Compose, no `api`); `BOT_DATOS_DIR=/datos/bot` en volumen; el bot con perfil `bot`; bot de demo distinto del de desarrollo y del definitivo.
- **ADR 0029**: `docs/manuales/` completo (con `img/`) copiado a la etapa de build de `web`; CSP con `img-src 'self' blob: data:`; versión en el pie con `data-letra="insignia"` (si B15); Playwright contra la demo como config opcional.
- **ADR 0030**: `UF_ACTUALIZAR=true` en producción y en la demo; `indicador_uf` de la demo con fuente `semilla` (10 filas).
- **Spec funcional / PLAN §4 Fase 9**: «carga de datos reales y apagado de semillas» se reinterpreta: en la demo no hay datos reales (semilla `db:demo` con guardas); la carga real y la revisión legal van en `docs/despliegue.md` §5 para la instalación definitiva. PLAN §7: E2 se resuelve con la respuesta a B4; E3 sigue pendiente y bloquea solo la instalación definitiva.
- **CLAUDE.md** §2 (fila nueva de la tabla; regla de migraciones compatibles con la versión anterior; guardas de `db:demo`), §6 (comandos `db:demo`, `version:fijar`), §7 (scripts `.sh` de `docker/` para Linux; `shellcheck`).
- **Nueva ADR 0032 «Versionado y publicación»**: §12 completo (una versión para el monorepo, `version:fijar`, etiquetas `vX.Y.Z` y `-rc.N`, qué sube cada número, CHANGELOG por versión, sin `latest`, quién etiqueta y cuándo, release opcional, v1.1.0 = IMAP).

## 21. Estado de avance

_(Se completa durante la fase: commits por bloque, respuestas a §19, desviaciones, cifras de CI, tiempos de despliegue/rollback/restauración, resultados de `trivy`/`npm audit`, hallazgos de la revisión de seguridad, fecha de `v1.0.0`.)_

### Estado al 2026-10-05 (para retomar en otro equipo)

- **Nada implementado todavía.** Solo existe esta spec (rama `feat/fase-9-puesta-en-marcha`, desde `main` con las Fases 0–8b integradas en `52df530`).
- **Preguntas bloqueantes resueltas (2026-10-05)**: B1–B8 y la nueva B23, registradas en §19 «Respuestas del usuario». El agente nunca entra al VPS ni ejecuta pasos de root: el usuario corre los comandos y pega la salida.
- **B7 aprobada**: la historia de §11.3 está aprobada tal cual, con cuentas `@demo.zytech.dev` y contactos `.test`. F9-T10 ya puede implementarse.
- Las preguntas no bloqueantes (B9–B22) se implementan con la recomendación si el usuario no dice otra cosa (regla acordada desde la Fase 7).
- **Siguiente**: implementar por bloques según el plan aprobado por el usuario (§16, con los ajustes de §19).

### Avance de la implementación (2026-10-05)

**Entorno local.** En este PC, Smart App Control de Windows bloquea el binario nativo de `argon2`. La API, `db:*` y sus tests no corren en Windows. Se corren en un contenedor `node:22-alpine` con el repo montado y `node_modules` de Linux en volúmenes; `socat` reenvía `localhost:5433` a `zydesk-postgres-dev`. No se cambió nada de la configuración de Windows. Shared, web, bot, typecheck, lint y build sí corren en Windows.

**Hecho y commiteado** (local, sin push):

| Tarea | Commits | Notas |
| --- | --- | --- |
| F9-T1, versión 1.0.0 | `7a73ee5`, `c4385b2` | ADR 0032. `version:fijar` es un script que solo edita los campos `version`: no regenera el lock, porque npm en Windows poda entradas opcionales. CHANGELOG `[1.0.0]` con fecha provisional, que se fija en F9-T18 |
| F9-T2 y F9-T3, imágenes | `85566f9`, `26e3ff2`, `c0530eb` | Tamaños: api 445 MB, web 85 MB, bot 287 MB. Superan la referencia porque `node:22-alpine` pesa 237 MB; no bloquea. nginx de la web con `resolver 127.0.0.11` y `proxy_pass` por variable. Dependencias de producción con `npm ci --omit=dev -w` por workspace |
| F9-T10, semilla de demo | `330309f`, `2a7b8ed` | La imagen de la API copia `semillas/demo/archivos` a `dist`. Base vacía permitida sin `--reiniciar` |
| F9-T6 y F9-T7, CI/CD | `15f3f92`, `58ff168` | Acciones v7 y v4/v6 fijadas por SHA. Imágenes en `ghcr.io/hikkizz/` |
| F9-T11, versión en el pie | `6e44ef0` | La versión se lee de `/api/salud` |
| F9-T4 y F9-T5, Compose y VPS | `1ebe231`, `040731f`, `daf1569`, `db8b920` | Ensayo local completo de §8.3 en 39 s |

**Desviaciones de la semilla de demo** (para ADR 0031):

- Las horas facturables a 90 días son 50 %, no 55–65 %: las OT cerradas de la historia son chicas.
- La cotización sin IVA está en la OT de la Panadería, no en la del Colegio: el Colegio solo tiene una OT interna.
- "En espera interno" se sembró como `aprobacion`.
- Las fotos son PNG sintéticos de unos 17 KB en total.

**Desviaciones del Compose y los scripts del VPS** (para ADR 0031 y §8):

- **Respaldo con dueños y permisos.** El `pg_dump` conserva dueños y permisos (sin `--no-owner --no-acl`). Con esas opciones la API no arrancaba tras restaurar: las tablas de pg-boss son de `zydesk_app` y los `REVOKE` de `evento` y `auditoria` viven en las ACL.
- **Permisos de `respaldos/`.** Queda como `root:zydesk-deploy 710`, para que `desplegar.sh` pueda dejar su respaldo previo.
- **`desplegar.sh`:**
  - Hace `up -d --wait zydesk-db` antes de migrar.
  - Se niega a correr como root.
- **Variables y `.env`:**
  - La variable del destino remoto es `RCLONE_DESTINO`.
  - La API y el bot reciben del `.env` solo las variables que usan.
  - `.env.produccion.example` lleva los comentarios en líneas aparte.
- **Timers.** Los de logs y errores también son de systemd.
- **Bot.** El bot acepta `http://zydesk-api…` como dirección interna.
- **Pruebas.** `probar-imagenes.sh` usa un host de base no local, porque las reglas de producción de `env.ts` rechazan `localhost`.

**Pendiente:** F9-T8 (documentación, Fable), la ronda 4 en el VPS con el usuario (F9-T12, T13, T14, T16 y T17) y la ronda 5 (F9-T15, seguridad; F9-T18, ADR 0031, PR y `v1.0.0`).
- Reglas de trabajo vigentes: responder al usuario siempre en español; commits con `/conventional-commit` en español, sin `Co-Authored-By`; push y PR solo con confirmación explícita; revisión de seguridad de cierre (Fable + `/security-review`) antes del PR.

### Estado final de la fase (2026-10-06, F9-T18)

**Hecho en el segundo PC** (commits `4141ce5` a `f41c050`; ver `git log --oneline origin/main..HEAD`):

| Tarea | Resultado |
| --- | --- |
| F9-T8, documentación | `docs/despliegue.md`, `docs/demo.md`, `docs/legal/README.md`, `docker/vps/README.md`, README, `CLAUDE.md`, manual de administración y guía de la API (`588b9c8`, `bf2a611`) |
| F9-T12, preparación del VPS | Completada por el usuario antes del primer despliegue (sin salida registrada; verificada por los despliegues) |
| F9-T13, despliegues `rc` | `v1.0.0-rc.1` falló dos veces: `pull` antes de fijar `ZYDESK_VERSION` (`2160168`) y versión `1.0.0` en los `package.json` con la app funcionando (desde `d32e857` `verificar-etiqueta` compara la etiqueta con los cinco `package.json`). `v1.0.0-rc.2` y `v1.0.0-rc.3` desplegados bien con aprobación manual del environment `produccion`. La base quedó vacía tras el primer despliegue y la demo se cargó a mano con el comando de `docs/demo.md` §5 |
| F9-T15, seguridad | Fable + `/security-review`: sin HIGH. Corregidos VULN-001 (`zydesk-herramientas`, `f41c050`), HSTS, `mem_limit`/`pids_limit`; auditoría de archivos (`bfc3ef1`: CSP `sandbox`, cupo 50 / 200 MB, tmpfs 256 MB, `sanearNombre`). VULN-002 mitigada con una regla de rate limiting de Cloudflare sobre `POST /api/auth/ingresar`. `npm audit --omit=dev`: 3 moderados en `uuid` dentro de `exceljs`. Verificado en el VPS: `nginx-proxy` sin puertos al host y nada en 80/443 del host. Riesgos aceptados en ADR 0031.35–36 |
| Cambios de UI pedidos al ver la demo (rc.3) | Favicon con el logo (`5a21632`), sin rebote al forzar el scroll (`ffc33e0`), imágenes de seguimientos más grandes (`cc3065d`) |
| CI | No corre en push de etiquetas (`7b7e075`); `compose.test.sh` agregado (`f41c050`); `shellcheck` 0.9/0.10 (`3cb972a`) |
| F9-T18, cierre documental | ADR 0031; fila 0031 y Estado de 0017/0020/0029 en `docs/decisiones/`; CHANGELOG `[1.0.0] - 2026-10-06` con «Pendientes conocidos» por versión; `docs/demo.md` y `docs/despliegue.md` con los resultados y el paso de actualización de scripts; `CLAUDE.md` §2 y §6 |

**Pendientes de la demo (decisión del usuario, no bloquean la v1.0.0)**: F9-T14 (restauración con un respaldo real) y F9-T16 (vuelta atrás por CD; `Run workflow` solo aparece con `desplegar.yml` en `main`), con su procedimiento en `docs/demo.md` §9 y §10. F9-T17 (Playwright contra la demo) se omite.

**Importante para el próximo despliegue**: el VPS ejecuta la copia instalada de `desplegar.sh`; tras `f41c050` hay que repetir `instalar-vps.sh` desde el repo actualizado **antes** de desplegar una etiqueta que use `zydesk-herramientas` (`docs/demo.md` §3.1).

**Siguiente**: PR a `main` con CI verde → `npm run version:fijar -- 1.0.0` (hoy los `package.json` llevan `1.0.0-rc.3`) + `npm run api:openapi` + commit `chore(release): v1.0.0` → etiqueta anotada `v1.0.0` sobre `main` con confirmación del usuario → despliegue con aprobación. **v1.1.0** (ADR propia): correo entrante IMAP, «Ver correo completo», limpieza de GPS en el servidor; pregunta abierta archivos en BD vs disco (ADR 0031.39).
