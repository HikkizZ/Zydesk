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
5. Aplicar las migraciones: `npm run db:migrar`.
6. Cargar datos de ejemplo: `npm run db:sembrar` (idempotente; incluye 18 tickets de ejemplo (TK-1012 a TK-1053) y 7 órdenes de trabajo (OT-0213 a OT-0219); `npm run db:reiniciar` vacía la base de desarrollo y la vuelve a sembrar).
   Para una instalación real, en vez de sembrar, crear la primera cuenta: `npm run db:admin -- --correo admin@ejemplo.cl --nombre "Nombre Apellido"`.
7. Arrancar shared (watch), API, web y bot: `npm run dev` (sin `TELEGRAM_BOT_TOKEN` el proceso del bot termina en silencio).
8. Abrir <http://localhost:5173>.

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

## Archivos de tickets y OT

Las fotos, documentos y correos de los tickets y de las órdenes de trabajo se guardan en disco en `ARCHIVOS_DIR` (por defecto `./datos/archivos`, carpeta ignorada por git). Respáldala junto con la base de datos. Más detalles en la sección 12 del [manual de administración](docs/manuales/administracion.md).

## Integración continua

El workflow `.github/workflows/ci.yml` (ADR 0020) corre en cada `push` y en cada PR hacia `main`, en un job llamado `verificar` sobre `ubuntu-24.04`. Levanta un Postgres 16 (puerto 5433), ejecuta `docker/postgres-init/01-roles.sql` con `psql` y luego, en este orden: `npm ci`, `typecheck`, `lint`, `format:check`, `test`, `build` y `npm run api:openapi` seguido de `git diff --exit-code docs/api/openapi.json` (si falla, regenera el archivo con `npm run api:openapi` y súbelo). El `.env` se genera desde `.env.example` con contraseñas de prueba; no usa secretos. El repositorio es público: las acciones de terceros van fijadas por SHA de commit (el tag queda como comentario) y hay que actualizarlas a mano. Para que un PR no pueda mezclarse con el CI en rojo, en GitHub: Settings > Branches > regla para `main` > "Require status checks to pass" > `verificar`.

## Scripts de la raíz

| Script                  | Qué hace                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`           | Compila `shared` y levanta shared (watch), API, web y bot                                       |
| `npm run build`         | Compila los cuatro paquetes                                                                     |
| `npm test`              | Corre los tests de los cuatro paquetes                                                          |
| `npm run typecheck`     | Compila `shared` y revisa tipos en los cuatro paquetes                                          |
| `npm run lint`          | ESLint                                                                                          |
| `npm run format`        | Prettier (escribe)                                                                              |
| `npm run format:check`  | Prettier (solo revisa)                                                                          |
| `npm run clean`         | Borra los `dist/` de los cuatro paquetes                                                        |
| `npm run db:migrar`     | Aplica las migraciones pendientes (como `zydesk_owner`)                                         |
| `npm run db:revertir`   | Revierte la última migración (`-- --todo` las revierte todas)                                   |
| `npm run db:admin`      | Crea la primera cuenta de Administración (`-- --correo ... --nombre ...`; lee `ADMIN_PASSWORD`) |
| `npm run db:sembrar`    | Carga datos de ejemplo (lee `SEMILLA_PASSWORD`)                                                 |
| `npm run db:reiniciar`  | Vacía la base de desarrollo y la vuelve a sembrar                                               |
| `npm run db:test:crear` | Crea una base de test propia (`-- <sufijo>`); usarla con `TEST_BD_SUFIJO=<sufijo>`              |
| `npm run api:openapi`   | Regenera `docs/api/openapi.json`                                                                |

## Estructura

```
apps/api        API Express 5 (pino, TypeORM, Zod)
apps/web        React 19 + Vite + React Router + TanStack Query + Tailwind v4
apps/bot        Bot de Telegram (grammY, long polling); sin BD, habla solo con la API
packages/shared Tipos, errores, formato y utilidades compartidas (se compila a dist/)
docs            Plan, decisiones (ADR), especificaciones por fase, manuales y API
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
- [Documentos legales (borradores)](docs/legal/README.md)
- [Cambios por versión](docs/CHANGELOG.md)
