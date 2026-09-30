# Zydesk

Aplicación interna de gestión de tickets, órdenes de trabajo, cotizaciones y horas.
Monorepo con API (Express), web (React + Vite) y un paquete compartido de tipos y utilidades.

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
6. Cargar datos de ejemplo: `npm run db:sembrar` (idempotente; `npm run db:reiniciar` vacía la base de desarrollo y la vuelve a sembrar).
   Para una instalación real, en vez de sembrar, crear la primera cuenta: `npm run db:admin -- --correo admin@ejemplo.cl --nombre "Nombre Apellido"`.
7. Arrancar shared (watch), API y web: `npm run dev`.
8. Abrir <http://localhost:5173>.

### Puertos

| Servicio          | Puerto |
| ----------------- | ------ |
| API               | 3010   |
| Web (Vite)        | 5173   |
| Postgres (Docker) | 5433   |

### Usuarios de ejemplo

Todas las cuentas de ejemplo usan el correo `<usuario>@zydesk.local` y la contraseña de `SEMILLA_PASSWORD`. Por ejemplo: `hikki@zydesk.local` (Administración), `crojas@zydesk.local` (Coordinación), `dmunoz@zydesk.local` (Técnico) y `nvega@zydesk.local` (Solo lectura). La referencia de la API está en <http://localhost:3010/api/docs> (requiere sesión de Administración).

## Base de test

Los tests de la API usan Postgres real, en la base `zydesk_test` (la crea el script de inicio de Docker; se conecta con `TEST_DATABASE_URL` y `TEST_DATABASE_URL_OWNER`). Con Postgres levantado, `npm test` aplica las migraciones y vacía la base entre tests; no toca la base de desarrollo.

## Scripts de la raíz

| Script                 | Qué hace                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`          | Compila `shared` y levanta shared (watch), API y web                                            |
| `npm run build`        | Compila los tres paquetes                                                                       |
| `npm test`             | Corre los tests de los tres paquetes                                                            |
| `npm run typecheck`    | Compila `shared` y revisa tipos en los tres paquetes                                            |
| `npm run lint`         | ESLint                                                                                          |
| `npm run format`       | Prettier (escribe)                                                                              |
| `npm run format:check` | Prettier (solo revisa)                                                                          |
| `npm run clean`        | Borra los `dist/` de los tres paquetes                                                          |
| `npm run db:migrar`    | Aplica las migraciones pendientes (como `zydesk_owner`)                                         |
| `npm run db:revertir`  | Revierte la última migración (`-- --todo` las revierte todas)                                   |
| `npm run db:admin`     | Crea la primera cuenta de Administración (`-- --correo ... --nombre ...`; lee `ADMIN_PASSWORD`) |
| `npm run db:sembrar`   | Carga datos de ejemplo (lee `SEMILLA_PASSWORD`)                                                 |
| `npm run db:reiniciar` | Vacía la base de desarrollo y la vuelve a sembrar                                               |
| `npm run api:openapi`  | Regenera `docs/api/openapi.json`                                                                |

## Estructura

```
apps/api        API Express 5 (pino, TypeORM, Zod)
apps/web        React 19 + Vite + React Router + TanStack Query + Tailwind v4
packages/shared Tipos, errores, formato y utilidades compartidas (se compila a dist/)
docs            Plan, decisiones (ADR), especificaciones por fase, manuales y API
```

## Documentación

- [Plan del proyecto](docs/PLAN.md)
- [Decisiones de arquitectura](docs/decisiones/README.md)
- [Especificaciones por fase](docs/specs/)
- [Manual de administración](docs/manuales/administracion.md)
- [Manual de usuario: primeros pasos](docs/manuales/usuario/00-primeros-pasos.md)
- [Guía de la API](docs/api/README.md)
- [Documentos legales (borradores)](docs/legal/README.md)
- [Cambios por versión](docs/CHANGELOG.md)
