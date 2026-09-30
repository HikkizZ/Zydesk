# ADR 0001 — Stack y estructura del monorepo

**Estado**: aceptada · 2026-09-29 · precisada por ADR 0021 (Fase 2)

## Contexto

App interna para ~10 personas. El desarrollador domina Node/Express/TypeScript/TypeORM/PostgreSQL/React. La spec exige: OIDC Microsoft + contraseña, archivos (fotos, .msg/.eml, PDF), correo saliente, .xlsx y PDF, zona America/Santiago, y un bot de mensajería futuro. Principio rector: lo más simple que cumpla.

## Opciones consideradas

1. **Monorepo npm workspaces** (`apps/api`, `apps/web`, `packages/shared`) — un solo repo, tipos y esquemas compartidos, un `npm install`.
2. Dos repos (api / web) con paquete `shared` publicado — más ceremonia (versionado, publish) sin beneficio para un equipo de una persona.
3. Full-stack con Next.js/Remix — obliga a aprender un framework nuevo y complica el bot y los jobs.

## Decisión

Opción 1, confirmando el stack propuesto con estos ajustes menores:

| Capa | Elección | Nota |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript 5 estricto, ESM | `tsx` en desarrollo, `tsc` para build. |
| API | Express 5 + TypeORM 0.3 + PostgreSQL 16 | Migraciones de TypeORM versionadas (`synchronize: false` siempre). |
| Validación | Zod 4 en `packages/shared` | Mismos esquemas en API (middleware) y en formularios. |
| Web | React 19 + Vite + React Router 7 + TanStack Query 5 + React Hook Form | Sin gestor de estado global. |
| UI | Tailwind v4 + shadcn/ui (Radix) + lucide-react + dnd-kit + Recharts | Ver ADR 0011. |
| Jobs y cola | pg-boss (misma BD, mismo proceso que la API) | Ver ADR 0008. |
| Correo | nodemailer (SMTP) · `mailparser` (.eml) · `@kenjiuno/msgreader` (.msg) | Ver ADR 0009. |
| Documentos | exceljs (.xlsx) · pdfmake (PDF) | pdfmake: puro JS, sin Chromium, suficiente para una cotización tabular. |
| Tests | Vitest + Supertest; Playwright solo para 3–4 flujos críticos (login, crear ticket, cerrar OT) | Los tests de API corren contra un Postgres de Docker, no contra mocks del ORM. |
| Deploy | Docker Compose: `api`, `web` (nginx:alpine con el build estático y `proxy_pass /api → api:3000`), `postgres` | Portable a cualquier VPS. En el servidor del usuario, `web` se une a la red externa `web` y el `nginx-proxy` existente enruta el subdominio. Datos en `/srv/data/trazo/`. |

Estructura:

```
apps/api        Express: módulos por dominio (auth, tickets, ots, cotizaciones, horas, avisos, archivos, config)
apps/web        React: rutas por pantalla, componentes de UI, hooks de datos
packages/shared enums, máquinas de estado, esquemas Zod, permisos, cálculo de cotización, motor de horas hábiles
apps/bot        (futuro) grammY, cliente de la API — no accede a la BD
docs/           especificación, decisiones (ADRs), manuales, despliegue
```

Cada módulo de la API expone **servicios** (lógica y transacciones) y **rutas** (HTTP). Los repositorios de TypeORM no se usan fuera de su módulo. No hay capa "controller" separada: la ruta valida con Zod y llama al servicio.

## Consecuencias

- Un único `npm run dev` levanta API y web; `packages/shared` se consume por ruta de workspace sin build intermedio (Vite y tsx resuelven TS directamente).
- PM2 no se usa: en Docker el proceso lo reinicia Compose (`restart: unless-stopped`).
- Express 5 tiene manejo nativo de promesas rechazadas; no se necesita `express-async-errors`.
- El bot futuro queda desacoplado por construcción: solo puede hablar con la API (ADR 0008).
- Riesgo asumido: pdfmake tiene tipografía limitada; se embeben IBM Plex Sans/Mono como fuentes del PDF.
