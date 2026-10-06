# Zydesk

Aplicación interna de gestión de tickets, órdenes de trabajo, cotizaciones y horas.
Monorepo con API (Express), web (React + Vite), bot de Telegram (grammY) y un paquete compartido de tipos y utilidades.

## Requisitos

- Node 22 y npm 10
- Docker (para Postgres de desarrollo)

## Levantar en local (desde cero)

1. Copiar la configuración: `cp .env.example .env` (en Windows CMD: `copy .env.example .env`).
2. Completar en `.env` las contraseñas que la app lee solo desde ahí (elige valores propios; no se versionan):
   - `ADMIN_PASSWORD`: la usa `npm run db:admin` para crear la primera cuenta de Administración.
   - `SEMILLA_PASSWORD`: contraseña común de las cuentas de ejemplo que crea `npm run db:sembrar`.
3. Instalar dependencias: `npm install`.
4. Levantar Postgres: `docker compose -f docker-compose.dev.yml up -d`.
   Si ya existía un volumen de una versión anterior a la Fase 1, o si cambian los roles o las bases en `docker/postgres-init/`, hay que recrearlo (**borra los datos de desarrollo**): `docker compose -f docker-compose.dev.yml down -v` y luego `up -d`.
5. Aplicar las migraciones: `npm run db:migrar`. Repítelo cada vez que cambies a una rama con migraciones nuevas: `npm run db:reiniciar` vacía y siembra, pero **no migra**.
6. Cargar datos de ejemplo: `npm run db:sembrar` (idempotente; incluye 18 tickets de ejemplo (TK-1012 a TK-1053), 7 órdenes de trabajo (OT-0213 a OT-0219), tarifas en pesos y en UF y la UF de hoy con fuente «semilla»; `npm run db:reiniciar` vacía la base de desarrollo y la vuelve a sembrar).
   Para una instalación real, en vez de sembrar, crear la primera cuenta: `npm run db:admin -- --correo admin@ejemplo.cl --nombre "Nombre Apellido"`.
7. Arrancar shared (watch), API, web y bot: `npm run dev` (sin `TELEGRAM_BOT_TOKEN` el proceso del bot termina en silencio).
8. Abrir <http://localhost:5173>.

Con internet, la API consulta el valor de la UF una vez por hora (Boostr y, de respaldo, mindicador.cl; job `indicadores.uf`) y lo guarda en `indicador_uf`; `UF_ACTUALIZAR=false` en `.env` apaga esas llamadas salientes (CI, entornos sin internet) y la UF se escribe a mano en cada cotización. Los tests nunca salen a internet.

### Puertos

| Servicio          | Puerto |
| ----------------- | ------ |
| API               | 3010   |
| Web (Vite)        | 5173   |
| Postgres (Docker) | 5433   |

El bot no abre ningún puerto: usa long polling contra la API de Telegram y habla con la API de Zydesk por `API_URL`.

### Bot de Telegram en desarrollo (opcional)

El desarrollo normal no necesita Telegram. Para probar el bot de verdad:

1. Crea un bot de desarrollo con **@BotFather** (`/newbot`) y copia su token. El token va **solo** en tu `.env` local, nunca en el repo ni en el chat.
2. Completa en `.env`: `TELEGRAM_BOT_TOKEN=<token>`, `TELEGRAM_BOT_USUARIO=<usuario sin @>` y `BOT_CLAVE_CIFRADO=<salida de openssl rand -base64 32>`. `BOT_API_KEY`, `WEB_URL`, `API_URL` y `BOT_DATOS_DIR` ya traen valores de desarrollo en `.env.example` (en producción `BOT_API_KEY` debe tener al menos 32 caracteres y `WEB_URL` ser `https://`).
3. Reinicia `npm run dev` (o solo el bot: `npm run dev -w @zydesk/bot`). El log dice `bot iniciado`; si Telegram rechaza el token, el proceso termina con un error.
4. Entra a la web, abre **Avisos → Vincular Telegram** y envía el código al bot (`/vincular CÓDIGO` o el enlace **Abrir en Telegram**). Prueba `/hoy`, `/mis`, `/ticket 1048`, responde un aviso y reenvíale un texto.

Las sesiones de los chats quedan cifradas en `BOT_DATOS_DIR` (por defecto `./datos/bot`, ignorado por git). Con `WEB_URL=http://localhost:5173` los enlaces de los mensajes se ven como texto (Telegram solo hace clicables los `https`). Más detalles en la sección 17 del [manual de administración](docs/manuales/administracion.md) y en el [manual del bot](docs/manuales/usuario/04-bot-telegram.md).

### Usuarios de ejemplo

Todas las cuentas de ejemplo usan el correo `<usuario>@zydesk.local` y la contraseña de `SEMILLA_PASSWORD`. Por ejemplo: `hikki@zydesk.local` (Administración), `crojas@zydesk.local` (Coordinación), `dmunoz@zydesk.local` (Técnico) y `nvega@zydesk.local` (Solo lectura). La referencia de la API está en <http://localhost:3010/api/docs> (requiere sesión de Administración).

## Base de test

Los tests de la API usan Postgres real, en la base `zydesk_test` (la crea el script de inicio de Docker; se conecta con `TEST_DATABASE_URL` y `TEST_DATABASE_URL_OWNER`). Con Postgres levantado, `npm test` aplica las migraciones y vacía la base entre tests; no toca la base de desarrollo. Los tests del bot no usan base de datos ni Telegram: doblan las actualizaciones de grammY y la API de Zydesk.

Para correr los tests sin pisar otra ejecución en paralelo, crea una base propia con `npm run db:test:crear -- <sufijo>` (por ejemplo `2h`) y usa `TEST_BD_SUFIJO=<sufijo>` al correr `npm run test -w @zydesk/api` (con `npx cross-env` en Windows).

### Auditoría móvil (Playwright)

`npm run test:movil` no forma parte de `npm test`: abre Chromium a 320, 375 y 1440 px y mide lo que jsdom no puede (desbordes, objetivos táctiles, tamaño de letra, posición de las secciones, diálogos, flujo de fotos y accesibilidad con axe) sobre Mi día, el detalle de ticket, la OT, el panel «Más» y los diálogos. Requiere, una vez, `npx playwright install chromium`, y Postgres con las **semillas** (`npm run db:reiniciar`); el script levanta la API y el `preview` de la web (puerto 4173) por su cuenta, ingresa con las cuentas de ejemplo leyendo `SEMILLA_PASSWORD` de `.env` y deja el informe HTML en `apps/web/e2e/informe/` (ignorado por git). Las pruebas de fotos dejan seguimientos en la base de desarrollo, como cualquier prueba manual.

`npm run docs:capturas` regenera las capturas de los manuales (`docs/manuales/img/<manual>/`) con el mismo montaje; solo corre contra un servidor local y aborta si en la base hay algún usuario que no sea de las semillas. Se ejecuta a mano, no en CI, y sobrescribe los PNG existentes.

## Archivos de tickets y OT

Las fotos, documentos y correos de los tickets y de las órdenes de trabajo se guardan en disco en `ARCHIVOS_DIR` (por defecto `./datos/archivos`, carpeta ignorada por git). Respáldala junto con la base de datos. Más detalles en la sección 12 del [manual de administración](docs/manuales/administracion.md).

## Producción

`docker-compose.yml` (raíz) es el Compose de **producción**: `zydesk-db`, `zydesk-api`, `zydesk-web` (nginx sin privilegios en el 8080) y `zydesk-bot` (perfil `bot`), con las imágenes publicadas en `ghcr.io/hikkizz/zydesk-{api,web,bot}:<etiqueta>` por el workflow `Desplegar` (etiquetas `vX.Y.Z` y `vX.Y.Z-rc.N`, ADR 0032). `docker-compose.dev.yml` es solo el Postgres de desarrollo. Los Dockerfiles están en `docker/`, los scripts del servidor en `docker/vps/` y las variables en `.env.produccion.example`.

- [Guía de instalación (producción, portátil)](docs/despliegue.md): requisitos, secretos, primer arranque, actualización y rollback, respaldos, operación.
- [La demo en el VPS](docs/demo.md): lo que se ejecuta en la Fase 9 con datos ficticios (`npm run db:demo`).

Scripts de la Fase 9: `npm run db:demo` carga la semilla de la demo (solo con `ZYDESK_DEMO=true` y `DEMO_PASSWORD`; `-- --reiniciar` vacía la base y exige `ZYDESK_DEMO_CONFIRMAR`), `npm run version:fijar -- X.Y.Z` fija la versión en los cinco `package.json` y el lock, `npm run test:scripts` prueba ese script.

## Integración continua

El workflow `.github/workflows/ci.yml` (ADR 0020) corre en cada `push` y en cada PR hacia `main`, en un job llamado `verificar` sobre `ubuntu-24.04`. Levanta un Postgres 16 (puerto 5433), ejecuta `docker/postgres-init/01-roles.sql` con `psql` y luego, en este orden: `npm ci`, `typecheck`, `lint`, `format:check`, `test`, `build`, la auditoría móvil (`npx playwright install --with-deps chromium`, migraciones y semillas, `npm run test:movil`; si falla, sube el informe HTML como artefacto `informe-playwright`) y `npm run api:openapi` seguido de `git diff --exit-code docs/api/openapi.json` (si falla, regenera el archivo con `npm run api:openapi` y súbelo). El `.env` se genera desde `.env.example` con contraseñas de prueba; no usa secretos. El repositorio es público: las acciones de terceros van fijadas por SHA de commit (el tag queda como comentario) y hay que actualizarlas a mano. Para que un PR no pueda mezclarse con el CI en rojo, en GitHub: Settings > Branches > regla para `main` > "Require status checks to pass" > `verificar`.

## Scripts de la raíz

| Script                  | Qué hace                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`           | Compila `shared` y levanta shared (watch), API, web y bot                                        |
| `npm run build`         | Compila los cuatro paquetes                                                                      |
| `npm test`              | Corre los tests de los cuatro paquetes                                                           |
| `npm run typecheck`     | Compila `shared` y revisa tipos en los cuatro paquetes                                           |
| `npm run lint`          | ESLint                                                                                           |
| `npm run format`        | Prettier (escribe)                                                                               |
| `npm run format:check`  | Prettier (solo revisa)                                                                           |
| `npm run clean`         | Borra los `dist/` de los cuatro paquetes                                                         |
| `npm run db:migrar`     | Aplica las migraciones pendientes (como `zydesk_owner`)                                          |
| `npm run db:revertir`   | Revierte la última migración (`-- --todo` las revierte todas)                                    |
| `npm run db:admin`      | Crea la primera cuenta de Administración (`-- --correo ... --nombre ...`; lee `ADMIN_PASSWORD`)  |
| `npm run db:sembrar`    | Carga datos de ejemplo (lee `SEMILLA_PASSWORD`)                                                  |
| `npm run db:reiniciar`  | Vacía la base de desarrollo y la vuelve a sembrar (no migra: antes `db:migrar`)                  |
| `npm run db:test:crear` | Crea una base de test propia (`-- <sufijo>`); usarla con `TEST_BD_SUFIJO=<sufijo>`               |
| `npm run db:demo`       | Carga la semilla de la demo (exige `ZYDESK_DEMO=true` y `DEMO_PASSWORD`; `-- --reiniciar` vacía) |
| `npm run api:openapi`   | Regenera `docs/api/openapi.json`                                                                 |
| `npm run test:movil`    | Auditoría móvil con Playwright + axe (Chromium; requiere `npx playwright install chromium`)      |
| `npm run docs:capturas` | Regenera las capturas de los manuales en `docs/manuales/img/` (solo local, solo semillas)        |
| `npm run version:fijar` | Fija la versión (`-- X.Y.Z` o `X.Y.Z-rc.N`) en los cinco `package.json` y el lock (ADR 0032)     |
| `npm run test:scripts`  | Prueba `scripts/version-fijar.mjs`                                                               |

## Estructura

```
apps/api        API Express 5 (pino, TypeORM, Zod)
apps/web        React 19 + Vite + React Router + TanStack Query + Tailwind v4
apps/bot        Bot de Telegram (grammY, long polling); sin BD, habla solo con la API
packages/shared Tipos, errores, formato y utilidades compartidas (se compila a dist/)
docs            Plan, decisiones (ADR), especificaciones por fase, manuales (con sus capturas en manuales/img/) y API
```

## Documentación

- [Plan del proyecto](docs/PLAN.md)
- [Decisiones de arquitectura](docs/decisiones/README.md)
- [Especificaciones por fase](docs/specs/)
- [Manual de administración](docs/manuales/administracion.md)
- [Manual de usuario: primeros pasos](docs/manuales/usuario/00-primeros-pasos.md)
- [Manual de tickets para el equipo](docs/manuales/usuario/01-tecnico.md)
- [Manual de coordinación: aprobar, cerrar y facturar OT](docs/manuales/usuario/02-coordinacion.md)
- [Manual del bot de Telegram](docs/manuales/usuario/04-bot-telegram.md)
- [Guía de la API](docs/api/README.md)
- [Guía de instalación en producción](docs/despliegue.md)
- [La demo en el VPS](docs/demo.md)
- [Documentos legales (borradores)](docs/legal/README.md)
- [Cambios por versión](docs/CHANGELOG.md)
