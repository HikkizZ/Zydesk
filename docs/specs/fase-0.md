# Fase 0 — Andamiaje · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §3–§4, ADR 0001, 0010, 0011, 0017.
>
> Entorno objetivo: Windows 11 · Node 22.21 · npm 10.9 · Docker 29 + Compose v5 · Git Bash y PowerShell. **Todo script npm debe funcionar en Windows**: sin `rm -rf` (usar `rimraf`), sin `FOO=bar cmd` (usar `cross-env`), sin `&&` dependiente de shell salvo dentro de scripts npm (npm los ejecuta con `cmd`/`sh`, donde `&&` sí funciona).

## 0. Alcance

**Entra**: monorepo npm workspaces (`@zydesk/shared`, `@zydesk/api`, `@zydesk/web`), TypeScript estricto, ESLint + Prettier, Vitest en los tres paquetes, Postgres 16 en `docker-compose.dev.yml`, API mínima (Express 5, pino + `req_id`, errores ADR 0010, `GET /api/salud`, apagado ordenado), web mínima (React 19 + Vite + React Router 7 + TanStack Query + Tailwind v4 con tokens y fuentes + layout con menú lateral oscuro y rutas vacías), `packages/shared` con estructura y `formato/`, `README.md`, `CLAUDE.md`, `.env.example`, `docs/CHANGELOG.md`.

**No entra**: Dockerfiles de producción, autenticación, entidades, migraciones, pg-boss, componentes shadcn (solo su configuración), tests contra Postgres real (llegan en Fase 1 con `apps/api/test/`).

## 1. Versiones (mayores fijados)

Instalar la **última versión estable publicada del mayor indicado**. Si npm ya no ofrece ese mayor como estable o el mayor superior es incompatible con lo aquí descrito, detente y pregunta.

| Paquete | Mayor | Dónde |
|---|---|---|
| `typescript` | 5 | raíz |
| `tsx` | 4 | api |
| `vitest` | 3 o superior | raíz (una sola versión; los workspaces la heredan) |
| `eslint` | 9 (flat config) · `typescript-eslint` 8 · `eslint-plugin-react-hooks` última · `eslint-config-prettier` última | raíz |
| `prettier` | 3 | raíz |
| `concurrently` 9 · `cross-env` última · `rimraf` 6 | — | raíz |
| `express` | 5 (+ `@types/express` 5) | api |
| `helmet` | última | api |
| `pino` 9 · `pino-http` 10 · `pino-pretty` última | — | api |
| `typeorm` 0.3 · `pg` 8 · `reflect-metadata` última | — | api |
| `zod` | 4 | shared (api y web lo usan a través de shared o como dependencia directa, misma versión) |
| `dotenv` | última | api |
| `supertest` 7 (+ `@types/supertest`) | — | api (dev) |
| `date-fns` 4 · `@date-fns/tz` 1 | — | shared |
| `react` 19 · `react-dom` 19 · `react-router` 7 (paquete `react-router`, **no** `react-router-dom`) · `@tanstack/react-query` 5 | — | web |
| `vite` 7 o superior · `@vitejs/plugin-react` última · `tailwindcss` 4 · `@tailwindcss/vite` 4 | — | web |
| `clsx` · `tailwind-merge` 3 · `lucide-react` | — | web |
| `@fontsource/bricolage-grotesque` · `@fontsource/ibm-plex-sans` · `@fontsource/ibm-plex-mono` | última | web |
| `jsdom` · `@testing-library/react` 16 | — | web (dev) |

Versión de Node fijada en `package.json` raíz: `"engines": { "node": ">=22 <23", "npm": ">=10" }` y archivo `.nvmrc` con `22`.

## 2. Estructura resultante

```
tickets-app/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts                 # crearApp(): Express sin listen
│   │   │   ├── server.ts              # arranque, DataSource, SIGTERM
│   │   │   ├── config/{env.ts, logger.ts, db.ts, version.ts}
│   │   │   ├── core/
│   │   │   │   ├── errores/{error-app.ts, manejador.ts}
│   │   │   │   └── http/{contexto.ts, req-id.ts, log-http.ts}
│   │   │   └── modulos/salud/{salud.routes.ts, salud.test.ts}
│   │   ├── package.json · tsconfig.json · tsconfig.build.json · vitest.config.ts
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/{router.tsx, proveedores.tsx, layout/{Layout.tsx, MenuLateral.tsx, BarraInferior.tsx, menu.ts}}
│       │   ├── estilos/{tema.css, fuentes.css}
│       │   ├── components/ui/          # vacío (shadcn, Fase 1)
│       │   ├── features/{salud/, ...}  # ver §7
│       │   └── lib/{utils.ts, api.ts}
│       ├── components.json · vite.config.ts · tsconfig.json · vitest.config.ts · package.json
├── packages/shared/
│   ├── src/{index.ts, errores.ts, permisos.ts, esquemas/, enums/, estados/, horas-habiles/, cotizacion/, formato/}
│   ├── package.json · tsconfig.json · vitest.config.ts
├── docs/{PLAN.md, CHANGELOG.md, decisiones/, specs/, especificacion/}
├── docker-compose.dev.yml · .env.example · .env (ignorado)
├── package.json · tsconfig.base.json · eslint.config.js · .prettierrc · .prettierignore
├── .editorconfig · .gitignore · .nvmrc · CLAUDE.md · README.md
```

Nota: ADR 0011 llama `estilos/` a la carpeta de CSS y ADR 0004 llama `estados/` a las máquinas de estado; el PLAN usa `styles/` y `maquinas-estado/`. **Manda la ADR** (PLAN cabecera).

## 3. Raíz del monorepo

### 3.1 `package.json`

```json
{
  "name": "zydesk",
  "private": true,
  "type": "module",
  "workspaces": ["packages/shared", "apps/api", "apps/web"],
  "engines": { "node": ">=22 <23", "npm": ">=10" },
  "scripts": {
    "postinstall": "npm run build -w @zydesk/shared",
    "dev": "npm run build -w @zydesk/shared && concurrently -n shared,api,web -c blue,green,magenta \"npm run dev -w @zydesk/shared\" \"npm run dev -w @zydesk/api\" \"npm run dev -w @zydesk/web\"",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "typecheck": "npm run build -w @zydesk/shared && npm run typecheck --workspaces",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "rimraf packages/shared/dist apps/api/dist apps/web/dist"
  }
}
```

El orden de `workspaces` importa: `--workspaces` los recorre en ese orden y `shared` debe construirse antes que `api`.

### 3.2 Cómo se consume `@zydesk/shared` (decisión)

`shared` se **compila a `dist/` con `tsc`** y `api`/`web` lo importan como paquete normal por el enlace de `node_modules` que crea npm workspaces. Sin project references, sin `paths`, sin alias. Funciona igual en `tsx`, Vite, Vitest y Node en producción. `postinstall` garantiza que `dist/` exista tras `npm install`; en `dev`, `tsc --watch` lo mantiene al día.

`packages/shared/package.json`:

```json
{
  "name": "@zydesk/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./formato": { "types": "./dist/formato/index.d.ts", "default": "./dist/formato/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "rimraf dist && tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

### 3.3 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- `shared` y `api`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"` → **los imports relativos llevan extensión `.js`** (`import { x } from './env.js'`). `api` añade `"experimentalDecorators": true`, `"emitDecoratorMetadata": true`, `"lib": ["ES2023"]`, `"types": ["node"]`.
- `web`: `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"jsx": "react-jsx"`, `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"noEmit": true`, `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }`, `"types": ["vite/client"]`.
- Cada workspace: `tsconfig.json` cubre `src/**/*` incluidos tests (para `typecheck`); `api` y `shared` tienen además `tsconfig.build.json` que extiende al anterior con `"exclude": ["src/**/*.test.ts"]` y es el que usan `build` y `dev` (watch).
- `rootDir: "src"`, `outDir: "dist"` en `shared` y `api`.

### 3.4 ESLint y Prettier

`eslint.config.js` (ESM) en la raíz con `typescript-eslint` (`recommendedTypeChecked` no; usar `recommended` para no depender del proyecto TS en lint), `eslint-plugin-react-hooks` solo para `apps/web/**`, `eslint-config-prettier` al final. `ignores`: `**/dist/**`, `**/node_modules/**`, `docs/**`. Regla adicional: `@typescript-eslint/no-unused-vars` con `argsIgnorePattern: "^_"`.

`.prettierrc`: `{ "semi": true, "singleQuote": true, "printWidth": 100, "trailingComma": "all" }`. `.prettierignore`: `dist`, `node_modules`, `docs/especificacion`, `*.md` **no** se ignora.

### 3.5 Otros archivos raíz

- `.editorconfig`: `indent_style = space`, `indent_size = 2`, `end_of_line = lf`, `charset = utf-8`, `insert_final_newline = true`, `trim_trailing_whitespace = true`.
- `.gitignore`: `node_modules/`, `dist/`, `.env`, `*.log`, `.DS_Store`, `Thumbs.db`, `coverage/`, `.vite/`.
- `.gitattributes`: `* text=auto eol=lf`.
- `git init` (rama `main`) y un primer commit al terminar la fase.

## 4. Postgres de desarrollo

### 4.1 `.env.example` (copia a `.env`; Compose y la API lo leen desde la raíz)

```dotenv
# Entorno: development | test | production
NODE_ENV=development

# Postgres (usado por docker-compose.dev.yml)
POSTGRES_USER=zydesk
POSTGRES_PASSWORD=zydesk
POSTGRES_DB=zydesk
POSTGRES_PORT=5432

# API
API_PUERTO=3000
DATABASE_URL=postgres://zydesk:zydesk@localhost:5432/zydesk
# error | warn | info | debug — por defecto: debug en development, info en el resto
LOG_LEVEL=

# Web (solo desarrollo)
WEB_PUERTO=5173
```

### 4.2 `docker-compose.dev.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: zydesk-postgres-dev
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: UTC
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - zydesk-postgres-dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  zydesk-postgres-dev:
```

Sin `version:` (obsoleto en Compose v2+). Compose lee `.env` de la raíz automáticamente.

## 5. `packages/shared`

- `src/index.ts`: reexporta `errores.ts`, `permisos.ts` y `formato/index.ts`. Las carpetas `esquemas/`, `enums/`, `estados/`, `horas-habiles/`, `cotizacion/` contienen solo `index.ts` con `export {};` y un comentario de una línea con su propósito (PLAN §3). `permisos.ts`: `export {};` con comentario "matriz de permisos (Fase 1, ADR 0002)".
- `src/errores.ts` (ADR 0010):
  ```ts
  export const CODIGOS_ERROR = {
    VALIDACION: 400, NO_AUTENTICADO: 401, SIN_PERMISO: 403,
    NO_ENCONTRADO: 404, CONFLICTO: 409, INTERNO: 500,
  } as const;
  export type CodigoError = keyof typeof CODIGOS_ERROR;
  ```
- `src/formato/index.ts` reexporta `moneda.ts` y `fecha.ts`.
- `src/formato/moneda.ts`: `formatearCLP(monto: number): string` con `new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })`. Casos de test: `565250 → "$565.250"`, `0 → "$0"`, `1000 → "$1.000"`, `-4500 → "-$4.500"`, `1234.6 → "$1.235"`. (Node 22 trae ICU completo; si el separador que devuelve Intl no es `.`, detente y pregunta.)
- `src/formato/fecha.ts`:
  ```ts
  export const ZONA = 'America/Santiago';
  const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  export function formatearFecha(fecha: Date | string): string // "29 sep 2026"
  ```
  Implementación: `new TZDate(fecha, ZONA)` de `@date-fns/tz` (si `fecha` es string, se parsea como ISO 8601), y se arma `${getDate(d)} ${MESES_CORTOS[getMonth(d)]} ${getFullYear(d)}` con las funciones de `date-fns`. **No** usar `format` con locale `es` (devuelve `sept`). Casos de test: `"2026-09-29T15:00:00Z" → "29 sep 2026"`, `"2026-01-01T02:30:00Z" → "31 dic 2025"` (en Santiago aún es 31 de diciembre, UTC−3), `new Date(Date.UTC(2026, 5, 15, 12)) → "15 jun 2026"`.
- `vitest.config.ts`: `{ test: { include: ['src/**/*.test.ts'] } }`. Tests en `src/formato/moneda.test.ts` y `src/formato/fecha.test.ts`. Script `test` con `cross-env TZ=UTC vitest run` (ADR 0005: tests con `TZ=UTC`).

## 6. `apps/api`

`package.json`: `"name": "@zydesk/api"`, `"type": "module"`, scripts:

```json
"dev": "cross-env TZ=UTC tsx watch src/server.ts",
"build": "rimraf dist && tsc -p tsconfig.build.json",
"start": "cross-env TZ=UTC node dist/server.js",
"typecheck": "tsc -p tsconfig.json --noEmit",
"test": "cross-env TZ=UTC NODE_ENV=test vitest run"
```

Dependencias: `@zydesk/shared` (`"*"`), `express`, `helmet`, `pino`, `pino-http`, `typeorm`, `pg`, `reflect-metadata`, `zod`, `dotenv`. Dev: `pino-pretty`, `supertest`, `@types/express`, `@types/supertest`, `@types/node`, `tsx`, `rimraf`, `cross-env`.

### 6.1 `config/env.ts`

Carga `.env` de la raíz con `dotenv`: `config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) })` (misma profundidad desde `src/config` y desde `dist/config`); si el archivo no existe no falla. Luego valida `process.env` con Zod y exporta `env`:

```ts
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PUERTO: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
});
export type Env = z.infer<typeof esquema>;
export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env  // lanza Error con mensaje "Configuración inválida: <campo>: <problema>, ..." si falla
export const env = cargarEnv();
```

`LOG_LEVEL` vacío (`""`) se trata como ausente (preprocesar `'' → undefined`). Test `env.test.ts`: (a) con `DATABASE_URL` ausente `cargarEnv({})` lanza y el mensaje contiene `DATABASE_URL`; (b) `API_PUERTO: '4000'` → `4000` numérico; (c) `LOG_LEVEL: ''` → `undefined`.

### 6.2 `config/version.ts`

`export const VERSION: string` leyendo `apps/api/package.json` con `readFileSync(new URL('../../package.json', import.meta.url))` (misma profundidad desde `src/config` y `dist/config`) y `JSON.parse(...).version`.

### 6.3 `config/logger.ts` (ADR 0017)

```ts
export const CLAVES_REDACTADAS = ['password', 'contrasena', 'cookie', 'set-cookie', 'authorization', 'token', 'codigo'];
export function crearLogger(opciones: { nivel: string; entorno: string; version: string; bonito: boolean; destino?: DestinationStream }): pino.Logger
export const logger = crearLogger({ nivel: env.LOG_LEVEL ?? (env.NODE_ENV === 'development' ? 'debug' : 'info'), entorno: env.NODE_ENV, version: VERSION, bonito: env.NODE_ENV === 'development' });
```

Opciones de pino obligatorias:
- `base: { servicio: 'api', version, entorno }` (esto elimina `pid` y `hostname`).
- `timestamp: pino.stdTimeFunctions.isoTime` → campo `time` en ISO.
- `formatters: { level: (etiqueta) => ({ level: etiqueta }) }` → `"level":"info"`, no número.
- `messageKey: 'msg'`, `errorKey: 'err'`.
- `mixin: () => contexto.getStore() ?? {}` (ver 6.5) → inyecta `req_id` y `usuario_id` en cada línea de la petición.
- `redact: { paths, censor: '[Redactado]' }` donde `paths` = para cada clave `k` de `CLAVES_REDACTADAS`: `k`, `*.k`, `*.*.k`, `req.headers.k`, `res.headers.k` (usar notación `["set-cookie"]` para las claves con guion). pino no admite comodines profundos; tres niveles bastan para los objetos que registramos.
- `bonito: true` → `transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'servicio,version,entorno' } }`. Con `bonito: false` y `destino` definido → `pino(opciones, destino)` (permite capturar líneas en tests).

Test `logger.test.ts` (con un `Writable` que acumula líneas y las parsea como JSON):
1. `logger.info({ password: 'x', usuario: { contrasena: 'y', token: 'z' }, authorization: 'Bearer a' }, 'hola')` → la línea tiene `password`, `usuario.contrasena`, `usuario.token`, `authorization` iguales a `"[Redactado]"` y `msg === 'hola'`.
2. La misma línea tiene `time` (string ISO parseable por `Date.parse`), `level === 'info'`, `servicio === 'api'`, `version`, `entorno`, y **no** tiene `pid` ni `hostname`.
3. `logger.error({ err: new Error('boom') }, 'falló')` → `err.type === 'Error'`, `err.message === 'boom'`, `err.stack` string.
4. Dentro de `contexto.run({ req_id: 'abc' }, () => logger.info('x'))` la línea tiene `req_id === 'abc'`; fuera, no tiene `req_id`.

### 6.4 `config/db.ts`

```ts
import 'reflect-metadata';
export const dataSource = new DataSource({ type: 'postgres', url: env.DATABASE_URL, entities: [], migrations: [], synchronize: false, logging: false });
export async function comprobarBd(): Promise<boolean>  // dataSource.query('SELECT 1') → true; cualquier error → false (y logger.warn con err)
```

Sin entidades ni migraciones en esta fase. `server.ts` llama `dataSource.initialize()` antes de escuchar; si falla, registra `error` y sale con código 1.

### 6.5 `core/http/contexto.ts` y `req-id.ts`

```ts
// contexto.ts
export interface ContextoPeticion { req_id: string; usuario_id?: number }
export const contexto = new AsyncLocalStorage<ContextoPeticion>();

// req-id.ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reqId(): RequestHandler // toma X-Request-Id si cumple UUID, si no crypto.randomUUID(); asigna req.id, res.setHeader('X-Request-Id', id), y ejecuta next() dentro de contexto.run({ req_id: id }, next)
```

Este middleware es el **primero** de la cadena; así el log de fin de petición de pino-http (que se dispara en `res` `finish`) corre dentro del contexto y hereda `req_id` por el `mixin`.

### 6.6 `core/http/log-http.ts`

`pinoHttp` con `logger`, `genReqId: (req) => req.id`, `autoLogging: true`, y esta forma de salida (no importa cómo se logre; el test manda):
- Sin `req` ni `res` anidados: `serializers: { req: () => undefined, res: () => undefined }` y `customProps` (o `customAttributeKeys` + `customProps`) para producir planos `metodo` (`req.method`), `ruta` (`req.baseUrl + req.route.path` si `req.route` existe, si no `req.originalUrl` sin query), `status` (`res.statusCode`), `ip` (`req.ip`).
- `customAttributeKeys: { responseTime: 'duracion_ms', reqId: 'req_id' }` (el `req_id` ya viene por el mixin; si pino-http añade también `reqId`, renombrarlo o quitarlo: la línea final debe tener **un solo** campo `req_id`).
- `customLogLevel: (req, res, err) => err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'`.
- `customSuccessMessage: () => 'petición completada'`, `customErrorMessage: () => 'petición con error'`.
- `quietReqLogger` **no** se usa.

### 6.7 Errores (ADR 0010)

- `core/errores/error-app.ts`: `class ErrorApp extends Error { constructor(public codigo: CodigoError, mensaje: string, public detalles?: unknown) }`; `get status()` → `CODIGOS_ERROR[codigo]`.
- `core/errores/manejador.ts`: (a) `noEncontrado`: handler final para `/api/*` que responde `404 { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } }`; (b) `manejadorErrores` (4 argumentos): si `err instanceof ErrorApp` → `status` y `{ error: { codigo, mensaje, detalles } }` (sin `detalles` si es `undefined`); cualquier otro error → `logger.error({ err }, 'error no controlado')` y `500 { error: { codigo: 'INTERNO', mensaje: 'Error interno' } }` sin detalles. Los `ErrorApp` de 4xx **no** se registran como error (pino-http ya deja `warn`).

### 6.8 `modulos/salud/salud.routes.ts`

`GET /api/salud`: llama `comprobarBd()`. Si `true` → `200 { estado: 'ok', version: VERSION, bd: 'ok' }`; si `false` → `503 { estado: 'error', version: VERSION, bd: 'error' }`. Exporta `crearRutaSalud(comprobar: () => Promise<boolean>): Router` para inyectar la comprobación en tests.

### 6.9 `app.ts` y `server.ts`

```ts
// app.ts
export interface DependenciasApp { comprobarBd: () => Promise<boolean>; logger?: pino.Logger }
export function crearApp(deps: DependenciasApp): Express
```
Orden de middlewares: `reqId()` → `logHttp` → `helmet()` → `express.json({ limit: '1mb' })` → `app.use('/api/salud', crearRutaSalud(deps.comprobarBd))` → `noEncontrado` (solo `/api`) → `manejadorErrores`. `app.set('trust proxy', false)` en esta fase (ADR 0013 lo configurará con `PROXY_SALTOS`). `app.disable('x-powered-by')`.

`server.ts`: `import 'reflect-metadata'`; `await dataSource.initialize()`; `const app = crearApp({ comprobarBd })`; `server = app.listen(env.API_PUERTO)`; `logger.info({ puerto, version: VERSION, entorno }, 'api iniciada')`. Apagado: en `SIGTERM` y `SIGINT` → `logger.info('apagando api')`, `server.close()`, `await dataSource.destroy()`, `logger.info('api detenida')`, `process.exit(0)`; si en 10 s no terminó, `process.exit(1)`. Registrar `process.on('unhandledRejection')` y `uncaughtException` con `logger.fatal` + `exit(1)`.

### 6.10 Tests de la API (Supertest, sin Postgres)

`modulos/salud/salud.test.ts` con `crearApp({ comprobarBd: async () => true })` y otro con `false`:
1. `GET /api/salud` → 200, cuerpo `{ estado: 'ok', version: <string>, bd: 'ok' }`, cabecera `x-request-id` con formato UUID.
2. Con `X-Request-Id: 123e4567-e89b-12d3-a456-426614174000` → la respuesta devuelve el mismo valor. Con `X-Request-Id: no-es-uuid` → devuelve un UUID distinto.
3. `comprobarBd → false` → 503 y `bd: 'error'`.
4. `GET /api/no-existe` → 404 `{ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } }`.
5. Log de petición: construir la app con un `logger` de test (destino en memoria, ver 6.3) y verificar que la línea de fin de petición tiene exactamente las claves `time, level, msg, servicio, version, entorno, req_id, metodo, ruta, status, duracion_ms, ip` (sin `req`, `res`, `reqId`, `responseTime`, `pid`, `hostname`), con `ruta === '/api/salud'`, `metodo === 'GET'`, `status === 200`, `req_id` igual a la cabecera devuelta.

`vitest.config.ts`: `{ test: { include: ['src/**/*.test.ts'], environment: 'node' } }`.

## 7. `apps/web`

`package.json`: `"name": "@zydesk/web"`, scripts: `"dev": "vite"`, `"build": "tsc -p tsconfig.json --noEmit && vite build"`, `"typecheck": "tsc -p tsconfig.json --noEmit"`, `"test": "vitest run"`, `"preview": "vite preview"`.

### 7.1 `vite.config.ts`

```ts
export default defineConfig(({ mode }) => {
  const raiz = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, raiz, '');           // lee .env de la raíz
  return {
    plugins: [react(), tailwindcss()],
    envDir: raiz,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: Number(env.WEB_PUERTO ?? 5173), proxy: { '/api': `http://localhost:${env.API_PUERTO ?? 3000}` } },
    test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'src/**/*.test.ts'] },
  };
});
```
(`test` va en el mismo archivo con `/// <reference types="vitest/config" />`; no hace falta `vitest.config.ts` aparte.)

### 7.2 Estilos: `src/estilos/fuentes.css` y `src/estilos/tema.css`

`fuentes.css`: `@import "@fontsource/bricolage-grotesque/600.css"; @import ".../700.css"; @import "@fontsource/ibm-plex-sans/400.css"; 500; 600; @import "@fontsource/ibm-plex-mono/400.css"; 500;`.

`tema.css` (ADR 0011, valores de la spec §7; **nombres exactos**):

```css
@import 'tailwindcss';
@theme {
  --color-fondo: #f3f1ec;
  --color-superficie: #ffffff;
  --color-superficie-suave: #f7f5f1;
  --color-superficie-suave-2: #fbfaf7;
  --color-tinta: #1b1a17;
  --color-tinta-2: #4a463f;
  --color-tinta-3: #5c574e;
  --color-borde: #e1ddd4;
  --color-borde-campo: #cfc9be;
  --color-acento: #2f47c4;
  --color-urgente: #9a1c0e;        --color-urgente-fondo: #fce9e4;  --color-urgente-punto: #c8321f;
  --color-alta: #7a4300;           --color-alta-fondo: #fbefd9;     --color-alta-punto: #d98a1c;
  --color-media: #2f47c4;          --color-media-fondo: #e8ecf9;    --color-media-punto: #2f47c4;
  --color-baja: #4f4b44;           --color-baja-fondo: #eeece7;     --color-baja-punto: #4f4b44;
  --color-en-espera: #6e4300;      --color-en-espera-fondo: #f6eedb;
  --color-resuelto: #0e5a3f;       --color-resuelto-fondo: #e1f2ea;
  --color-interna: #4e2f99;        --color-interna-fondo: #eee8fa;
  --color-nota-interna-fondo: #fbf5e4; --color-nota-interna-borde: #ebddb0;
  --color-grafico-facturable: #2f47c4; --color-grafico-interna: #d98a1c;
  --font-titulo: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  --font-texto: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
@layer base {
  html { font-family: var(--font-texto); background: var(--color-fondo); color: var(--color-tinta); }
  h1, h2, h3 { font-family: var(--font-titulo); }
}
```

`--color-media-fondo` (`#e8ecf9`) y los puntos de `media`/`baja` no están en la spec (que solo da texto/fondo); son valores provisionales marcados con un comentario `/* provisional, no está en la spec */`. Sin modo oscuro.

`main.tsx` importa `./estilos/fuentes.css` y `./estilos/tema.css` en ese orden.

### 7.3 shadcn/ui (decisión)

**No se inicializa con la CLI** en esta fase (sobrescribiría `tema.css` con sus variables). Se deja preparado: `src/lib/utils.ts` con `export function cn(...entradas: ClassValue[]) { return twMerge(clsx(entradas)); }` y `components.json`:

```json
{ "$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "config": "", "css": "src/estilos/tema.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide" }
```
El mapeo de las variables de shadcn (`--background`, `--primary`, …) a los tokens se hará en Fase 1 al generar el primer componente.

### 7.4 Rutas y páginas (`src/app/router.tsx`, React Router 7 `createBrowserRouter`)

| Ruta | Título de página (`<h1>`) | Entrada de menú |
|---|---|---|
| `/` | redirige a `/mi-dia` | — |
| `/tickets/nuevo` | Nuevo ticket | Nuevo ticket (botón destacado) |
| `/mi-dia` | Mi día | Mi día |
| `/avisos` | Avisos | Avisos |
| `/tickets` | Tablero | Tickets → Tablero |
| `/tickets/tabla` | Tabla | Tickets → Tabla |
| `/tickets/linea-de-tiempo` | Línea de tiempo | Tickets → Línea de tiempo |
| `/ots` | Órdenes de trabajo | Trabajo → Órdenes de trabajo |
| `/cotizaciones` | Cotizador | Trabajo → Cotizador |
| `/horas` | Horas | Trabajo → Horas |
| `/reportes` | Reportes | Administración → Reportes |
| `/clientes` | Clientes | Administración → Clientes |
| `/configuracion` | Configuración | Administración → Configuración |
| `/perfil` | Perfil | Usuario (pie del menú) |
| `*` | Página no encontrada | — |

Cada página es un componente en `src/features/<feature>/pages/<Nombre>Page.tsx` (features: `tickets`, `mi-dia`, `avisos`, `ots`, `cotizador`, `horas`, `reportes`, `clientes`, `configuracion`, `perfil`) que renderiza `<h1>` con el título y un párrafo "Pendiente (Fase N)" con la fase del PLAN §4. Además `document.title = `${titulo} · Zydesk`` mediante un `useEffect` en un componente `TituloPagina` (`src/app/TituloPagina.tsx`). `src/app/layout/menu.ts` exporta el arreglo de entradas `{ etiqueta, ruta, icono (lucide), grupo? }` usado por el menú lateral y la barra inferior, y por el test.

### 7.5 Layout (`src/app/layout/`)

- `Layout.tsx`: `<div class="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">` con `<MenuLateral>` (oculto bajo `lg`), `<main class="p-6 pb-24 lg:pb-6">` con `<Outlet/>`, y `<BarraInferior>` (solo bajo `lg`). `lg` de Tailwind = 1024 px (ADR 0011).
- `MenuLateral.tsx`: `<nav aria-label="Principal">` fijo, fondo `bg-tinta`, texto `text-fondo/80`; cabecera con el nombre **"Zydesk"** en `font-titulo` (tamaño `text-xl`, peso 700); botón "Nuevo ticket" (`<NavLink>` con `bg-acento text-white rounded-md`); luego "Mi día" y "Avisos"; luego grupos con encabezado en mayúsculas pequeñas (`text-xs uppercase tracking-wide text-fondo/50`): **Tickets** (Tablero, Tabla, Línea de tiempo), **Trabajo** (Órdenes de trabajo, Cotizador, Horas), **Administración** (Reportes, Clientes, Configuración); al pie, enlace a `/perfil` con `Avatar` de iniciales "UE" y texto "Usuario de ejemplo" (marcador; en Fase 1 será el usuario real). Ítem activo: `bg-white/10 text-fondo` (usar `NavLink` con `className` función). Íconos `lucide-react` (`Plus`, `Sun`, `Bell`, `Columns3`, `Table`, `GanttChart`, `Wrench`, `Calculator`, `Clock`, `BarChart3`, `Building2`, `Settings`, `User`), tamaño 18, `stroke-width 1.5`. Altura mínima de cada ítem 40 px.
- `BarraInferior.tsx`: `<nav aria-label="Principal (móvil)">` fija abajo, `bg-tinta`, 4 accesos según ADR 0011: **Mi día** (`/mi-dia`), **Tickets** (`/tickets`), **Avisos** (`/avisos`), **Nuevo** (`/tickets/nuevo`); ícono encima de etiqueta, cada acceso ≥ 44 px de alto. Las demás rutas siguen accesibles por URL (el menú completo móvil llega en Fase 8).

### 7.6 Datos: `src/lib/api.ts`, `proveedores.tsx`, página de salud

- `lib/api.ts`: `export async function obtener<T>(ruta: string): Promise<T>` → `fetch(ruta, { headers: { Accept: 'application/json' } })`; si `!res.ok` intenta leer `{ error }` del cuerpo y lanza `new ErrorApi(codigo, mensaje, status)`; si ok devuelve `res.json()`.
- `app/proveedores.tsx`: `QueryClientProvider` con `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } } })` (ADR 0011).
- `features/configuracion/pages/ConfiguracionPage.tsx` incluye, además del título, la tarjeta **"Estado del sistema"** (`features/salud/EstadoSistema.tsx`): `useQuery({ queryKey: ['salud'], queryFn: () => obtener<Salud>('/api/salud'), refetchInterval: 30_000 })`; muestra "Comprobando…" mientras carga, y luego `API: ok · Base de datos: ok · versión 0.1.0` con texto verde (`text-resuelto`) o, si `bd === 'error'` o la petición falla, "Sin conexión con la API / la base de datos" en `text-urgente`. Tipo `Salud = { estado: 'ok' | 'error'; version: string; bd: 'ok' | 'error' }` definido localmente en `features/salud/api.ts` (los esquemas compartidos llegan en Fase 1).

### 7.7 Tests de la web (jsdom + Testing Library)

`src/app/layout/MenuLateral.test.tsx`: renderiza `<MemoryRouter><MenuLateral/></MemoryRouter>` y afirma que aparecen los textos "Zydesk", "Nuevo ticket", "Mi día", "Avisos", "Tablero", "Tabla", "Línea de tiempo", "Órdenes de trabajo", "Cotizador", "Horas", "Reportes", "Clientes", "Configuración" y que `menu.ts` tiene 13 entradas con rutas únicas. `src/lib/utils.test.ts`: `cn('p-2', 'p-4') === 'p-4'`.

## 8. Documentación de la fase

- **`README.md`** (raíz): qué es Zydesk (2 líneas), requisitos (Node 22, npm 10, Docker), levantar en local en 5 pasos (`cp .env.example .env` / `copy` en Windows, `npm install`, `docker compose -f docker-compose.dev.yml up -d`, `npm run dev`, abrir `http://localhost:5173`), tabla de scripts raíz, estructura (resumen de §2), enlace a `docs/PLAN.md`, `docs/decisiones/README.md` y `docs/specs/`.
- **`CLAUDE.md`** (raíz), secciones: (1) Qué es y dónde está la verdad (`docs/PLAN.md`, ADRs, `docs/specs/fase-N.md`; ADR manda sobre PLAN). (2) Convenciones: español en dominio, rutas, nombres de archivos, mensajes de commit y logs; `snake_case` en JSON/BD, `camelCase` en TS; TS estricto, ESM, imports relativos con `.js` en `api` y `shared`; sin `any`; entidades TypeORM siempre con `type` explícito en `@Column` (tsx no emite metadatos de decoradores). (3) Tests obligatorios: cada tarea trae tests; `npm test` verde antes de terminar; API con Supertest sobre `crearApp()`; nada de mocks del ORM (Fase 1: Postgres real). (4) Regla de oro: **no tomar decisiones de diseño sin ADR**; si la spec de fase no lo cubre, detenerse y preguntar. (5) Logs (ADR 0017): siempre `logger` de `config/logger.ts`, nunca `console.*`; solo ids, nunca contenido de mensajes/notas/archivos ni secretos; mensajes en español y cortos. (6) Comandos: `npm run dev`, `npm test`, `npm run test -w @zydesk/api`, `npm run typecheck`, `npm run lint`, `npm run format`, `docker compose -f docker-compose.dev.yml up -d|down`. (7) Windows: sin `rm -rf` ni variables inline; usar `rimraf`/`cross-env`.
- **`docs/CHANGELOG.md`** (Keep a Changelog, ADR 0012): `## [Unreleased]` con `### Añadido` y una línea: "Fase 0: andamiaje del monorepo, API `/api/salud` con logs estructurados y `req_id`, web con layout y sistema visual."

## 9. Tareas (en orden; cada una termina con sus tests verdes y un commit)

| Tarea | Crea/edita | Criterio de aceptación |
|---|---|---|
| **F0-T1 Raíz del monorepo** | `package.json` raíz (§3.1, sin `postinstall` aún), `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.gitignore`, `.gitattributes`, `.nvmrc`, `git init`, y `package.json` mínimos de los tres workspaces (nombre, `private`, `type: module`, scripts `test` como `vitest run` con un test trivial `src/index.test.ts` en cada uno) | `npm install` sin errores ni `npm WARN` de peer deps; `npm run lint`, `npm run format:check` y `npm test` verdes (3 × 1 test). |
| **F0-T2 `packages/shared`** | §5 completo, `postinstall` en la raíz | `npm run build -w @zydesk/shared` genera `dist/index.js` y `dist/formato/index.d.ts`; `npm test -w @zydesk/shared` verde con los casos de §5; `npm run typecheck -w @zydesk/shared` verde. |
| **F0-T3 Postgres de desarrollo** | `docker-compose.dev.yml`, `.env.example`, `.env` local | `docker compose -f docker-compose.dev.yml up -d` deja el contenedor `healthy` (`docker compose -f docker-compose.dev.yml ps`); `docker compose -f docker-compose.dev.yml exec postgres psql -U zydesk -d zydesk -c "select 1"` devuelve `1`. |
| **F0-T4 Configuración de la API** | `apps/api` package/tsconfigs/vitest, `config/env.ts`, `version.ts`, `logger.ts`, `db.ts`, `core/http/contexto.ts` | Tests de §6.1 y §6.3 verdes (`npm test -w @zydesk/api`); `npm run typecheck -w @zydesk/api` verde. |
| **F0-T5 API HTTP** | `req-id.ts`, `log-http.ts`, `core/errores/*`, `modulos/salud/*`, `app.ts`, `server.ts` | Tests de §6.10 verdes. Con Postgres arriba: `npm run dev -w @zydesk/api` imprime en pino-pretty `api iniciada` con `puerto=3000`; `curl -i localhost:3000/api/salud` → `200`, cuerpo `{"estado":"ok","version":"0.1.0","bd":"ok"}`, cabecera `X-Request-Id` UUID; `curl -i -H "X-Request-Id: 123e4567-e89b-12d3-a456-426614174000" localhost:3000/api/salud` devuelve ese mismo id; con `NODE_ENV=production npm run start -w @zydesk/api` (tras `build`) cada línea de stdout es JSON con `req_id`; con Postgres detenido `/api/salud` → `503` y `bd:"error"`; `Ctrl+C` imprime `apagando api` y `api detenida` y sale con 0. |
| **F0-T6 Web base** | `apps/web` package/tsconfig/vite.config, `index.html` (`<title>Zydesk</title>`, `lang="es"`), `main.tsx`, `estilos/*`, `lib/utils.ts`, `components.json`, `lib/utils.test.ts` | `npm run dev -w @zydesk/web` sirve `http://localhost:5173` mostrando "Zydesk" en Bricolage Grotesque sobre fondo `#F3F1EC` (verificar en DevTools que las fuentes cargan desde `/node_modules/@fontsource/...` o el bundle, no desde Google); `npm run build -w @zydesk/web` genera `dist/`; test de `cn` verde. |
| **F0-T7 Layout y rutas** | `app/router.tsx`, `app/layout/*`, `app/TituloPagina.tsx`, `features/*/pages/*` | Test §7.7 verde; en el navegador cada entrada del menú navega a su ruta y muestra su `<h1>`; el ítem activo se resalta; `/` redirige a `/mi-dia`; a 1440 px se ve el menú lateral oscuro y a 800 px (DevTools) desaparece y aparece la barra inferior con 4 accesos; `/no-existe` muestra "Página no encontrada". |
| **F0-T8 Estado del sistema** | `app/proveedores.tsx`, `lib/api.ts`, `features/salud/*`, `ConfiguracionPage.tsx` | Con API y Postgres arriba, `/configuracion` muestra "API: ok · Base de datos: ok · versión 0.1.0"; con la API detenida muestra el mensaje de error en rojo; la pestaña Network muestra `/api/salud` proxyado (respuesta con `X-Request-Id`). |
| **F0-T9 Scripts raíz y documentación** | scripts `dev`/`typecheck`/`clean` finales (§3.1), `README.md`, `CLAUDE.md`, `docs/CHANGELOG.md`, commit inicial | Todos los criterios de §10 se cumplen desde un clon limpio (borrar `node_modules` y `dist` con `npm run clean` + `rimraf node_modules` antes de verificar). |

## 10. Criterios de aceptación de la fase (verificación final, en este orden)

```
copy .env.example .env                              (o cp en Git Bash)
npm install                                         → sin errores; crea packages/shared/dist
npm run typecheck                                   → 0 errores
npm run lint                                        → 0 errores, 0 warnings
npm run format:check                                → "All matched files use Prettier code style!"
npm test                                            → todos los tests verdes en shared, api y web
docker compose -f docker-compose.dev.yml up -d      → postgres healthy
npm run dev                                         → shared en watch, api "api iniciada", web en http://localhost:5173
curl -i localhost:3000/api/salud                    → 200, X-Request-Id: <uuid>, {"estado":"ok","version":"0.1.0","bd":"ok"}
curl -i localhost:5173/api/salud                    → misma respuesta a través del proxy de Vite
```
Además: (a) en la consola de `npm run dev` los logs de la API salen con pino-pretty y muestran `req_id`; ejecutando la API con `NODE_ENV=production` salen en JSON de una línea; (b) el test de `redact` (§6.3) demuestra que `password` aparece como `[Redactado]`; (c) en `http://localhost:5173` se ve el menú lateral oscuro con "Zydesk" en Bricolage Grotesque, ítems en IBM Plex Sans, botón "Nuevo ticket" en `#2F47C4`, fondo `#F3F1EC`; bajo 1024 px aparece la barra inferior; (d) `/configuracion` muestra el estado de `/api/salud`.

## 11. Decisiones fijadas en esta spec (para que nadie las reabra)

1. `shared` se compila a `dist/` y se consume como paquete; `postinstall` lo construye. Sin project references ni alias.
2. TypeORM `DataSource` configurado desde Fase 0 sin entidades; `/api/salud` hace `SELECT 1`.
3. `/api/salud` responde 503 `{estado:'error', bd:'error'}` si la BD no responde.
4. Tests de la API en Fase 0 no requieren Postgres (`comprobarBd` inyectada); los de integración llegan en Fase 1.
5. shadcn/ui: solo `components.json` + `cn`; ningún componente todavía; la CLI no se ejecuta.
6. Barra inferior móvil con exactamente 4 accesos (ADR 0011); el resto de rutas solo por URL hasta Fase 8.
7. La página de estado vive en `/configuracion` (tarjeta "Estado del sistema").
8. `entorno` en logs = valor de `NODE_ENV`; `version` = `apps/api/package.json`.
9. Tokens provisionales `--color-media-fondo`, `--color-media-punto`, `--color-baja-punto` (no están en la spec).
10. `err` en logs usa las claves estándar de pino (`type`, `message`, `stack`).
