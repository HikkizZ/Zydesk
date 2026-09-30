# ADR 0020 — Integración y despliegue continuos con GitHub Actions

**Estado**: aceptada · 2026-09-30 · complementa a ADR 0001 (Compose portable), 0012 (`despliegue.md`) y 0017 (roles de BD, logs en Fase 9)

## Contexto

El usuario decidió (2026-09-30) que el repositorio sea **público** y que la verificación deje de depender de la máquina del desarrollador: desde la Fase 2 cada push y cada PR a `main` deben correr tests, y en la Fase 9 el despliegue a `desk.zytech.dev` debe ser reproducible. Producción es el VPS Nexus (`C:\Users\fmira\knowledge-vault\06_nexus_server\arquitectura.md`): solo el puerto 22 abierto (ufw + fail2ban), web por Cloudflare Tunnel → `nginx-proxy:80` (red Docker externa `web`, un `.conf` por sitio), apps en `/srv/apps/<proyecto>/` con `.env` 600 fuera de git, datos en `/srv/data/<proyecto>/`, sin puertos publicados al host, SSH que hoy admite contraseña y llave. Un repo público impone: ningún secreto ni dato real en el repo, y desconfiar de todo lo que un fork o PR pueda ejecutar.

## Opciones consideradas

1. **Build y despliegue por SSH con shell completa en el VPS** (`git pull && docker compose up -d --build`): simple, pero la llave de Actions daría shell a un tercero si se filtra, y compilar en el VPS mezcla la máquina de producción con la de build.
2. **Runner self-hosted en el VPS**: ejecuta cualquier workflow del repo; en un repo público un PR de un fork podría correr código en producción. Descartado **mientras el repo sea público**.
3. **Watchtower / pull automático** al publicar una imagen: despliega sin aprobación ni respaldo previo, sin migraciones ordenadas ni reversión. Descartado.
4. **Imágenes en GitHub Actions → GHCR → despliegue por SSH a un usuario dedicado con comando forzado** (elegida): el VPS solo puede ejecutar un script fijo; el build ocurre fuera de producción; la aprobación es humana.

## Decisión

**Repositorio público.** Consecuencias obligatorias: nunca secretos, datos reales ni capturas con datos reales en el repo (`.env` ignorado; `.env.example` con valores de prueba); ningún runner self-hosted; ningún workflow con `pull_request_target`; `permissions:` explícitos en cada workflow con `contents: read` por defecto; acciones de terceros **fijadas por SHA** de commit (con el tag como comentario), no por tag; secretos solo en el environment `produccion`, nunca a nivel de repositorio; las imágenes en GHCR son públicas (solo contienen código compilado del repo público).

**CI (desde la Fase 2)** — `.github/workflows/ci.yml`, en `push` a cualquier rama y `pull_request` hacia `main`, en `ubuntu-24.04`, con `concurrency` por rama: `npm ci` → `typecheck` → `lint` → `format:check` → `test` → `build` → `npm run api:openapi` con `git diff --exit-code docs/api/openapi.json` (la documentación generada no puede quedar desactualizada). El job levanta un **servicio Postgres 16** (`postgres:16-alpine`, `5433:5432`, healthcheck `pg_isready`) y, antes de los tests, ejecuta con `psql` el **mismo** `docker/postgres-init/01-roles.sql` que usa el desarrollo local, para que CI y máquina del desarrollador tengan roles y bases idénticos. El `.env` de CI se genera en el workflow copiando `.env.example` y añadiendo contraseñas de prueba literales (`SEMILLA_PASSWORD`, `ADMIN_PASSWORD`); no hay secretos en CI. Los tests de la API corren contra `zydesk_test` con `fileParallelism: false`, igual que en local.

**CD (Fase 9, opción B)** — `.github/workflows/desplegar.yml`, disparo por etiqueta `v*` o `workflow_dispatch` (con la etiqueta como entrada), `permissions: { contents: read, packages: write }`:
1. Job `imagenes`: construye `docker/api.Dockerfile` y `docker/web.Dockerfile`, publica en `ghcr.io/<owner>/zydesk-api` y `zydesk-web` con etiquetas `<versión>` y `sha-<sha corto>`.
2. Job `desplegar` con `environment: produccion` (exige **aprobación del usuario** como revisor obligatorio; ahí viven `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`): abre SSH a `148.113.253.152:22` como usuario **`zydesk-deploy`** y envía solo la etiqueta como comando. El VPS ejecuta `/srv/apps/zydesk/desplegar.sh <etiqueta>` y nada más.

**En el VPS** (respeta `nexus-infra`): usuario `zydesk-deploy` (sin sudo, en el grupo `docker`, shell `/bin/sh` solo para que sshd pueda ejecutar el comando forzado); en `sshd_config` un bloque `Match User zydesk-deploy` con `PasswordAuthentication no`, `PubkeyAuthentication yes`, `AllowTcpForwarding no`, `X11Forwarding no`, `AllowAgentForwarding no`, `PermitTTY no`, `ForceCommand /srv/apps/zydesk/desplegar.sh`, y además `restrict,command="…"` en su única línea de `authorized_keys` (doble cierre). Estructura:

```
/srv/apps/zydesk/
├── desplegar.sh      root:root 755 (copia manual de docker/desplegar.sh; no lo cambia el despliegue)
├── .env              zydesk-deploy 600, fuera de git (DATABASE_URL, DATABASE_URL_OWNER, PROXY_SALTOS=2, ZYDESK_VERSION…)
└── repo/             clon del repo público solo lectura; el script hace `git fetch --tags && git checkout <etiqueta>`
                      y usa repo/docker-compose.yml con --env-file ../.env
/srv/data/zydesk/{postgres,archivos,respaldos}   datos, nunca en git; lo que se respalda
```

El script valida la etiqueta con `^v[0-9]+\.[0-9]+\.[0-9]+$` (tomada de `SSH_ORIGINAL_COMMAND`), y en orden: `pg_dump` a `/srv/data/zydesk/respaldos/<fecha>-<versión anterior>.sql.gz` → `git checkout <etiqueta>` → `docker compose pull` → migraciones con el rol owner (`docker compose run --rm api node dist/database/cli.js migrar`, ADR 0017) → `docker compose up -d` → espera y comprueba `GET /api/salud` desde dentro de la red (`docker compose exec -T web wget -qO- http://api:3000/api/salud`) → si falla, vuelve a `ZYDESK_VERSION` anterior (`checkout` + `up -d`; las migraciones no se revierten solas: queda el `pg_dump`) y termina con código 1 → aviso por Telegram con `curl` a la Bot API si existen `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ADMIN` en `.env` (Fase 6). Compose de producción: `zydesk-db` (postgres:16, datos en `/srv/data/zydesk/postgres`, red interna del proyecto, **sin `ports`**), `zydesk-api` (red interna), `zydesk-web` (nginx con el build estático y `proxy_pass /api → zydesk-api:3000`, redes interna **y** `web`); ninguno publica puertos al host. En `nexus-infra`: `proxy/conf.d/zydesk.conf` con `listen 80; server_name desk.zytech.dev; client_max_body_size 25m; set $up_zydesk zydesk-web:80; proxy_pass http://$up_zydesk;` (sin barra final; el `resolver` global ya está en `00-default.conf`) reenviando `Host`, `X-Forwarded-For`, `X-Forwarded-Proto https` y `CF-Connecting-IP`; ruta publicada en el túnel `desk.zytech.dev → http://nginx-proxy:80`; Cloudflare Access delante (E1). Todo esto se detalla en `docs/despliegue.md` en la Fase 9.

**Endurecimiento pendiente del SSH del VPS** (para la Fase 9): la autenticación por contraseña sigue activa globalmente (pendiente ya anotado en el vault); debe quedar `PasswordAuthentication no` al menos para `zydesk-deploy` (el bloque `Match` lo garantiza) y, recomendado, para todos. No se puede restringir por IP de origen (las IP de Actions cambian), por eso el comando forzado es la barrera. La llave de `zydesk-deploy` se genera para este único uso (`ed25519`, sin passphrase, solo en el environment `produccion`), se rota si alguien pierde acceso al repo con permisos de administración, y `fail2ban` protege el resto.

## Consecuencias

- Toda rama y todo PR quedan verificados sin depender de la máquina local; `main` solo recibe PR con CI verde (regla de rama protegida, configurada por el usuario en GitHub).
- El VPS nunca compila ni recibe código no versionado: lo que corre es una imagen inmutable etiquetada, trazable al commit.
- Riesgo asumido: `zydesk-deploy` pertenece al grupo `docker` (equivalente a root). Mitigaciones: solo llega por una llave que exige aprobación humana para usarse, no tiene shell ni forwarding, y ejecuta un script propiedad de root que no acepta más que una etiqueta.
- Si el repo pasara a privado, se revisaría esta ADR (un runner self-hosted volvería a ser opción); mientras sea público, la lista de consecuencias del primer párrafo de la Decisión es obligatoria.
- Los SHA de las acciones deben actualizarse a mano (o con Dependabot para `github-actions`, decisión menor que se puede tomar al escribir el workflow).
