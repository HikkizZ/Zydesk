# CLAUDE.md

## 1. Qué es y dónde está la verdad

Zydesk: gestión de tickets, órdenes de trabajo, cotizaciones y horas. La fuente de verdad es `docs/PLAN.md`, las ADRs en `docs/decisiones/` y la spec de la fase en `docs/specs/fase-N.md`. Si una ADR y el PLAN se contradicen, manda la ADR.

## 2. Convenciones

- Español en dominio, rutas, nombres de archivos, mensajes de commit y logs.
- `snake_case` en JSON, BD y en los campos de datos que los cruzan (propiedades de entidades TypeORM, esquemas Zod, DTOs); `camelCase` en variables, funciones, métodos y tipos de TypeScript.
- TypeScript estricto, ESM, imports relativos con extensión `.js` en `api` y `shared`; sin `any`.
- Entidades TypeORM siempre con `type` explícito en `@Column` (tsx no emite metadatos de decoradores).
- API por módulo (`apps/api/src/modulos/<módulo>/`): el handler de `ruta()` solo delega al servicio y resuelve lo puramente HTTP (cookies, cabeceras, `res.status`); la lógica de negocio va en `*.service.ts`.
- Un módulo escribe en las tablas de otro solo a través del servicio de ese módulo, pasándole el `tx` (`EntityManager`) de la transacción en curso (ADR 0003): un servicio puede orquestar un único `enTransaccion` que toque varios módulos (cierre de OT → ticket, conversión ticket → OT). Leer entidades de otro módulo (joins, `findOneBy`) sí está permitido. Sin dependencias circulares entre módulos, salvo `tickets` ↔ `ots`, que la ADR 0003 exige y se limita a importar funciones entre sus `*.service.ts`.

## 3. Tests

- Cada tarea trae sus tests; `npm test` debe quedar verde antes de terminar.
- API con Supertest sobre `crearApp()`.
- Nada de mocks del ORM (desde la Fase 1: Postgres real).

## 4. Regla de oro

No tomar decisiones de diseño sin ADR. Si la spec de la fase no lo cubre, detenerse y preguntar.

## 5. Logs (ADR 0017)

- Siempre el `logger` de `config/logger.ts`, nunca `console.*`.
- Solo ids; nunca contenido de mensajes, notas o archivos ni secretos.
- Mensajes en español y cortos.

## 6. Comandos

- `npm run dev`
- `npm test`
- `npm run test -w @zydesk/api`
- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `docker compose -f docker-compose.dev.yml up -d` / `docker compose -f docker-compose.dev.yml down`

## 7. Windows

Sin `rm -rf` ni variables de entorno inline en scripts; usar `rimraf` y `cross-env`.
