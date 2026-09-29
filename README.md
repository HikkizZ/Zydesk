# Zydesk

Aplicación interna de gestión de tickets, órdenes de trabajo, cotizaciones y horas.
Monorepo con API (Express), web (React + Vite) y un paquete compartido de tipos y utilidades.

## Requisitos

- Node 22 y npm 10
- Docker (para Postgres de desarrollo)

## Levantar en local

1. Copiar la configuración: `cp .env.example .env` (en Windows CMD: `copy .env.example .env`).
2. Instalar dependencias: `npm install`.
3. Levantar Postgres: `docker compose -f docker-compose.dev.yml up -d`.
4. Arrancar shared (watch), API y web: `npm run dev`.
5. Abrir <http://localhost:5173> (la API escucha en el puerto 3010).

## Scripts de la raíz

| Script                 | Qué hace                                             |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Compila `shared` y levanta shared (watch), API y web |
| `npm run build`        | Compila los tres paquetes                            |
| `npm test`             | Corre los tests de los tres paquetes                 |
| `npm run typecheck`    | Compila `shared` y revisa tipos en los tres paquetes |
| `npm run lint`         | ESLint                                               |
| `npm run format`       | Prettier (escribe)                                   |
| `npm run format:check` | Prettier (solo revisa)                               |
| `npm run clean`        | Borra los `dist/` de los tres paquetes               |

## Estructura

```
apps/api        API Express 5 (pino, TypeORM, Zod)
apps/web        React 19 + Vite + React Router + TanStack Query + Tailwind v4
packages/shared Tipos, errores, formato y utilidades compartidas (se compila a dist/)
docs            Plan, decisiones (ADR), especificaciones por fase
```

## Documentación

- [Plan del proyecto](docs/PLAN.md)
- [Decisiones de arquitectura](docs/decisiones/README.md)
- [Especificaciones por fase](docs/specs/)
