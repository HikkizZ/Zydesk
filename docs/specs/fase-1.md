# Fase 1 — Base · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §4 Fase 1, ADR 0002, 0003, 0005, 0006, 0010, 0011, 0012, 0013, 0014, 0015, 0017; `preguntas-abiertas.md` A5, A6, B9, B10, B12; spec funcional §2, §4.8, §4.9, §6, §7; diseño "Ingresar a Trazo", "Clientes", "Configuración".
>
> Entorno: el mismo de la Fase 0 (Windows 11, Node 22, npm 10, Docker). Todo script npm funciona en Windows (`rimraf`, `cross-env`, sin `rm -rf` ni `FOO=bar cmd`). Puertos de desarrollo: API **3010**, Postgres **5433**, web 5173. Lo ya construido en la Fase 0 (`crearApp`, `reqId`, `contexto`, `logger`, `ErrorApp`, `manejadorErrores`, `lib/api.ts`, `Layout`, `menu.ts`, `tema.css`) **se reutiliza y se extiende**; no se reescribe.

## 0. Alcance

**Entra**: TypeORM con migraciones y roles de BD; tablas `evento`, `auditoria`, `contador`, `configuracion`, `usuario`, `sesion`, `departamento`, `horario_dia`, `feriado`, `cliente`, `contacto`, `contrato_bolsa`, `tarifa_cliente`, `categoria`; helpers `enTransaccion`, `registrarCambios`, `registrarEvento`, `registrarAuditoria`; autenticación completa (sesión opaca endurecida, argon2id, límites de intentos, cambio obligatorio, sesiones activas, CSRF); términos y privacidad; CRUD de usuarios, departamentos (horarios, feriados), clientes (contactos, bolsa, tarifas), categorías; numeración y marca; motor de horas hábiles con tests de tabla y `POST /api/plazos/calcular`; pg-boss con el job `mantencion.limpiar`; OpenAPI en `/api/docs` y `docs/api/openapi.json`; semillas de desarrollo; pantallas **0 Ingreso**, **11 Clientes**, **12 Configuración** (4 pestañas + Ingresos), **Perfil** (sesiones activas, cambiar contraseña), páginas públicas de términos y privacidad; manuales y CHANGELOG.

**No entra**: tickets, OT, cotizaciones, horas, avisos, archivos/`Storage`, tarifas globales y plantillas (Fase 4; las pestañas se muestran deshabilitadas, ver §12.4), bot, Playwright, Dockerfiles de producción, Cloudflare Access (Fase 9), contenido legal definitivo (pendiente E3).

## 1. Bloques y paralelismo

| Bloque | Contenido | Depende de | Archivos que toca (exclusivos) |
|---|---|---|---|
| **1A** BD y núcleo | roles de BD, migraciones, `evento`/`auditoria`/`contador`/`configuracion`, helpers, tests de integración, pg-boss | — | `apps/api/src/config/db.ts`, `database/**`, `core/historial/**`, `core/numeracion/**`, `core/http/{validar,ruta,paginacion}.ts`, `core/jobs/**`, `apps/api/test/**`, `docker/postgres-init/**`, `.env.example`, `docker-compose.dev.yml` |
| **1B** Auth y usuarios | `usuario`, `sesion`, ingreso, límites, `requiere()`, `/api/yo`, términos, CRUD usuarios, auditoría visible, OpenAPI | 1A | `core/auth/**`, `modulos/{usuarios,auth,legal,auditoria}/**`, `shared/src/{permisos,esquemas/{auth,usuario,legal,auditoria}}.ts`, `docs/legal/**`, `app.ts`, `server.ts` |
| **1C** Motor de horas | `shared/horas-habiles/**` con tests de tabla | — (puro) | `packages/shared/src/horas-habiles/**`, `packages/shared/src/enums/**` |
| **1D** Departamentos y categorías | `departamento`, `horario_dia`, `feriado`, `categoria`, `POST /api/plazos/calcular`, semilla de feriados | 1A, 1B (`requiere`), 1C | `modulos/{departamentos,categorias,plazos}/**`, `shared/src/esquemas/{departamento,categoria,plazos}.ts`, `database/semillas/feriados-cl.json` |
| **1E** Clientes y numeración | `cliente`, `contacto`, `contrato_bolsa`, `tarifa_cliente`, numeración y marca | 1A, 1B | `modulos/{clientes,configuracion}/**`, `shared/src/esquemas/{cliente,configuracion}.ts` |
| **1F** Web | shadcn, sesión en el front, guardas, pantallas 0/11/12/Perfil/legal | 1B–1E (API) | `apps/web/**` |
| **1G** Semillas y docs | semillas de desarrollo, manuales, CHANGELOG, `openapi.json` versionado | todo | `database/semillas/**`, `docs/manuales/**`, `docs/CHANGELOG.md`, `docs/api/**`, `README.md`, `CLAUDE.md` |

**En paralelo sin conflicto**: 1C con 1A; 1D con 1E (una vez cerrado 1B); dentro de 1F, cada pantalla es independiente una vez hecha F1-T17. Todo lo demás en el orden de §17.

## 2. Versiones nuevas (mayores fijados; última estable del mayor)

| Paquete | Mayor | Dónde |
|---|---|---|
| `argon2` | 0.41 o superior (binario precompilado para Windows/Linux x64) | api |
| `cookie-parser` (+ `@types/cookie-parser`) | última | api |
| `pg-boss` | 10 | api |
| `zod-openapi` | última compatible con Zod 4 | api |
| `@scalar/express-api-reference` | última | api |
| `commander` | 12 o superior | api (CLI) |
| `react-hook-form` 7 · `@hookform/resolvers` última | — | web |
| `react-markdown` 9 o superior | — | web (términos/privacidad) |
| shadcn/ui vía CLI `shadcn@latest` | — | web (ver §12.1) |
| `@radix-ui/*` los que traiga shadcn | — | web |

Si `zod-openapi` no soporta la versión instalada de Zod 4 o `argon2` no trae binario para la plataforma, **detente y pregunta**.

## 3. Base de datos (bloque 1A)

### 3.1 Roles y bases (ADR 0017)

`docker/postgres-init/01-roles.sql`, montado en `docker-compose.dev.yml` como `./docker/postgres-init:/docker-entrypoint-initdb.d:ro`. Postgres lo ejecuta **solo al crear el volumen**; el README indica `docker compose -f docker-compose.dev.yml down -v` para reiniciar. `POSTGRES_USER=zydesk` sigue siendo el superusuario del contenedor (solo desarrollo).

```sql
CREATE ROLE zydesk_owner LOGIN PASSWORD 'zydesk_owner';
CREATE ROLE zydesk_app   LOGIN PASSWORD 'zydesk_app';
-- base de desarrollo (POSTGRES_DB=zydesk ya existe) y base de test
CREATE DATABASE zydesk_test OWNER zydesk_owner;
ALTER DATABASE zydesk OWNER TO zydesk_owner;
\c zydesk
ALTER SCHEMA public OWNER TO zydesk_owner;
GRANT USAGE ON SCHEMA public TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO zydesk_app;
\c zydesk_test
-- mismas cuatro sentencias
```

Las contraseñas de los roles en desarrollo son literales (`zydesk_owner` / `zydesk_app`); en producción (Fase 9) las fija `despliegue.md`. pg-boss usa su esquema `pgboss`: la migración `…-pgboss-esquema` (ver 3.3) crea `CREATE SCHEMA pgboss AUTHORIZATION zydesk_app` para que pg-boss (que corre como `zydesk_app`) pueda crear sus tablas; es la única excepción al "owner crea todo".

### 3.2 Variables de entorno nuevas (`.env.example`)

```dotenv
# Conexiones: la app usa zydesk_app; las migraciones, zydesk_owner
DATABASE_URL=postgres://zydesk_app:zydesk_app@localhost:5433/zydesk
DATABASE_URL_OWNER=postgres://zydesk_owner:zydesk_owner@localhost:5433/zydesk
TEST_DATABASE_URL=postgres://zydesk_app:zydesk_app@localhost:5433/zydesk_test
TEST_DATABASE_URL_OWNER=postgres://zydesk_owner:zydesk_owner@localhost:5433/zydesk_test

# Sesiones y proxy (ADR 0013)
PROXY_SALTOS=0
# Jobs pg-boss en este proceso (ADR 0008)
EJECUTAR_JOBS=true

# Contraseña del primer usuario Administración (solo la lee `npm run db:admin`)
ADMIN_PASSWORD=
# Contraseña común de las semillas de desarrollo (solo la lee `npm run db:sembrar`)
SEMILLA_PASSWORD=
```

`config/env.ts` añade: `DATABASE_URL_OWNER: z.string().url().optional()`, `TEST_DATABASE_URL`, `TEST_DATABASE_URL_OWNER` (opcionales), `PROXY_SALTOS: z.coerce.number().int().min(0).default(0)`, `EJECUTAR_JOBS: z.preprocess('' → undefined, z.enum(['true','false']).default('true')).transform(v => v === 'true')`, `ADMIN_PASSWORD` y `SEMILLA_PASSWORD` como `z.string().optional()` (vacío → undefined). Con `NODE_ENV=test`, `db.ts` usa `TEST_DATABASE_URL` (obligatoria en test; si falta, `cargarEnv` lanza).

### 3.3 TypeORM y migraciones

- `config/db.ts`: `dataSource` (rol app) con `entities: [ruta glob a 'modulos/**/*.entity.js' y 'core/**/*.entity.js' resuelta desde import.meta.url, funciona en src y dist]`, `migrations: []`, `synchronize: false`. Nuevo `database/data-source-owner.ts` exporta `dataSourceOwner` con `DATABASE_URL_OWNER` (o `TEST_DATABASE_URL_OWNER` en test), mismas entidades y `migrations: [glob 'database/migraciones/*.js']`, `migrationsTableName: 'migracion'`. **Solo** este DataSource ejecuta migraciones.
- Migraciones en `apps/api/src/database/migraciones/<timestamp>-<nombre>.ts`, escritas **a mano en SQL** (`queryRunner.query`), no generadas. Lista y orden:
  1. `…-base`: extensión `citext`; `configuracion`, `contador`, `evento`, `auditoria` (+ índices), `limpiar_auditoria()`, `REVOKE UPDATE, DELETE ON evento, auditoria FROM zydesk_app`.
  2. `…-pgboss-esquema`: `CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION zydesk_app`.
  3. `…-departamentos`: `departamento`, `horario_dia`, `feriado`.
  4. `…-usuarios`: `usuario`, `sesion`.
  5. `…-clientes`: `cliente`, `contacto`, `contrato_bolsa`, `tarifa_cliente`.
  6. `…-categorias`: `categoria`.
  Cada `down` revierte en orden inverso. Ninguna migración inserta datos (ver 3.6).
- Scripts en `apps/api/package.json` (todos `cross-env TZ=UTC tsx src/database/cli.ts <cmd>`): `db:migrar`, `db:revertir`, `db:sembrar`, `db:admin`, `db:reiniciar` (= revertir todo + migrar + sembrar, solo `NODE_ENV≠production`). Raíz: `"db:migrar": "npm run db:migrar -w @zydesk/api"` y lo mismo para `db:sembrar`, `db:admin`, `db:reiniciar`, más `"api:openapi": "npm run openapi -w @zydesk/api"`.
- `database/cli.ts` con `commander`: subcomandos `migrar`, `revertir [--todo]`, `sembrar`, `admin --correo <correo> --nombre <nombre>` (lee `ADMIN_PASSWORD`; si falta o no cumple la política de §5.6 termina con código 1 y mensaje `ADMIN_PASSWORD no definida o inválida`; si el correo ya existe, termina con 1 `El usuario ya existe`), `reiniciar`. Todos abren `dataSourceOwner` para migrar y `dataSource` (app) para sembrar/admin, y registran con `logger` (nunca imprimen contraseñas).

### 3.4 Tablas del núcleo

Convenciones: `id` = `integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY` salvo indicación; `creado_en timestamptz NOT NULL DEFAULT now()`; `actualizado_en timestamptz NOT NULL DEFAULT now()` actualizado por el servicio (no trigger); texto `text` (sin `varchar(n)`; la longitud la valida Zod); correos `citext`. Entidades TypeORM con `@Column({ type: '...' })` explícito siempre (CLAUDE.md).

```sql
configuracion (
  clave text PRIMARY KEY,                     -- 'nombre_app' | 'logo'
  valor jsonb NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
)
contador (                                    -- ADR 0014
  clave text PRIMARY KEY CHECK (clave IN ('ticket','ot')),
  prefijo text NOT NULL,
  inicial integer NOT NULL CHECK (inicial >= 0),
  digitos integer NOT NULL CHECK (digitos BETWEEN 3 AND 8),
  modo text NOT NULL CHECK (modo IN ('correlativo','aleatorio')),
  valor integer NOT NULL,                     -- último emitido en modo correlativo
  actualizado_en timestamptz NOT NULL DEFAULT now()
)
evento (                                      -- ADR 0003 + 0017
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidad text NOT NULL,                      -- 'contador' en Fase 1; 'ticket','ot',… después
  entidad_id text NOT NULL,                   -- text: contador usa su clave; el resto, el id numérico como texto
  autor_id integer NULL,                      -- FK usuario (se agrega en la migración 4 con ALTER TABLE)
  accion text NOT NULL,
  campo text NULL, valor_anterior text NULL, valor_nuevo text NULL,
  datos jsonb NULL,
  req_id uuid NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
)  -- índices: (entidad, entidad_id, creado_en), (autor_id, creado_en)
auditoria (                                   -- ADR 0017 §2
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id uuid NULL,
  usuario_id integer NULL,                    -- FK usuario (migración 4)
  ip inet NULL,
  accion text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}',
  creado_en timestamptz NOT NULL DEFAULT now()
)  -- índices: (creado_en), (usuario_id, creado_en), (accion, creado_en), (ip, creado_en), ((detalle->>'correo'), creado_en)
```

```sql
CREATE FUNCTION limpiar_auditoria() RETURNS void LANGUAGE sql SECURITY DEFINER
  SET search_path = public AS $$ DELETE FROM auditoria WHERE creado_en < now() - interval '1 year' $$;
ALTER FUNCTION limpiar_auditoria() OWNER TO zydesk_owner;
REVOKE ALL ON FUNCTION limpiar_auditoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION limpiar_auditoria() TO zydesk_app;
REVOKE UPDATE, DELETE ON evento, auditoria FROM zydesk_app;
```

Las FK de `evento.autor_id` y `auditoria.usuario_id` a `usuario` son `ON DELETE SET NULL`; los usuarios nunca se borran (se desactivan), la FK solo protege la integridad.

### 3.5 Helpers (`core/historial/`)

```ts
// core/historial/transaccion.ts
export function enTransaccion<T>(fn: (tx: EntityManager) => Promise<T>): Promise<T>  // dataSource.transaction(fn); aislamiento por defecto (READ COMMITTED)

// core/historial/evento.ts
export interface Actor { id: number | null }   // null = sistema (CLI, jobs)
export async function registrarEvento(tx: EntityManager, e: { entidad: string; entidad_id: string | number; actor: Actor; accion: string; campo?: string; valor_anterior?: string | null; valor_nuevo?: string | null; datos?: unknown }): Promise<void>
  // toma req_id de contexto.getStore()?.req_id (o null); INSERT en evento con tx
export async function registrarCambios(tx: EntityManager, c: { entidad: string; entidad_id: string | number; actor: Actor; antes: Record<string, unknown>; despues: Record<string, unknown>; campos: string[]; etiquetas?: Record<string, (v: unknown) => string> }): Promise<number>
  // por cada campo de `campos` con antes[campo] !== despues[campo] (comparación: arrays como conjuntos ordenados, Date por getTime, resto ===): registrarEvento(accion:'cambio', campo, valor_anterior, valor_nuevo) usando etiquetas[campo] ?? String(v) (null → null). Devuelve cuántos eventos insertó.

// core/historial/auditoria.ts  (ADR 0017)
export type AccionAuditoria = 'ingreso_ok' | 'ingreso_fallido' | 'cierre_sesion' | 'sesion_cerrada' | 'cuenta_bloqueada' | 'contrasena_cambiada' | 'contrasena_restablecida' | 'usuario_creado' | 'usuario_desactivado' | 'usuario_reactivado' | 'rol_cambiado' | 'config_cambiada' | 'numeracion_cambiada' | 'terminos_aceptados' | 'exportacion' | 'descarga_archivo';
export async function registrarAuditoria(tx: EntityManager | null, a: { accion: AccionAuditoria; usuario_id?: number | null; detalle?: Record<string, unknown> }): Promise<void>
  // req_id e ip desde contexto (ver 5.1: ContextoPeticion gana `ip`); tx ?? dataSource.manager
```

`usuario_reactivado` y `terminos_aceptados` no están en ADR 0017: se agregan aquí (ver §15). `detalle` nunca lleva contraseñas ni contenido; solo ids, correo, user_agent y valores de configuración.

### 3.6 Semilla base (idempotente) y semillas de desarrollo

- `database/semillas/base.ts` → `sembrarBase(manager)`: `INSERT … ON CONFLICT DO NOTHING` de `configuracion` (`nombre_app: "Zydesk"`, `logo: null`), `contador` (`ticket`: `TK-`, 1000, 4, correlativo, valor 999; `ot`: `OT-`, 200, 4, correlativo, valor 199) y feriados de `feriados-cl.json` con `departamento_id NULL` (ON CONFLICT por `(fecha, departamento_id)`). Se ejecuta en `server.ts` tras `dataSource.initialize()` (ADR 0005: "cargada al iniciar si no existen") y en el helper de tests. No se ejecuta como `zydesk_owner`.
- `database/semillas/desarrollo.ts` → `sembrarDesarrollo(manager, contrasena)`: datos ficticios del diseño (§13). Rechaza correr con `NODE_ENV=production`. Exige `SEMILLA_PASSWORD` válida según §5.6; si falta, termina con código 1.

### 3.7 Tests de integración (`apps/api/test/`)

- `test/bd.ts`: `export async function prepararBd()`: abre `dataSourceOwner` (test), `runMigrations()`, cierra; abre `dataSource` (test). `export async function reiniciarBd()`: `TRUNCATE <todas las tablas de public salvo migracion> RESTART IDENTITY CASCADE` ejecutado con el **owner** (la app no puede borrar `evento`/`auditoria`), luego `sembrarBase(dataSource.manager)`. `export async function cerrarBd()`.
- `test/setup-global.ts` (vitest `globalSetup`): `prepararBd()` una vez y `cerrarBd()` al final. `test/setup.ts` (`setupFiles`): `beforeEach(reiniciarBd)`. `vitest.config.ts`: `{ test: { include: ['src/**/*.test.ts'], environment: 'node', globalSetup: ['test/setup-global.ts'], setupFiles: ['test/setup.ts'], fileParallelism: false, testTimeout: 15_000 } }`. `fileParallelism: false` porque todos los archivos comparten la misma BD.
- Los tests de la Fase 0 sin BD (`env.test.ts`, `logger.test.ts`, `salud.test.ts`) siguen funcionando: `setup.ts` solo reinicia si el DataSource está inicializado.
- `test/fabricas.ts`: `crearUsuario({ rol, ... })` (contraseña por defecto `'Contrasena.Prueba.1'`), `crearDepartamento()`, `crearCliente()`, `crearCategoria()`, `ingresarComo(app, usuario)` → devuelve `{ cookie, csrf }` para Supertest (`agent` con la cookie y la cabecera `X-Requested-With: Zydesk`).
- Test obligatorio `database/permisos-bd.test.ts` (ADR 0017): con `dataSource` (app) `UPDATE evento SET accion='x'` y `DELETE FROM auditoria` fallan con error cuyo `code === '42501'` (permission denied); `SELECT limpiar_auditoria()` funciona y borra una fila insertada con `creado_en = now() - interval '2 years'` (insertada con el owner).

### 3.8 pg-boss (decisión: entra en Fase 1)

Entra ahora, mínimo: ADR 0017 lo exige en Fase 1 para `mantencion.limpiar` y es más barato montar la infraestructura una vez que simular la limpieza con `setInterval` y rehacerla en Fase 2. `core/jobs/boss.ts`: `crearBoss()` → `new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })`; `iniciarJobs(boss)` registra `boss.work('mantencion.limpiar', handler)` y `boss.schedule('mantencion.limpiar', '0 3 * * *', {}, { tz: 'America/Santiago' })`. Handler (`core/jobs/mantencion.ts`, exportado para test): `SELECT limpiar_auditoria()`; `DELETE FROM sesion WHERE expira_en < now() OR expira_max_en < now()`; log `info` con `job`, `job_id`, `duracion_ms`, `sesiones_borradas`. `server.ts`: si `env.EJECUTAR_JOBS` → `await boss.start(); iniciarJobs(boss)`; en el apagado `await boss.stop({ graceful: true })`. Test: `mantencion.test.ts` llama al handler directamente y verifica que borra sesiones vencidas y respeta las vigentes. No se testea el cron.

### 3.9 HTTP: validación, `ruta()` y paginación (`core/http/`)

```ts
// validar.ts
export function validar<P, Q, B>(esq: { params?: ZodType<P>; query?: ZodType<Q>; body?: ZodType<B> }): RequestHandler
  // parsea; error → ErrorApp('VALIDACION', 'Datos inválidos', detalles) con detalles = z.flattenError(err).fieldErrors (Zod 4); guarda en res.locals.datos = { params, query, body }

// ruta.ts  (ADR 0010: única forma de declarar rutas)
export interface DefRuta<P,Q,B,R> { metodo: 'get'|'post'|'put'|'patch'|'delete'; path: string; resumen: string; etiqueta: string; permiso?: Permiso | 'sesion' | 'publico'; params?: ZodType<P>; query?: ZodType<Q>; body?: ZodType<B>; respuesta: ZodType<R>; status?: number; handler: (ctx: { params: P; query: Q; body: B; actor: UsuarioSesion | null; req: Request; res: Response }) => Promise<R> }
export function ruta(router: Router, def: DefRuta): void
  // encadena: [csrf si metodo ≠ get] → autenticar (siempre; carga sesión si hay cookie) → requiere(permiso) (si permiso ≠ 'publico'; 'sesion' = cualquier usuario autenticado) → validar → handler → res.status(def.status ?? 200).json(resultado)
  // y registra la operación en el registro OpenAPI (ver §11)

// paginacion.ts
export const esquemaPaginacion = z.object({ pagina: z.coerce.number().int().min(1).default(1), por_pagina: z.coerce.number().int().min(1).max(200).default(50) });
export function paginar<T>(datos: T[], total: number, q: { pagina: number; por_pagina: number }): { datos: T[]; total: number; pagina: number; por_pagina: number }
```

Los handlers devuelven el objeto ya validado por `respuesta` (`respuesta.parse(resultado)` en desarrollo y test; en producción no se re-parsea). Rutas de la Fase 0 (`/api/salud`) se migran al helper con `permiso: 'publico'`.

## 4. `packages/shared`: enums, permisos y esquemas

### 4.1 `enums/`

```ts
// enums/rol.ts
export const ROLES = ['admin', 'coordinacion', 'tecnico', 'lectura'] as const;  export type Rol = (typeof ROLES)[number];
export const ETIQUETA_ROL: Record<Rol, string> = { admin: 'Administración', coordinacion: 'Coordinación', tecnico: 'Técnico', lectura: 'Solo lectura' };
// enums/prioridad.ts
export const PRIORIDADES = ['urgente', 'alta', 'media', 'baja'] as const;  export type Prioridad = …;  ETIQUETA_PRIORIDAD
// enums/plazo.ts
export const UNIDADES_PLAZO = ['horas', 'dias'] as const;
// enums/tarifa.ts
export const CONCEPTOS_TARIFA = ['hora_normal', 'hora_extendida', 'hora_urgencia', 'traslado_km'] as const;
export const ETIQUETA_CONCEPTO_TARIFA = { hora_normal: 'Hora normal', hora_extendida: 'Hora horario extendido', hora_urgencia: 'Hora fin de semana / urgencia', traslado_km: 'Traslado por km' };
// enums/origen-sesion.ts
export const ORIGENES_SESION = ['web', 'bot'] as const;
```

`enums/index.ts` reexporta todo; `shared/src/index.ts` exporta además `enums`, `esquemas` y `horas-habiles`; `package.json` de shared agrega `"./esquemas"` y `"./horas-habiles"` a `exports` con el mismo patrón que `./formato`.

### 4.2 `permisos.ts` (ADR 0002, copia literal)

```ts
export const PERMISOS = ['tickets.editar', 'ots.aprobar', 'ots.cerrar', 'ots.facturar', 'reportes.ver', 'config.editar'] as const;
export type Permiso = (typeof PERMISOS)[number];
export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  admin: [...PERMISOS],
  coordinacion: ['tickets.editar', 'ots.aprobar', 'ots.cerrar', 'ots.facturar', 'reportes.ver'],
  tecnico: ['tickets.editar'],
  lectura: ['reportes.ver'],
};
export function tienePermiso(rol: Rol, permiso: Permiso): boolean
// Filas de la matriz visible en Configuración (spec §2, 9 acciones). Las 4 primeras mapean a tickets.editar.
export const MATRIZ_VISIBLE: ReadonlyArray<{ etiqueta: string; permiso: Permiso }> = [
  { etiqueta: 'Crear y editar tickets', permiso: 'tickets.editar' },
  { etiqueta: 'Registrar seguimiento y notas', permiso: 'tickets.editar' },
  { etiqueta: 'Asignar responsables', permiso: 'tickets.editar' },
  { etiqueta: 'Convertir ticket en OT', permiso: 'tickets.editar' },
  { etiqueta: 'Aprobar cotizaciones y OT internas', permiso: 'ots.aprobar' },
  { etiqueta: 'Cerrar OT', permiso: 'ots.cerrar' },
  { etiqueta: 'Marcar OT como facturada', permiso: 'ots.facturar' },
  { etiqueta: 'Ver reportes y montos', permiso: 'reportes.ver' },
  { etiqueta: 'Cambiar configuración', permiso: 'config.editar' },
];
```

Test `permisos.test.ts`: `tecnico` no tiene `config.editar`; `lectura` solo `reportes.ver`; `admin` todos; `MATRIZ_VISIBLE` tiene 9 filas y reproduce exactamente la tabla de la spec §2 al evaluarla con `tienePermiso` para los 4 roles.

### 4.3 `esquemas/` (Zod 4; entrada y salida de cada endpoint)

Piezas comunes en `esquemas/comunes.ts`: `id = z.number().int().positive()`; `texto(n) = z.string().trim().min(1).max(n)`; `correo = z.string().trim().toLowerCase().email().max(200)`; `hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)`; `fechaIso = z.string().date()` (AAAA-MM-DD); `instante = z.string().datetime({ offset: true })`; `color = z.string().regex(/^#[0-9a-f]{6}$/i)`. Los esquemas de salida (`…Salida`) incluyen `id`, `creado_en`, `actualizado_en` en ISO cuando la tabla los tiene. Un archivo por recurso; cada uno exporta también sus tipos `z.infer`.

```ts
// esquemas/auth.ts
contrasena = z.string().min(10).max(200)   // + refinamiento politicaContrasena(contrasena, correo) (§5.6)
IngresoEntrada = { correo, contrasena: z.string().min(1).max(200), mantener: z.boolean().default(false) }
CambiarContrasenaEntrada = { actual: z.string().min(1), nueva: contrasena }   // refinamiento: nueva ≠ actual
YoSalida = { id, nombre, correo, rol, departamento: { id, nombre } | null, color_avatar, iniciales, permisos: Permiso[],
             debe_cambiar_contrasena, debe_aceptar_terminos: boolean, terminos_version_vigente: string,
             nombre_app: string, logo_url: string | null }
SesionSalida = { id: uuid, origen, ip: string|null, user_agent: string|null, creada_en, ultimo_uso, expira_en, mantener: boolean, actual: boolean }

// esquemas/usuario.ts
UsuarioSalida = { id, nombre, correo, rol, departamento_id: id|null, departamento: {id,nombre}|null, activo, color_avatar, iniciales,
                  debe_cambiar_contrasena, ultimo_ingreso: instante|null, creado_en, actualizado_en }
UsuarioCrearEntrada = { nombre: texto(120), correo, rol, departamento_id: id.nullable(), color_avatar: color.optional(), contrasena_temporal: contrasena }
UsuarioEditarEntrada = UsuarioCrearEntrada.omit({ contrasena_temporal: true }).partial()
UsuariosQuery = { activo: z.enum(['true','false']).optional(), rol: z.enum(ROLES).optional(), q: texto(80).optional() }   // sin paginar (≤ 50 personas)
RestablecerSalida = { contrasena_temporal: string }

// esquemas/legal.ts
DocumentoLegalSalida = { clave: 'terminos'|'privacidad', version: string, titulo: string, contenido_md: string, borrador: boolean }
AceptarTerminosEntrada = { version: z.string().min(1) }

// esquemas/auditoria.ts
ACCIONES_AUDITORIA (const array igual a AccionAuditoria de §3.5)
AuditoriaQuery = esquemaPaginacion.extend({ accion: z.enum(ACCIONES_AUDITORIA).optional(), usuario_id: id.optional(), correo: texto(200).optional(), desde: instante.optional(), hasta: instante.optional() })
AuditoriaSalida = { id, creado_en, accion, usuario: {id,nombre}|null, ip: string|null, req_id: string|null, detalle: Record<string, unknown> }

// esquemas/departamento.ts
HorarioDia = { dia_semana: z.number().int().min(0).max(6), activo: boolean, entrada: hora, salida: hora, colacion_inicio: hora, colacion_min: z.number().int().min(0).max(240) }
   // refinamiento (solo si activo): entrada < colacion_inicio y colacion_inicio + colacion_min ≤ salida, en minutos; con colacion_min = 0 basta entrada < salida
DepartamentoEntrada = { nombre: texto(80), hora_extendida_desde: hora, capacidad_tickets_pct: z.number().int().min(0).max(100), horario: z.array(HorarioDia).length(7) }  // dia_semana 0..6, sin repetir
DepartamentoSalida = DepartamentoEntrada & { id, jornada_semanal_horas: number (1 decimal), personas: number, creado_en, actualizado_en }
FeriadoEntrada = { fecha: fechaIso, nombre: texto(80), departamento_id: id.nullable().default(null) }
FeriadoSalida = FeriadoEntrada & { id }
FeriadosQuery = { anio: z.coerce.number().int().min(2000).max(2100).optional(), departamento_id: id.optional() }

// esquemas/categoria.ts
Plazo = { valor: z.number().int().min(1).max(999), unidad: z.enum(UNIDADES_PLAZO) }
CategoriaEntrada = { nombre: texto(80), responsable_defecto_id: id.nullable(), plazo_respuesta: Plazo, plazo_resolucion: { urgente: Plazo, alta: Plazo, media: Plazo, baja: Plazo } }
CategoriaSalida = CategoriaEntrada & { id, responsable_defecto: {id,nombre}|null, activo, creado_en, actualizado_en }

// esquemas/plazos.ts
CalcularPlazoEntrada = { desde: instante, plazo: Plazo, departamento_id: id }
CalcularPlazoSalida = { hasta: instante, horas_habiles: number }

// esquemas/cliente.ts
rut = z.string().trim().max(20).transform(normalizarRut).refine(rutValido)   // acepta "76.123.456-K" o "76123456-k"; normaliza a "76123456-K"; valida dígito verificador (módulo 11)
ClienteEntrada = { nombre: texto(120), rut: rut.nullable(), direccion: texto(300).nullable(), es_interno: boolean, condicion_pago: texto(80).nullable(), exige_oc: boolean, notas: texto(2000).nullable() }
ClienteResumen = { id, nombre, es_interno, activo, tiene_bolsa: boolean }
ClienteSalida = ClienteEntrada & { id, activo, contactos: ContactoSalida[], bolsa: { vigente: ContratoBolsaSalida|null, historial: ContratoBolsaSalida[] }, tarifas: TarifaClienteSalida[], creado_en, actualizado_en }
ContactoEntrada = { nombre: texto(120), area: texto(80).nullable(), correo: correo.nullable(), telefono: texto(40).nullable(), aprueba_cotizaciones: boolean }
ContactoSalida = ContactoEntrada & { id, cliente_id, activo }
ContratoBolsaEntrada = { horas_mes: z.number().min(0.5).max(999).multipleOf(0.5), vigente_desde: fechaIso, vigente_hasta: fechaIso.nullable(), fecha_renovacion: fechaIso.nullable(), notas: texto(500).nullable() }
   // refinamiento: vigente_hasta ≥ vigente_desde
ContratoBolsaSalida = ContratoBolsaEntrada & { id, cliente_id, vigente: boolean, horas_usadas_mes: null }   // null en Fase 1 (sin OT); Fase 5 lo calcula (ADR 0015)
TarifaClienteEntrada = z.array({ concepto: z.enum(CONCEPTOS_TARIFA), valor: z.number().min(0).max(99_999_999) })   // reemplaza el conjunto completo; conceptos sin repetir
TarifaClienteSalida = { concepto, valor }
ClientesQuery = { q: texto(80).optional(), activo: z.enum(['true','false']).optional() }

// esquemas/configuracion.ts
MarcaEntrada = { nombre_app: texto(40) }
MarcaSalida = { nombre_app: string, logo_url: string|null }
LogoEntrada = { tipo_mime: z.enum(['image/png','image/jpeg','image/svg+xml']), base64: z.string().max(280_000) }   // ≈ 200 KB
NumeracionTipo = { prefijo: z.string().trim().max(10), inicial: z.number().int().min(0).max(99_999_999), digitos: z.number().int().min(3).max(8), modo: z.enum(['correlativo','aleatorio']) }
NumeracionEntrada = { ticket: NumeracionTipo, ot: NumeracionTipo.omit({ modo: true }) }
NumeracionSalida = { ticket: NumeracionTipo & { ultimo_usado: number|null, usados: number, capacidad: number, advertencia: boolean }, ot: (lo mismo, con modo fijo 'correlativo') }
```

## 5. Autenticación (bloque 1B)

### 5.1 Tablas

```sql
usuario (
  id identity PK,
  nombre text NOT NULL, correo citext NOT NULL UNIQUE,
  contrasena_hash text NOT NULL,                       -- argon2id
  rol text NOT NULL CHECK (rol IN ('admin','coordinacion','tecnico','lectura')),
  departamento_id integer NULL REFERENCES departamento(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  color_avatar text NOT NULL,                          -- '#rrggbb'
  debe_cambiar_contrasena boolean NOT NULL DEFAULT false,
  terminos_version text NULL, terminos_aceptados_en timestamptz NULL,
  ultimo_ingreso timestamptz NULL,
  creado_en, actualizado_en
)
sesion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,                     -- sha256 hex del token
  usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('web','bot')),
  mantener boolean NOT NULL DEFAULT false,
  ip inet NULL, user_agent text NULL,                  -- user_agent recortado a 300 caracteres
  creada_en timestamptz NOT NULL DEFAULT now(),
  ultimo_uso timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,                      -- inactividad (deslizante)
  expira_max_en timestamptz NOT NULL                   -- absoluta
)  -- índices: (usuario_id), (expira_en)
```

`ContextoPeticion` (Fase 0) gana `ip?: string` y `sesion_id?: string`. `reqId()` pasa a llamar `contexto.run({ req_id: id, ip: ipReal(req) }, next)`; el middleware `autenticar` completa el store con `Object.assign(contexto.getStore()!, { usuario_id, sesion_id })`.

### 5.2 IP real y proxy (ADR 0013)

`app.set('trust proxy', env.PROXY_SALTOS)`. `core/auth/ip.ts` → `ipReal(req)`: `req.header('cf-connecting-ip')` si `PROXY_SALTOS > 0` y la cabecera existe; si no, `req.ip`.

### 5.3 Cookie y token

- Token: `randomBytes(32).toString('base64url')`; en BD `createHash('sha256').update(token).digest('hex')`.
- Nombre de cookie: `__Host-sesion` cuando `NODE_ENV === 'production'`; `sesion` en `development` y `test` (el prefijo `__Host-` exige `Secure`, imposible en `http://localhost`). Constante `NOMBRE_COOKIE` en `core/auth/cookie.ts`. Atributos: `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure: NODE_ENV === 'production'`, sin `domain`; `maxAge` solo con `mantener` (= `expira_max_en − now`); sin `mantener` es cookie de sesión del navegador.
- Duraciones (ADR 0013): inactividad 12 h, con `mantener` 30 días; absoluta 7 días, con `mantener` 90 días. `expira_en` se desliza en cada petición autenticada, pero se **escribe** en BD solo si `ultimo_uso` tiene más de 5 min (evita un UPDATE por petición); `expira_en = min(now + inactividad, expira_max_en)`.

### 5.4 Middlewares (`core/auth/`)

- `autenticar` (`autenticar.ts`): lee la cookie (`cookie-parser`) o, si no hay cookie, `Authorization: Bearer <token>` (bot, Fase 6: la vía queda lista). Busca por `token_hash`, exige `expira_en > now`, `expira_max_en > now` y `usuario.activo`; si la sesión está vencida la borra; en cualquier fallo sigue con `res.locals.actor = null`. Si vale: `res.locals.actor = UsuarioSesion { id, nombre, correo, rol, permisos, debe_cambiar_contrasena, debe_aceptar_terminos, sesion_id, origen, autenticado_por: 'cookie'|'bearer' }`, actualiza el contexto y desliza la expiración.
- `requiere(permiso: Permiso | 'sesion')` (`requiere.ts`): sin actor → 401 `NO_AUTENTICADO` ("Inicia sesión"). Con actor y `debe_cambiar_contrasena` → 403 `CONTRASENA_PENDIENTE` salvo en la lista blanca; con `debe_aceptar_terminos` → 403 `TERMINOS_PENDIENTES` salvo lista blanca. Lista blanca (`req.method` + `req.path` bajo `/api`): `GET /yo`, `POST /auth/salir`, `POST /yo/cambiar-contrasena`, `POST /yo/aceptar-terminos`, `GET /legal/*`, `GET /yo/sesiones`, `DELETE /yo/sesiones`, `DELETE /yo/sesiones/:id`. Luego, si `permiso !== 'sesion'` y `!actor.permisos.includes(permiso)` → 403 `SIN_PERMISO` ("No tienes permiso para esta acción"). Orden: contraseña antes que términos.
- `csrf` (`csrf.ts`): para `POST/PUT/PATCH/DELETE` bajo `/api`, exige cabecera `X-Requested-With` con valor exacto `Zydesk`; si falta → 403 `CSRF` ("Petición rechazada"). Se salta cuando la autenticación fue por `Bearer`. Se registra en `app.ts` como middleware global después de `express.json` y antes de las rutas.
- Códigos nuevos en `shared/errores.ts` (mismo objeto `CODIGOS_ERROR`): `CSRF: 403`, `INGRESO_BLOQUEADO: 429`, `CONTRASENA_PENDIENTE: 403`, `TERMINOS_PENDIENTES: 403`, `CREDENCIALES_INVALIDAS: 401`, `CONTRASENA_ACTUAL_INCORRECTA: 400`, `CONTRASENA_DEBIL: 400`, `NUMERACION_INICIAL_MENOR: 400`, `NUMERACION_DIGITOS_INSUFICIENTES: 400`. `ErrorApp` y el manejador de la Fase 0 no cambian.

### 5.5 Límites de intentos (ADR 0013 + 0017) — `core/auth/limites.ts`

Consulta `auditoria`; no se instala `express-rate-limit` (ver §15).

```ts
export async function comprobarLimites(correo: string, ip: string): Promise<void>
  // lanza ErrorApp('INGRESO_BLOQUEADO', 'Demasiados intentos. Vuelve a intentarlo más tarde.', { reintentar_en: ISO })
export async function registrarFallo(correo: string, userAgent: string | null): Promise<void>
  // inserta ingreso_fallido y, si con él se llega a 5 fallos seguidos, cuenta_bloqueada
```
- Por IP: `COUNT(*) FROM auditoria WHERE ip = $ip AND accion IN ('ingreso_ok','ingreso_fallido') AND creado_en > now() - interval '15 minutes'` ≥ 20 → bloqueada; `reintentar_en` = `creado_en` más antiguo de esa ventana + 15 min.
- Por cuenta: fallos seguidos = `ingreso_fallido` con `detalle->>'correo' = $correo` posteriores al último `ingreso_ok` de ese correo. Al llegar a 5 (y a cada múltiplo de 5) se inserta `cuenta_bloqueada` con `detalle: { correo, bloqueo_n, hasta }`, donde `bloqueo_n` = cantidad de `cuenta_bloqueada` del correo desde el último `ingreso_ok` + 1 y `hasta = now + min(15 min × 2^(bloqueo_n − 1), 24 h)`. La cuenta está bloqueada si existe un `cuenta_bloqueada` del correo, posterior al último `ingreso_ok`, con `detalle->>'hasta' > now()`. Mientras dura el bloqueo no se verifica la contraseña ni se registra otro `ingreso_fallido`.
- La respuesta 429 es idéntica exista o no la cuenta.

### 5.6 Contraseñas — `core/auth/contrasena.ts` + `shared/esquemas/auth.ts`

- `hashear(texto)` → `argon2.hash(texto, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })`; `verificar(hash, texto)`. `HASH_FICTICIO` = hash precalculado de una cadena aleatoria, para verificar contra él cuando el correo no existe (tiempo constante).
- Política (`politicaContrasena(contrasena, correo)` en `shared`, usada por Zod en API y web): ≥ 10 y ≤ 200 caracteres, distinta del correo y de su parte local (insensible a mayúsculas), y no incluida en `CONTRASENAS_COMUNES` (`shared/esquemas/contrasenas-comunes.ts`, 50 entradas en minúsculas: `password`, `contrasena`, `contraseña`, `1234567890`, `123456789012`, `qwertyuiop`, `zydesk1234`, `administrador`, `bienvenido1`, …). Devuelve `{ ok: true } | { ok: false, motivo: 'corta' | 'igual_correo' | 'comun' }`. En la API → 400 `CONTRASENA_DEBIL` con `detalles: { motivo }`.
- `generarTemporal()`: 14 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789` con `crypto.randomInt`; cumple la política.
- `CLAVES_REDACTADAS` (logger) suma `contrasena_temporal`, `contrasena_hash`, `token_hash`, `nueva`, `actual`.

### 5.7 Endpoints de auth y `yo`

| Método y ruta | Permiso | Entrada | Salida | Errores |
|---|---|---|---|---|
| `POST /api/auth/ingresar` | publico | `IngresoEntrada` | 200 `YoSalida` + `Set-Cookie` | 401 `CREDENCIALES_INVALIDAS` ("Correo o contraseña incorrectos") si el usuario no existe, está inactivo o la contraseña no coincide; 429 `INGRESO_BLOQUEADO` |
| `POST /api/auth/salir` | sesion | — | 204 + cookie borrada | — |
| `GET /api/yo` | sesion | — | `YoSalida` | 401 |
| `POST /api/yo/cambiar-contrasena` | sesion | `CambiarContrasenaEntrada` | 204 + **nueva** cookie | 400 `CONTRASENA_ACTUAL_INCORRECTA`, 400 `CONTRASENA_DEBIL` |
| `POST /api/yo/aceptar-terminos` | sesion | `AceptarTerminosEntrada` | `YoSalida` | 409 `CONFLICTO` `{ version_vigente }` si `version ≠ vigente` |
| `GET /api/yo/sesiones` | sesion | — | `SesionSalida[]` (la actual primero, luego por `ultimo_uso` desc) | — |
| `DELETE /api/yo/sesiones/:id` | sesion | — | 204 | 404 si no es del usuario |
| `DELETE /api/yo/sesiones` | sesion | — | `{ cerradas: number }` (todas menos la actual) | — |

Flujo de `ingresar` (`modulos/auth/auth.service.ts`, `ingresar(entrada, ip, user_agent)`):
1. `comprobarLimites`. 2. Buscar usuario por correo; verificar hash (o `HASH_FICTICIO`). 3. Fallo (no existe, inactivo o no coincide) → `registrarFallo` y lanzar 401. 4. Éxito → `enTransaccion`: crear sesión **nueva** (anti fijación), `usuario.ultimo_ingreso = now`, `registrarAuditoria(tx, { accion: 'ingreso_ok', usuario_id, detalle: { correo, user_agent, mantener, sesion_id } })`. 5. `Set-Cookie`; devolver `YoSalida`.

`salir`: borra la sesión actual; `cierre_sesion`. `cambiar-contrasena`: verifica la actual, aplica la política, guarda el hash, `debe_cambiar_contrasena = false`, **borra todas las sesiones del usuario** (ADR 0013) y crea una nueva para la petición actual (mismo `mantener`); auditoría `contrasena_cambiada` + un `sesion_cerrada { sesion_id, motivo: 'cambio_contrasena' }` por sesión borrada. `DELETE sesiones/:id` y `DELETE sesiones`: `sesion_cerrada { motivo: 'usuario' }`. `aceptar-terminos`: guarda versión y fecha; `terminos_aceptados { version }`.

### 5.8 Términos y privacidad (`modulos/legal/`)

- Archivos fuente en **`docs/legal/terminos-de-uso.md`** y **`docs/legal/politica-de-privacidad.md`**, con front matter:
  ```
  ---
  version: 2026-09-30-borrador-1
  titulo: Términos de uso
  borrador: true
  ---
  > **BORRADOR — pendiente de revisión.** Texto marcador; no ha sido revisado por…
  ```
  Contenido de la Fase 1: borrador con estructura (objeto; cuentas creadas por Administración y responsabilidad sobre la contraseña; uso aceptable; qué registra la app: correo, IP, user agent, acciones de seguridad con retención de 1 año, historial de negocio permanente; contacto `[RESPONSABLE DEL TRATAMIENTO]`; `[NOMBRE DE LA ORGANIZACIÓN]`). Cada sección repite la nota de borrador. Sin inventar datos reales ni citar leyes concretas.
- La API los lee **una vez al arrancar** desde `new URL('../../../../docs/legal/', import.meta.url)` (misma profundidad que `.env`; en Fase 9 el Dockerfile copia `docs/legal` a esa ruta relativa). Front matter parseado a mano (`---` … `---`, líneas `clave: valor`), sin librería. Si falta un archivo o la `version` está vacía, la API no arranca (`logger.error` + exit 1).
- **Versión vigente** = `version` de `terminos-de-uso.md`. `debe_aceptar_terminos = usuario.terminos_version !== vigente`. Subir la versión = cambiar ese campo y redesplegar: todos vuelven a aceptar. La política de privacidad se muestra y se enlaza desde el diálogo de aceptación, pero **no tiene aceptación separada** (el texto del diálogo dice "He leído los Términos de uso y la Política de privacidad").
- `GET /api/legal/terminos` y `GET /api/legal/privacidad` → `DocumentoLegalSalida` (publico).

### 5.9 Usuarios (`modulos/usuarios/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/usuarios` | sesion | `UsuariosQuery` | `UsuarioSalida[]` por `nombre` | Todo rol (selectores de responsables); por defecto solo activos salvo `activo=false`/omitido = todos |
| `GET /api/usuarios/:id` | sesion | — | `UsuarioSalida` | 404 |
| `POST /api/usuarios` | config.editar | `UsuarioCrearEntrada` | 201 `UsuarioSalida` | 409 `CONFLICTO` `{ campo: 'correo' }` si existe; `debe_cambiar_contrasena = true`; `color_avatar` por defecto = `COLORES_AVATAR[(cantidad de usuarios) % 10]` con los 10 colores del diseño `#F2D7C9 #CFDDF3 #D9EBD3 #EBDDF3 #F3E7C4 #CDEBE6 #F3CFD9 #DAD6CF #D3E0F0 #E6E2C8`; auditoría `usuario_creado { usuario_creado_id, rol }` |
| `PATCH /api/usuarios/:id` | config.editar | `UsuarioEditarEntrada` | `UsuarioSalida` | Cambio de `rol` → borra sesiones del usuario + `rol_cambiado { usuario_afectado_id, de, a }` + `sesion_cerrada { motivo: 'rol' }`; `correo` duplicado → 409; no permite quitar el rol `admin` al último admin activo (409 `CONFLICTO` `{ motivo: 'ultimo_admin' }`) |
| `POST /api/usuarios/:id/desactivar` | config.editar | — | `UsuarioSalida` | Borra sesiones; `usuario_desactivado` + `sesion_cerrada { motivo: 'desactivado' }`; 409 `{ motivo: 'propio' }` si es el actor, `{ motivo: 'ultimo_admin' }` si es el último admin activo |
| `POST /api/usuarios/:id/reactivar` | config.editar | — | `UsuarioSalida` | `usuario_reactivado` |
| `POST /api/usuarios/:id/restablecer-contrasena` | config.editar | — | `RestablecerSalida` | genera temporal, guarda hash, `debe_cambiar_contrasena = true`, borra sesiones; `contrasena_restablecida { usuario_afectado_id }` (nunca la contraseña) |

`iniciales(nombre)` (`shared/formato/iniciales.ts`): primera letra del primer y del último token en mayúsculas (`"Sebastián Díaz"` → `SD`; un solo token → sus dos primeras letras).

### 5.10 Auditoría visible (`modulos/auditoria/`)

`GET /api/auditoria` (config.editar, `AuditoriaQuery`) → paginado de `AuditoriaSalida`, orden `-creado_en`; filtro `correo` sobre `detalle->>'correo'`. No hay escritura por API.

## 6. Motor de horas hábiles (bloque 1C, ADR 0005) — `packages/shared/src/horas-habiles/`

Puro, sin BD ni Intl de locale. Todo cálculo en `America/Santiago` con `TZDate` de `@date-fns/tz` (`ZONA` de `formato/fecha.ts`). Entradas y salidas en `Date` (UTC) o ISO.

```ts
// tipos.ts
export interface HorarioDia { dia_semana: number /* 0 = domingo … 6 = sábado (getDay) */; activo: boolean; entrada: string /* HH:mm */; salida: string; colacion_inicio: string; colacion_min: number }
export interface Calendario { horario: HorarioDia[] /* 7 */; feriados: string[] /* AAAA-MM-DD, aplican a todo el día */; hora_extendida_desde?: string }
export interface Plazo { valor: number; unidad: 'horas' | 'dias' }

// calendario.ts
export function bloquesDelDia(fecha: Date, cal: Calendario): Array<{ inicio: Date; fin: Date }>
  // [] si el día (en la zona) no está activo o es feriado; si no, [entrada, colacion_inicio) y [colacion_inicio+min, salida) (si colacion_min = 0, un solo bloque). Las horas HH:mm se interpretan en la zona (TZDate) — así un mismo "08:30" vale antes y después del cambio de hora.
export function jornadaSemanalHoras(horario: HorarioDia[]): number   // suma de bloques, 1 decimal

// motor.ts
export function sumarHorasHabiles(desde: Date, horas: number, cal: Calendario): Date
  // avanza por bloques; si `desde` cae fuera de bloque (antes, en colación, después, día inactivo o feriado) empieza en el próximo bloque. horas ≥ 0 con fracciones (0.25). Con horas = 0 devuelve `desde` si está dentro de un bloque, si no el inicio del próximo bloque.
export function sumarDiasHabiles(desde: Date, dias: number, cal: Calendario): Date
  // cuenta `dias` días hábiles (activos y no feriados) después del día de `desde`; conserva la hora local de `desde`, recortada a [entrada, salida] del día destino (si cae en colación no se ajusta). dias ≥ 1.
export function sumarPlazo(desde: Date, plazo: Plazo, cal: Calendario): Date   // despacha según unidad
export function horasHabilesEntre(a: Date, b: Date, cal: Calendario): number   // suma de intersección de [a,b) con los bloques; a > b → negativo; 2 decimales
export function esHoraExtendida(fecha: Date, cal: Calendario): boolean   // fuera de todo bloque, o ≥ hora_extendida_desde ese día
export function siguienteInicioHabil(desde: Date, cal: Calendario): Date
```

Límite de seguridad: si tras 400 días de calendario no se completa el plazo (calendario sin días activos) → `throw new Error('Calendario sin días hábiles')`.

### 6.1 Tests de tabla (`motor.test.ts`, `calendario.test.ts`)

Calendario `SOPORTE`: L–J `08:30–18:00`, colación `13:00` / 60; V `08:30–16:30` colación `13:00` / 60; S y D inactivos; `hora_extendida_desde: '19:00'`; feriados `['2026-04-03', '2026-09-18', '2026-09-19', '2027-01-01']`. Fechas locales (`America/Santiago`); en 2026 Chile está en UTC−3 (horario de verano) hasta el **sábado 4 de abril a las 24:00** (→ UTC−4) y vuelve a UTC−3 el **sábado 5 de septiembre a las 24:00**; los tests se escriben con `new TZDate(y, m, d, h, min, ZONA)` y se comparan con `toISOString()` para no depender de la máquina (`TZ=UTC` en `npm test`). Si algún caso de cambio de hora falla por diferencias de `tzdata` en Node, **detente y pregunta**.

| # | Caso | Llamada | Esperado (hora local Santiago) |
|---|---|---|---|
| 1 | dentro del bloque | `sumarHorasHabiles(mar 29-sep-2026 09:00, 2)` | mar 29-sep 11:00 |
| 2 | cruza colación | `(mar 29-sep 12:00, 2)` | mar 29-sep 15:00 |
| 3 | cruza día | `(mar 29-sep 16:00, 4)` | mié 30-sep 10:30 |
| 4 | viernes corto + fin de semana | `(vie 2-oct 15:00, 3)` | lun 5-oct 10:00 |
| 5 | feriado 18-sep y fin de semana | `(jue 17-sep 17:00, 2)` | lun 21-sep 09:30 |
| 6 | inicio sábado | `(sáb 3-oct 10:00, 1)` | lun 5-oct 09:30 |
| 7 | inicio antes de entrada | `(mar 29-sep 07:00, 1)` | mar 29-sep 09:30 |
| 8 | inicio en colación | `(mar 29-sep 13:30, 1)` | mar 29-sep 15:00 |
| 9 | inicio después de salida | `(mar 29-sep 19:00, 1)` | mié 30-sep 09:30 |
| 10 | fracción | `(mar 29-sep 12:45, 0.5)` | mar 29-sep 14:15 |
| 11 | cero horas fuera de jornada | `(sáb 3-oct 10:00, 0)` | lun 5-oct 08:30 |
| 12 | jornada exacta | `(lun 28-sep 08:30, 8.5)` | lun 28-sep 18:00 |
| 13 | semana completa | `(lun 28-sep 08:30, 41)` | vie 2-oct 16:30 |
| 14 | cambio a horario de invierno (5-abr) | `(jue 2-abr-2026 16:00, 4)` | lun 6-abr 10:30 (jue 2h → 18:00; vie 3 feriado; lun 08:30 + 2h). En UTC: `2026-04-02T19:00:00Z` → `2026-04-06T14:30:00Z` |
| 15 | cambio a horario de verano (6-sep) | `(vie 4-sep-2026 15:00, 4)` | lun 7-sep 11:00. En UTC: `2026-09-04T19:00:00Z` → `2026-09-07T14:00:00Z` |
| 16 | `sumarDiasHabiles` simple | `(mar 29-sep 10:00, 1)` | mié 30-sep 10:00 |
| 17 | días con feriado | `(jue 17-sep 10:00, 1)` | lun 21-sep 10:00 |
| 18 | días, hora recortada | `(jue 1-oct 17:30, 1)` | vie 2-oct 16:30 |
| 19 | días desde fin de semana | `(sáb 3-oct 10:00, 2)` | mar 6-oct 10:00 |
| 20 | días, 3 con año nuevo feriado | `(mié 30-dic-2026 09:00, 3)` | mar 5-ene-2027 09:00 |
| 21 | `horasHabilesEntre` | `(mar 29-sep 09:00, mié 30-sep 10:30)` | 10 |
| 22 | `horasHabilesEntre` fin de semana entero | `(sáb 3-oct 00:00, lun 5-oct 00:00)` | 0 |
| 23 | `horasHabilesEntre` invertido | `(mié 30-sep 10:30, mar 29-sep 09:00)` | −10 |
| 24 | `horasHabilesEntre` con cambio de hora | `(jue 2-abr 16:00, lun 6-abr 10:30)` | 4 |
| 25 | `esHoraExtendida` | mar 29-sep 19:30 → true; 18:30 → true (fuera de bloque); 17:59 → false; 13:15 → true (colación); sáb 10:00 → true | |
| 26 | `jornadaSemanalHoras(SOPORTE.horario)` | | 41 |
| 27 | `bloquesDelDia(vie 18-sep)` | | `[]` (feriado) |
| 28 | `sumarHorasHabiles` con `colacion_min = 0` | calendario L–V 09:00–17:00 sin colación, `(lun 28-sep 12:30, 1)` | 13:30 |
| 29 | calendario sin días activos | | lanza `Calendario sin días hábiles` |
| 30 | departamento Terreno del diseño (L–V 08:00–17:00, col. 60) | `jornadaSemanalHoras` | 40 |

Los casos 14 y 15 se afirman **también** en UTC (`toISOString()`), que es lo que demuestra que el cambio de hora se aplicó.

### 6.2 `POST /api/plazos/calcular` (bloque 1D, `modulos/plazos/`)

Permiso `sesion`. Entrada `CalcularPlazoEntrada`; carga el horario y los feriados del departamento (`departamento_id NULL` + los propios, del año de `desde` y el siguiente), llama `sumarPlazo` y devuelve `{ hasta, horas_habiles: horasHabilesEntre(desde, hasta) }`. 404 si el departamento no existe. Test de integración con el departamento "Soporte TI" de las semillas: caso 5 de la tabla.

## 7. Departamentos, horarios y feriados (bloque 1D, `modulos/departamentos/`)

```sql
departamento ( id identity PK, nombre text NOT NULL UNIQUE, hora_extendida_desde text NOT NULL, capacidad_tickets_pct integer NOT NULL CHECK (0..100), creado_en, actualizado_en )
horario_dia ( departamento_id integer NOT NULL REFERENCES departamento(id) ON DELETE CASCADE, dia_semana smallint NOT NULL CHECK (0..6), activo boolean NOT NULL, entrada text NOT NULL, salida text NOT NULL, colacion_inicio text NOT NULL, colacion_min integer NOT NULL, PRIMARY KEY (departamento_id, dia_semana) )
feriado ( id identity PK, fecha date NOT NULL, nombre text NOT NULL, departamento_id integer NULL REFERENCES departamento(id) ON DELETE CASCADE, UNIQUE NULLS NOT DISTINCT (fecha, departamento_id) )
```

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/departamentos` | sesion | — | `DepartamentoSalida[]` por nombre | `personas` = usuarios activos del departamento |
| `GET /api/departamentos/:id` | sesion | — | `DepartamentoSalida` | 404 |
| `POST /api/departamentos` | config.editar | `DepartamentoEntrada` | 201 | 409 nombre duplicado; `config_cambiada { seccion: 'departamento', departamento_id, accion: 'creado' }` |
| `PUT /api/departamentos/:id` | config.editar | `DepartamentoEntrada` | 200 | reemplaza los 7 `horario_dia` en la misma transacción; `config_cambiada { seccion: 'departamento', departamento_id, accion: 'editado' }` |
| `DELETE /api/departamentos/:id` | config.editar | — | 204 | 409 `{ motivo: 'con_personas' }` si tiene usuarios (activos o no); `config_cambiada { …, accion: 'eliminado' }` |
| `GET /api/feriados` | sesion | `FeriadosQuery` | `FeriadoSalida[]` por fecha | `anio` por defecto = año actual en Santiago; `departamento_id` devuelve los generales **y** los de ese departamento |
| `POST /api/feriados` | config.editar | `FeriadoEntrada` | 201 | 409 si ya existe (fecha, departamento); `config_cambiada { seccion: 'feriado', fecha, accion: 'creado' }` |
| `DELETE /api/feriados/:id` | config.editar | — | 204 | `config_cambiada { seccion: 'feriado', fecha, accion: 'eliminado' }` |

Horario por defecto al crear (lo propone el front, la API no rellena): L–V activo `08:30–18:00`, colación `13:00`/60; S y D inactivos con `09:00–13:00`, colación `13:00`/0. `hora_extendida_desde` por defecto `19:00`, capacidad 80.

`database/semillas/feriados-cl.json`: `[{ "fecha": "2026-01-01", "nombre": "Año Nuevo" }, …]` con los feriados legales de Chile de **2026 y 2027** (irrenunciables y no laborales nacionales; sin regionales ni electorales): 2026: 1 ene, 3 abr (Viernes Santo), 4 abr (Sábado Santo), 1 may, 21 may, 21 jun (Pueblos Indígenas), 29 jun (San Pedro y San Pablo), 16 jul, 15 ago, 18 sep, 19 sep, 12 oct, 31 oct, 1 nov, 8 dic, 25 dic. 2027: 1 ene, 26 mar, 27 mar, 1 may, 21 may, 21 jun, 28 jun, 16 jul, 15 ago, 17 sep (feriado adicional de Fiestas Patrias), 18 sep, 19 sep, 11 oct, 31 oct, 1 nov, 8 dic, 25 dic. Lista validada el 2026-09-30 contra la API pública de Boostr (`https://api.boostr.cl/holidays/{año}.json`). Es una semilla editable: el manual indica verificarla cada año contra el listado oficial (Boostr sirve como referencia). Test: la semilla carga 33 filas y es idempotente.

## 8. Clientes (bloque 1E, `modulos/clientes/`)

```sql
cliente ( id identity PK, nombre text NOT NULL, rut text NULL UNIQUE, direccion text NULL, es_interno boolean NOT NULL DEFAULT false, condicion_pago text NULL, exige_oc boolean NOT NULL DEFAULT false, notas text NULL, activo boolean NOT NULL DEFAULT true, creado_en, actualizado_en )
  -- índice único funcional lower(nombre)
contacto ( id identity PK, cliente_id integer NOT NULL REFERENCES cliente(id) ON DELETE CASCADE, nombre text NOT NULL, area text NULL, correo citext NULL, telefono text NULL, aprueba_cotizaciones boolean NOT NULL DEFAULT false, activo boolean NOT NULL DEFAULT true, creado_en, actualizado_en )
contrato_bolsa ( id identity PK, cliente_id … CASCADE, horas_mes numeric(6,1) NOT NULL CHECK (> 0), vigente_desde date NOT NULL, vigente_hasta date NULL, fecha_renovacion date NULL, notas text NULL, creado_en, actualizado_en )   -- ADR 0015
tarifa_cliente ( cliente_id … CASCADE, concepto text NOT NULL CHECK (concepto IN (…CONCEPTOS_TARIFA)), valor numeric(14,2) NOT NULL CHECK (>= 0), PRIMARY KEY (cliente_id, concepto) )   -- ADR 0007: transformer numeric → number
```

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/clientes` | sesion | `ClientesQuery` | `ClienteResumen[]` por nombre | por defecto solo activos; `q` busca en nombre y rut (ILIKE) |
| `GET /api/clientes/:id` | sesion | — | `ClienteSalida` | 404; `bolsa.vigente` según ADR 0015 (fecha de hoy en Santiago) |
| `POST /api/clientes` | config.editar | `ClienteEntrada` | 201 | 409 `{ campo: 'nombre' | 'rut' }` |
| `PATCH /api/clientes/:id` | config.editar | `ClienteEntrada.partial()` | 200 | mismos 409 |
| `POST /api/clientes/:id/desactivar` · `/reactivar` | config.editar | — | `ClienteSalida` | |
| `POST /api/clientes/:id/contactos` | tickets.editar | `ContactoEntrada` | 201 `ContactoSalida` | Técnicos también agregan contactos (spec: ficha de cliente la usa el equipo); `lectura` no |
| `PATCH /api/clientes/:id/contactos/:contactoId` | tickets.editar | `ContactoEntrada.partial()` | 200 | 404 si no pertenece al cliente |
| `DELETE /api/clientes/:id/contactos/:contactoId` | tickets.editar | — | 204 | borra (no hay OT que lo referencie en Fase 1; en Fase 3 pasará a desactivar) |
| `POST /api/clientes/:id/bolsa` | config.editar **o** ots.aprobar | `ContratoBolsaEntrada` | 201 | 409 `{ motivo: 'solapa_vigente' }` si ya hay un contrato cuyo rango se solapa (ADR 0015: a lo sumo uno vigente) |
| `PATCH /api/clientes/:id/bolsa/:contratoId` | config.editar o ots.aprobar | `ContratoBolsaEntrada.partial()` | 200 | mismo 409 |
| `PUT /api/clientes/:id/tarifas` | config.editar | `TarifaClienteEntrada` | `TarifaClienteSalida[]` | reemplaza el conjunto |

`requiere` acepta también un arreglo (`requiere(['config.editar', 'ots.aprobar'])` = cualquiera de los dos). Clientes, contactos, bolsa y tarifas **no** generan `evento` ni `auditoria` (ADR 0003).

## 9. Categorías (bloque 1D, `modulos/categorias/`)

```sql
categoria ( id identity PK, nombre text NOT NULL, responsable_defecto_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL, plazo_respuesta jsonb NOT NULL, plazo_resolucion jsonb NOT NULL, activo boolean NOT NULL DEFAULT true, creado_en, actualizado_en )  -- índice único lower(nombre)
```
`plazo_respuesta = { valor, unidad }`; `plazo_resolucion = { urgente, alta, media, baja }` (A5). Validación Zod al entrar y al leer (`CategoriaSalida.parse`).

| Método y ruta | Permiso | Entrada | Salida |
|---|---|---|---|
| `GET /api/categorias` | sesion | `{ activo? }` | `CategoriaSalida[]` por nombre |
| `POST /api/categorias` | config.editar | `CategoriaEntrada` | 201; 409 nombre; 400 `VALIDACION` si el responsable no existe o está inactivo; `config_cambiada { seccion: 'categoria', categoria_id, accion }` |
| `PUT /api/categorias/:id` | config.editar | `CategoriaEntrada` | 200 |
| `POST /api/categorias/:id/desactivar` · `/reactivar` | config.editar | — | `CategoriaSalida` (no se borran: los tickets futuros las referencian) |

## 10. Configuración: numeración y marca (bloque 1E, `modulos/configuracion/` + `core/numeracion/`)

### 10.1 `core/numeracion/`

```ts
export function formatearCodigo(prefijo: string, numero: number, digitos: number): string   // `${prefijo}${String(numero).padStart(digitos, '0')}`; si numero tiene más dígitos, no se recorta
export async function siguienteNumero(tx: EntityManager, clave: 'ticket' | 'ot'): Promise<{ numero: number; codigo: string }>
  // correlativo: UPDATE contador SET valor = valor + 1 WHERE clave = $1 RETURNING *  (ADR 0006)
  // aleatorio (solo ticket): crypto.randomInt(inicial, 10^digitos) con hasta 5 reintentos si `existeNumero(tx, clave, n)`; si usados ≥ 95 % de la capacidad → 409 NUMERACION_AGOTADA (ADR 0014)
export interface FuenteNumeros { ultimoUsado(tx, clave): Promise<number | null>; usados(tx, clave): Promise<number>; existe(tx, clave, numero): Promise<boolean> }
```
**Fase 1** implementa `FuenteNumeros` con `contador.valor` como "último usado" en modo correlativo (`null` si `valor < inicial`) y `usados = 0`/`existe = false` en aleatorio, porque no hay tablas `ticket`/`ot`; la Fase 2 la sustituye por `MAX(numero)`/`COUNT`/`EXISTS` sobre las tablas reales sin tocar el resto. Tests unitarios de `formatearCodigo` (`TK-`,1048,4 → `TK-1048`; `''`,7,3 → `007`; `TK-`,123456,4 → `TK-123456`) y de integración de `siguienteNumero` correlativo (dos llamadas → 1000, 1001; transacción que falla no consume número) y aleatorio (rango correcto, `NUMERACION_AGOTADA` con `usados` simulado).

### 10.2 Endpoints

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/config/marca` | publico | — | `MarcaSalida` | la pantalla de ingreso lo usa antes de autenticarse; `logo_url = '/api/config/logo'` si hay logo |
| `PUT /api/config/marca` | config.editar | `MarcaEntrada` | `MarcaSalida` | `config_cambiada { seccion: 'marca', nombre_app }` |
| `PUT /api/config/logo` | config.editar | `LogoEntrada` | `MarcaSalida` | valida que el base64 decodifique a ≤ 200 KB y que los primeros bytes correspondan al MIME (PNG `89 50 4E 47`, JPEG `FF D8`, SVG: texto que contiene `<svg`); guarda en `configuracion.logo = { tipo_mime, base64 }`; `config_cambiada { seccion: 'logo', tamano }` |
| `DELETE /api/config/logo` | config.editar | — | `MarcaSalida` | `logo = null` |
| `GET /api/config/logo` | publico | — | binario con `Content-Type` y `Cache-Control: no-cache` | 404 si no hay |
| `GET /api/config/numeracion` | config.editar | — | `NumeracionSalida` | `capacidad = 10^digitos − inicial`, `usados` de `FuenteNumeros`, `advertencia = usados / capacidad ≥ 0.5` (solo aleatorio) |
| `PUT /api/config/numeracion` | config.editar | `NumeracionEntrada` | `NumeracionSalida` | reglas ADR 0014: `inicial ≤ ultimoUsado` → 400 `NUMERACION_INICIAL_MENOR`; algún número existente no cabe en `digitos` → 400 `NUMERACION_DIGITOS_INSUFICIENTES`; al cambiar `inicial` en correlativo `valor = inicial − 1`; aleatorio → correlativo fija `valor = max(ultimoUsado, inicial − 1)`; por cada clave cambiada: `registrarEvento(tx, { entidad: 'contador', entidad_id: clave, accion: 'numeracion_cambiada', valor_anterior, valor_nuevo })` con texto legible `"TK- · inicial 1000 · 4 dígitos · correlativo"` **y** `registrarAuditoria(tx, { accion: 'numeracion_cambiada', detalle: { clave, antes, despues } })` |
| `GET /api/config/numeracion/historial` | config.editar | — | `EventoSalida[]` (`{ id, creado_en, autor: {id,nombre}|null, entidad_id, valor_anterior, valor_nuevo }`) últimos 50 | ADR 0014 "Historial de cambios de numeración" |

`YoSalida.nombre_app`/`logo_url` salen de `configuracion`; el front no llama a `/api/config/marca` cuando ya tiene `/api/yo`.

## 11. OpenAPI (ADR 0010)

- `core/http/openapi.ts`: registro en memoria de las rutas declaradas con `ruta()` (método, path convertido a `{id}`, resumen, etiqueta, esquemas, permiso en `description`, respuesta de error estándar `{ error: { codigo, mensaje, detalles? } }` para 400/401/403/404/409). `generarDocumento()` → `createDocument` de `zod-openapi` con `info: { title: 'Zydesk API', version: VERSION }`, `servers: [{ url: '/api' }]`, `components.securitySchemes: { cookie: { type: 'apiKey', in: 'cookie', name: NOMBRE_COOKIE }, bearer: { type: 'http', scheme: 'bearer' } }`.
- `GET /api/openapi.json` (config.editar) devuelve el documento; `GET /api/docs` (config.editar; si no hay sesión, redirige a `/ingresar?volver=/api/docs`) sirve Scalar (`@scalar/express-api-reference`) apuntando a `/api/openapi.json`. Helmet: relajar `contentSecurityPolicy` **solo** en `/api/docs` (Scalar carga su bundle inline); el resto mantiene la CSP por defecto.
- `apps/api/src/database/cli.ts openapi` (script `openapi` en api, `api:openapi` en la raíz): construye la app sin BD, escribe `docs/api/openapi.json` con 2 espacios y salto final. Test: el documento tiene una operación por cada ruta registrada y `npm run api:openapi` produce el mismo archivo dos veces seguidas (determinista, sin fechas).

## 12. Web (bloque 1F)

### 12.1 shadcn/ui y componentes base

Ejecutar `npx shadcn@latest add button input label checkbox switch select dialog alert-dialog dropdown-menu tabs table badge tooltip toast separator` con el `components.json` de la Fase 0. La CLI **sobrescribirá** `tema.css` con sus variables: tras ejecutarla, restaurar el bloque `@theme` de la Fase 0 y **mapear** las variables de shadcn a los tokens dentro de `:root` (`--background: var(--color-fondo)`, `--foreground: var(--color-tinta)`, `--card: var(--color-superficie)`, `--primary: var(--color-acento)`, `--primary-foreground: #fff`, `--secondary: var(--color-superficie-suave)`, `--muted: var(--color-superficie-suave)`, `--muted-foreground: var(--color-tinta-2)`, `--border: var(--color-borde)`, `--input: var(--color-borde-campo)`, `--ring: var(--color-acento)`, `--destructive: var(--color-urgente)`, `--radius: var(--radius-md)`). Sin `.dark`. Componentes de dominio nuevos en `components/dominio/`: `Avatar` (mover el de `components/Avatar.tsx`; props `iniciales`, `color`), `Pill` (`{ tono: 'neutro'|'acento'|'urgente'|'alta'|'resuelto'|'en-espera'|'interna', children }`, siempre texto), `Campo` (label + input + error de RHF), `EstadoVacio` (`{ titulo, descripcion?, accion? }`), `EstadoError` (`{ error, reintentar }`), `Cargando` (skeleton de 3 líneas o `<p role="status">Cargando…</p>`), `SinPermiso` (texto "No tienes permiso para ver esta sección" con enlace a Mi día).

### 12.2 Cliente API y sesión

- `lib/api.ts`: además de `obtener`, exportar `enviar<T>(metodo, ruta, cuerpo?)` que agrega `Content-Type: application/json`, `Accept` y `X-Requested-With: Zydesk`, `credentials: 'same-origin'`; 204 → `undefined`. Ambas lanzan `ErrorApi` con `detalles`. Si la respuesta es 401 y la ruta no es `/api/auth/ingresar`, dispara `window.dispatchEvent(new Event('zydesk:no-autenticado'))`.
- `features/auth/api.ts`: `ingresar`, `salir`, `yo`, `cambiarContrasena`, `aceptarTerminos`, `sesiones`, `cerrarSesion`, `cerrarOtras`.
- `features/auth/SesionProvider.tsx`: `useQuery(['yo'])` con `retry: false`; contexto `{ yo, cargando, recargar }`; escucha `zydesk:no-autenticado` → `queryClient.clear()` y navega a `/ingresar?volver=<ruta actual>`. Hook `useYo()` (lanza si no hay sesión) y `usePermiso(permiso)`.
- `app/router.tsx`: rutas públicas fuera del `Layout`: `/ingresar` (`IngresoPage`), `/terminos`, `/privacidad` (`DocumentoLegalPage`). Todo lo demás dentro de `<RequiereSesion>` (si `cargando` → pantalla en blanco con `Cargando`; sin `yo` → `Navigate` a `/ingresar?volver=…`; con `debe_cambiar_contrasena` → `Navigate` a `/cambiar-contrasena`; con `debe_aceptar_terminos` → renderiza `<DialogoTerminos>` bloqueante sobre el layout). Nuevas rutas con sesión: `/cambiar-contrasena`, `/perfil` (sesiones + cambiar contraseña), `/clientes/:id`, `/configuracion` redirige a `/configuracion/equipo`; `/configuracion/:pestana` con `pestana ∈ equipo | departamentos | categorias | numeracion | tarifas | plantillas | ingresos`. `<RequierePermiso permiso>` envuelve `/configuracion/*` (`config.editar`) y muestra `SinPermiso` si no lo tiene.
- `MenuLateral`/`BarraInferior`: el pie muestra `Avatar` con `yo.iniciales` y `yo.color_avatar`, `yo.nombre` y la etiqueta del rol; la cabecera muestra `yo.nombre_app` (y el logo si `logo_url`, altura 24 px). Las entradas del grupo Administración con `Configuración` se ocultan si no `config.editar` (la ruta sigue protegida). `menu.ts` gana `permiso?: Permiso` por entrada.
- Pie de página global (`app/layout/Pie.tsx`, dentro de `<main>` al final): "`{nombre_app}` · Términos de uso · Privacidad" con enlaces a `/terminos` y `/privacidad`; también en la pantalla de ingreso.

### 12.3 Pantalla 0 — Ingreso (`features/auth/pages/IngresoPage.tsx`)

Ruta `/ingresar`. Si ya hay sesión → `Navigate` a `volver ?? /mi-dia`. Consulta `GET /api/config/marca` para nombre y logo.

Layout (diseño "Ingresar a Trazo"): a ≥ 1024 px dos columnas: izquierda con fondo `bg-tinta`, monograma (logo o inicial del nombre en un cuadro `bg-acento` 40 px), `nombre_app` en `font-titulo`, titular "Cada ticket, quién lo tiene y en qué va." (`font-titulo` 40 px, `text-fondo`), subtítulo "Tickets, órdenes de trabajo y cotizaciones del equipo en un solo lugar.", y abajo `[NOMBRE DE LA ORGANIZACIÓN]` como texto marcador en `text-fondo/50` (se sustituye por `nombre_app`; no inventar). Derecha centrada: tarjeta `bg-superficie` 420 px con: `h1` "Ingresar", "Usa tu cuenta de trabajo.", campos **Correo** (`type=email`, `autocomplete=username`) y **Contraseña** (`autocomplete=current-password`) con botón "Mostrar"/"Ocultar" (`aria-pressed`), texto bajo la contraseña "¿La olvidaste? Pide a Administración que la restablezca." (sin enlace), casilla "Mantener sesión iniciada en este equipo", botón primario "Ingresar" (ancho completo, 44 px), y al pie "¿No tienes cuenta? Las cuentas las crea quien administra `{nombre_app}` en tu equipo." **Sin** botón Microsoft ni separador "o con correo y contraseña". Bajo la tarjeta, enlaces Términos de uso · Privacidad. Bajo 1024 px: una columna, panel de marca reducido a una franja superior de 96 px.

Estados: enviando (botón deshabilitado con "Ingresando…"); error 401 → mensaje bajo el formulario "Correo o contraseña incorrectos" (`role="alert"`); 429 → "Demasiados intentos. Vuelve a intentarlo a las HH:mm" usando `detalles.reintentar_en`; error de red → "No se pudo conectar. Intenta de nuevo." Tras éxito: `queryClient.setQueryData(['yo'], respuesta)` y navegar a `volver` (solo rutas internas que empiecen por `/`) o `/mi-dia`. Validación con RHF + `IngresoEntrada`.

### 12.4 Cambiar contraseña, términos y perfil

- `/cambiar-contrasena` (`CambiarContrasenaPage`): fuera del `Layout` (misma tarjeta que el ingreso). Si `debe_cambiar_contrasena`, texto "Tu contraseña fue restablecida por Administración. Elige una nueva para continuar." Campos: actual, nueva, repetir (validación en el cliente con `politicaContrasena` y coincidencia; muestra el motivo). Éxito → `recargar()` y navegar a `/mi-dia`. Errores 400 mapeados por `codigo`.
- `DialogoTerminos` (`features/legal/DialogoTerminos.tsx`): `AlertDialog` no cerrable con título "Términos de uso y privacidad", el texto de `GET /api/legal/terminos` renderizado con `react-markdown` en un contenedor con scroll (máx. 60 vh), aviso ámbar "BORRADOR — pendiente de revisión" si `borrador`, casilla "He leído los Términos de uso y la Política de privacidad" (enlace a `/privacidad` con `target=_blank`), botón "Aceptar y continuar" habilitado solo con la casilla; llama `aceptarTerminos({ version })` y `recargar()`. Botón secundario "Cerrar sesión".
- `/terminos` y `/privacidad` (`DocumentoLegalPage`): públicas, título + markdown + versión al pie ("Versión `{version}`") + enlace "Volver".
- `/perfil` (`PerfilPage`): tarjeta de datos (nombre, correo, rol, departamento, avatar; solo lectura, "Pide a Administración para cambiar estos datos"); sección **Sesiones activas** (tabla: Dispositivo = nombre legible obtenido con `ua-parser-js` en la web, p. ej. "Chrome en Windows"; si no se reconoce, `user_agent` recortado a 60 caracteres, IP, Inicio, Último uso, Vence, "Esta sesión" como `Pill`; botón "Cerrar" por fila salvo la actual, botón "Cerrar las demás" con confirmación); sección **Cambiar contraseña** (mismo formulario que arriba, en línea); botón "Cerrar sesión" → `salir()` y navegar a `/ingresar`.

### 12.5 Pantalla 11 — Clientes (`features/clientes/`)

`/clientes` (`ClientesPage`): dos columnas a ≥ 1024 px (lista 320 px + ficha), una columna bajo (lista; al elegir, navega a `/clientes/:id` con botón "Volver a la lista"). Lista: campo "Buscar cliente" (filtra por nombre/RUT en el cliente, sin llamar a la API por tecla), grupo **Clientes** (activos, `es_interno = false`) y grupo **Áreas internas**; cada fila: nombre y bajo él un texto secundario (`"bolsa de horas"` si `tiene_bolsa`; los contadores de tickets/OT del diseño llegan en Fase 2). Interruptor "Mostrar inactivos". Botón "Nuevo cliente" (solo `config.editar`) abre `Dialog` con `ClienteEntrada` (campo `es_interno` como selector "Cliente / Área interna"; RUT, dirección, condición de pago, exige OC y notas se ocultan para áreas internas). `/clientes/:id` (`ClienteFichaPage`) = la ficha:

- Cabecera: nombre (`h1`), "RUT 76123456-K" (o "Sin RUT"), dirección, `Pill` "Inactivo" si corresponde; botones "Editar ficha" (config.editar; mismo diálogo), "Desactivar/Reactivar". "Nuevo ticket para este cliente" se muestra deshabilitado con tooltip "Disponible en la Fase 2".
- Tarjeta **Bolsa de horas** (solo si `bolsa.historial.length > 0`, ADR 0015): contrato vigente ("20 h al mes · Se renueva el 1 oct · vigente desde …"), texto "Las horas usadas se calcularán cuando existan OT (Fase 5)", historial de contratos. Botón "Agregar bolsa" (config.editar o ots.aprobar) visible siempre en la ficha de clientes no internos; abre diálogo `ContratoBolsaEntrada`.
- Tarjeta **Condiciones comerciales** (no internos): tarifas acordadas (`concepto → $valor + IVA` con `formatearCLP`; "Tarifa global" cuando no hay valor propio), Condición de pago, Exige OC. Botón "Editar tarifas" (config.editar): diálogo con los 4 conceptos y "Usar tarifa global" (casilla que quita el concepto).
- Tarjeta **Contactos**: filas nombre · área · correo · `Pill` "Aprueba cotizaciones"; "+ Agregar contacto", editar y quitar (tickets.editar; quitar con `AlertDialog`).
- Tarjetas **Tickets** y **Órdenes de trabajo**: `EstadoVacio` con "Disponible en la Fase 2/3".

Estados: `Cargando`; error → `EstadoError`; lista vacía → `EstadoVacio` "Aún no hay clientes" con acción "Nuevo cliente"; 404 → "Cliente no encontrado". Tras cada mutación, invalidar `['clientes']` y `['cliente', id]`; toast "Guardado".

### 12.6 Pantalla 12 — Configuración (`features/configuracion/`)

`/configuracion/:pestana`. Cabecera: `h1` "Configuración", subtítulo "Solo las personas con rol Administración pueden cambiar esta sección". `Tabs` (estado en la URL): **Equipo y permisos**, **Departamentos y horarios**, **Categorías y plazos**, **Numeración y marca**, **Tarifas** (deshabilitada, tooltip "Fase 4"), **Plantillas** (deshabilitada, "Fase 4"). Bajo 1024 px las pestañas se muestran como `Select`. La tarjeta "Estado del sistema" de la Fase 0 pasa al final de **Numeración y marca**.

**Equipo y permisos** (`EquipoTab`): "Equipo · N personas", botón "+ Agregar persona" (diálogo `UsuarioCrearEntrada`; la contraseña temporal se genera en el cliente con el mismo alfabeto de §5.6 y se muestra **una sola vez** en un `Dialog` de confirmación con botón "Copiar" tras crear). Tabla: Avatar + nombre + correo · Departamento (`Select` inline, guarda al cambiar) · Rol (`Select` inline; al cambiar muestra `AlertDialog` "Cambiar el rol cierra las sesiones de esta persona") · Estado (`Pill` Activo/Inactivo) · menú `⋯` con "Restablecer contraseña" (`AlertDialog` → llama al endpoint → muestra la temporal una vez), "Editar nombre/correo/color", "Desactivar"/"Reactivar". Interruptor "Mostrar inactivos". Debajo, tarjeta **Qué puede hacer cada rol**: tabla de `MATRIZ_VISIBLE` × roles con "✓"/"–" y `aria-label` "Permitido"/"No permitido" (solo lectura). Enlace "Ver ingresos y registro de seguridad" → pestaña **Ingresos**.

**Ingresos** (`IngresosTab`, ruta `/configuracion/ingresos`, no aparece en las pestañas: se llega desde el enlace y tiene botón "Volver a Equipo"): filtros Acción (`Select` con todas las acciones de auditoría, etiquetas en español), Persona (`Select` de usuarios), Correo, Desde/Hasta (`input type=datetime-local`); tabla paginada (50): Fecha y hora · Acción (etiqueta) · Persona (o correo de `detalle` en fallidos) · IP · Detalle (resumen: para `ingreso_*` el user agent recortado; para el resto `JSON` compacto en `font-mono`). Estados: vacío "Sin registros para este filtro".

**Departamentos y horarios** (`DepartamentosTab`): izquierda lista de tarjetas (nombre, "N personas · 41 h por semana"), botón "+ Nuevo departamento"; derecha el editor del seleccionado (el primero por defecto; en móvil, apilado): nombre, tabla Día · Entrada · Salida · Colación inicio · Colación (min) · Horas (calculada en vivo con `jornadaSemanalHoras` de `shared`; "Libre" si inactivo) con interruptor por día, "Jornada semanal calculada: 41 h", "Horario extendido desde" (hora) con ayuda "Aplica la tarifa de horario extendido", "Tiempo disponible para tickets" (% con ayuda "El resto se reserva para reuniones y trabajo interno"), botones "Guardar" y "Eliminar" (deshabilitado con tooltip si tiene personas). Tarjeta **Feriados**: selector de año, lista (fecha · nombre · "General"/"Solo este departamento" · quitar), "+ Agregar feriado" (fecha, nombre, casilla "Solo para este departamento"). Nota al pie: "Este horario se usa para contar los plazos en horas hábiles, calcular la carga de cada persona y marcar como extendidas las horas registradas fuera de jornada."

**Categorías y plazos** (`CategoriasTab`): tabla Categoría · Responsable por defecto · Primera respuesta · Resolución Urgente · Alta · Media · Baja (A5), cada plazo como "2 horas hábiles"/"1 día hábil"; "+ Agregar categoría" y editar por fila en diálogo con selector de responsable (usuarios activos), `Plazo` = número + `Select` horas/días, y una **vista previa**: "Si un ticket Alta entra ahora, vencería el `{fecha}`" calculada con `POST /api/plazos/calcular` usando el departamento del responsable elegido (si tiene). Desactivar/reactivar por fila; interruptor "Mostrar inactivas".

**Numeración y marca** (`NumeracionTab`): tarjeta **Marca**: nombre visible (texto), logo (vista previa, `input type=file` acepta PNG/JPEG/SVG ≤ 200 KB, se convierte a base64 en el cliente; "Quitar logo"). Tarjeta **Numeración** con dos filas (Tickets, OT): prefijo, número inicial, dígitos (3–8), modo (solo tickets: Correlativo/Aleatorio), vista previa "Próximo: TK-1000"; para aleatorio, "usados / capacidad" y aviso ámbar si `advertencia`; texto "COT- deriva de la OT (COT-0218 v1)". Botón "Guardar numeración" con `AlertDialog` de confirmación "Los cambios solo afectan a códigos futuros". Errores 400 `NUMERACION_*` mostrados bajo el campo. Tarjeta **Historial de cambios de numeración** (`GET …/historial`). Tarjeta "Estado del sistema".

Tests web (jsdom): `IngresoPage.test.tsx` (envía correo/contraseña, muestra error 401 y 429 con `fetch` simulado; no aparece texto "Microsoft"), `permisos`: `MenuLateral` oculta "Configuración" para un `yo` técnico, `RequierePermiso` muestra `SinPermiso`; `DepartamentosTab` recalcula la jornada al cambiar una hora; `ClientesPage` separa clientes y áreas internas.

## 13. Semillas de desarrollo (bloque 1G, `database/semillas/desarrollo.ts`)

`npm run db:sembrar` (idempotente por correo/nombre: si ya existe, no duplica). Contraseña común = `SEMILLA_PASSWORD`. Datos del diseño (`pantallas-logica.txt`, pantalla Configuración):

- **Departamentos**: Soporte TI (L–J 08:30–18:00, V 08:30–16:30, colación 13:00/60, ext. 19:00, capacidad 80), Terreno (L–V 08:00–17:00, col. 13:00/60, ext. 18:00, cap. 90), Coordinación (L–J 09:00–18:00, V 09:00–17:00, col. 13:00/60, ext. 19:00, cap. 50). S y D inactivos 09:00–13:00.
- **Personas** (correo `<usuario>@zydesk.local`, colores del diseño): Hikki `hikki` admin / Coordinación `#CFDDF3`; Camila Rojas `crojas` coordinacion / Soporte TI `#F2D7C9`; Fernanda Castro `fcastro` coordinacion / Coordinación `#F3CFD9`; Diego Muñoz `dmunoz` tecnico / Terreno `#CFDDF3`; Valentina Soto `vsoto` tecnico / Terreno `#D9EBD3`; Matías Fuentes `mfuentes` tecnico / Soporte TI `#EBDDF3`; Javiera Pérez `jperez` tecnico / Soporte TI `#F3E7C4`; Sebastián Díaz `sdiaz` tecnico / Soporte TI `#CDEBE6`; Tomás Reyes `treyes` tecnico / Terreno `#DAD6CF`; Ignacia Morales `imorales` tecnico / Soporte TI `#D3E0F0`; Nicolás Vega `nvega` lectura / Soporte TI `#E6E2C8`. Todos con `debe_cambiar_contrasena = false` y términos aceptados en la versión vigente (para no frenar la demo).
- **Clientes**: Viña Santa Clara (RUT `76123456-K` ficticio, condición de pago "30 días", exige OC, contacto Paula Herrera · Administración · `pherrera@vinasantaclara.cl` · aprueba; bolsa 20 h/mes vigente desde el 1 del mes actual, renovación el 1 del mes siguiente; tarifas hora_normal 38000, hora_extendida 45000), Constructora Andes, Clínica Los Robles, Transportes Austral (sin RUT, con un contacto `[NOMBRE]` cada uno). **Áreas internas** (`es_interno`): Operaciones, Administración y Finanzas, Marketing, Oficina central.
- **Categorías** (responsable por defecto, primera respuesta, resolución alta; el resto de prioridades: urgente = mitad de alta (mín. 1 h), media = doble, baja = triple, en la misma unidad): ERP / Facturación (Sebastián Díaz, 2 h, 1 día), Redes y VPN (Diego Muñoz, 1 h, 1 día), Correo (Camila Rojas, 2 h, 2 días), Hardware y equipos (Valentina Soto, 4 h, 3 días), Accesos y usuarios (Javiera Pérez, 4 h, 1 día), Seguridad y cámaras (Tomás Reyes, 4 h, 3 días).
- Numeración y marca: los valores de `sembrarBase`.

Test `desarrollo.test.ts`: tras sembrar dos veces hay 11 usuarios, 3 departamentos, 8 clientes (4 + 4 internos), 6 categorías, 1 contrato de bolsa; `hikki` puede ingresar con `SEMILLA_PASSWORD`.

## 14. Documentación de la fase (bloque 1G)

- **`docs/manuales/administracion.md`**: secciones (1) Primer ingreso y primer usuario (`npm run db:admin`), (2) Crear cuentas y roles (qué puede cada rol: copia de la matriz), (3) Restablecer una contraseña (la temporal se muestra una vez; la persona debe cambiarla), (4) Desactivar y reactivar personas, (5) Departamentos y horarios (qué afecta cada campo), (6) Feriados (revisar cada año; general vs. por departamento), (7) Clientes, contactos, bolsa de horas y tarifas por cliente, (8) Categorías y plazos (cómo se calculan en horas hábiles; vista previa), (9) Numeración y marca (reglas de ADR 0014, modo aleatorio), (10) Ingresos y registro de seguridad (qué se guarda, 1 año), (11) Términos y privacidad (dónde están los archivos, cómo subir la versión), (12) Referencia de la API (`/api/docs`). Capturas se posponen a la Fase 8 (se deja `docs/manuales/img/` con `.gitkeep`).
- **`docs/manuales/usuario/00-primeros-pasos.md`**: ingresar, "mantener sesión", contraseña temporal y cambio obligatorio, aceptar términos, perfil y sesiones activas, cerrar sesión en otros dispositivos, qué hacer si olvidas la contraseña.
- **`docs/api/README.md`**: cómo autenticarse con `curl` (cookie + `X-Requested-With: Zydesk`), convenciones ADR 0010, cómo regenerar `openapi.json`.
- **`docs/legal/`**: los dos borradores de §5.8 y un `README.md` que explica el front matter y cómo subir la versión.
- **`README.md`**: pasos nuevos (`down -v` si el volumen es anterior a la Fase 1, `npm run db:migrar`, `npm run db:sembrar` con `SEMILLA_PASSWORD`, `npm run db:admin`), tabla de scripts `db:*` y `api:openapi`, sección "Base de test".
- **`CLAUDE.md`**: añadir (a) toda ruta se declara con `ruta()`; (b) toda mutación va en `enTransaccion` desde un servicio; (c) qué acciones registran `auditoria` y cuáles `evento` (tabla de §16); (d) tests de integración usan `test/fabricas.ts` y `ingresarComo`; (e) `npm run db:reiniciar` antes de probar a mano.
- **`docs/CHANGELOG.md`**: bajo `[Unreleased] · Añadido`: "Fase 1: base de datos con migraciones y roles, autenticación con sesiones endurecidas, términos y privacidad (borrador), usuarios, departamentos y feriados, clientes, categorías, numeración y marca, motor de horas hábiles, auditoría, OpenAPI en `/api/docs`."

## 15. Pruebas de seguridad obligatorias (`apps/api/src/core/auth/seguridad.test.ts` + por módulo)

1. **Permisos por rol en cada endpoint**: tabla `[método, ruta, permisoRequerido]` generada desde el registro de `ruta()` (exportar `rutasRegistradas()`); para cada ruta con permiso distinto de `publico`/`sesion` y para cada rol **sin** ese permiso, la petición (con cuerpo `{}`) responde **403 `SIN_PERMISO`** y no 400 (el permiso se comprueba antes de validar). Para cada ruta con permiso y sin sesión → **401**. Test genérico único que recorre todo el registro: al agregar una ruta queda cubierta sola.
2. Técnico → `PUT /api/config/numeracion`, `POST /api/usuarios`, `PUT /api/departamentos/:id` → 403 (PLAN §4: verificación explícita).
3. `lectura` → `POST /api/clientes/:id/contactos` → 403; `GET /api/clientes` → 200 (B10).
4. **Sesión revocada** → 401: ingresar, `DELETE /api/yo/sesiones/:id` desde otra sesión, la primera cookie recibe 401 en `GET /api/yo`.
5. **Usuario desactivado no entra**: `POST /api/usuarios/:id/desactivar` → sus cookies dan 401 y `POST /api/auth/ingresar` con sus credenciales → 401 `CREDENCIALES_INVALIDAS`.
6. **Cambio de contraseña y de rol cierran sesiones**: la otra cookie → 401.
7. **Bloqueo por cuenta**: 5 fallos → el 6.º intento (aun con la contraseña correcta) → 429 con `reintentar_en`; en `auditoria` hay 5 `ingreso_fallido` y 1 `cuenta_bloqueada`. Con `vi.useFakeTimers` no aplica (la BD usa `now()`): insertar los fallos con `creado_en` manipulado con el owner, o verificar el segundo bloqueo (30 min) insertando un `cuenta_bloqueada` previo.
8. **Bloqueo por IP**: 20 registros en 15 min desde la misma IP (insertados con el owner) → 429 para cualquier correo.
9. **Sin revelar existencia**: correo inexistente y contraseña errónea de correo existente devuelven el mismo `status`, `codigo` y `mensaje`.
10. **CSRF**: `POST /api/auth/salir` con cookie válida y sin `X-Requested-With` → 403 `CSRF`; con `Bearer` y sin cabecera → pasa.
11. **Cookie**: `Set-Cookie` de ingreso contiene `HttpOnly`, `SameSite=Lax`, `Path=/`, no contiene `Domain`; con `mantener` contiene `Max-Age`, sin él no; en `NODE_ENV=production` (`crearApp` con `env` inyectado o variable en el test) el nombre es `__Host-sesion` y trae `Secure`.
12. **Anti fijación**: dos ingresos seguidos producen tokens distintos y la primera sesión sigue válida (son sesiones independientes).
13. **Expiración**: sesión con `expira_en` en el pasado (owner) → 401 y la fila se borra; `expira_max_en` en el pasado → 401.
14. **Redacción en logs**: con el logger de test, `POST /api/auth/ingresar` con `{ contrasena: 'secreta' }` no deja ninguna línea que contenga `secreta`; una línea de error con `{ contrasena_hash, token_hash }` los muestra como `[Redactado]`.
15. **Auditoría no borrable**: test de §3.7.
16. **Contraseña pendiente / términos pendientes**: usuario restablecido → `GET /api/clientes` 403 `CONTRASENA_PENDIENTE`, `GET /api/yo` 200; tras cambiarla, usuario con versión de términos vieja → 403 `TERMINOS_PENDIENTES`; tras aceptar → 200.
17. **Política de contraseña**: `POST /api/yo/cambiar-contrasena` con `nueva = correo`, con 9 caracteres y con `password123` → 400 `CONTRASENA_DEBIL` y el motivo correcto.
18. **OpenAPI protegido**: `/api/docs` y `/api/openapi.json` sin sesión → 401/redirección; con técnico → 403; con admin → 200.
19. `X-Request-Id` sigue presente en respuestas 401/403/429 y las filas de `auditoria` de esa petición tienen ese `req_id`.

## 16. Qué genera `evento` y qué genera `auditoria` (resumen)

| Acción | `evento` | `auditoria` |
|---|---|---|
| Guardar numeración | `contador` / `numeracion_cambiada` por clave cambiada | `numeracion_cambiada` |
| Ingreso, salida, sesiones, bloqueo | — | `ingreso_ok`, `ingreso_fallido`, `cuenta_bloqueada`, `cierre_sesion`, `sesion_cerrada` |
| Contraseñas | — | `contrasena_cambiada`, `contrasena_restablecida` |
| Usuarios | — | `usuario_creado`, `usuario_desactivado`, `usuario_reactivado`, `rol_cambiado` |
| Términos | — | `terminos_aceptados` |
| Marca, logo, departamentos, feriados, categorías | — | `config_cambiada { seccion, … }` |
| Clientes, contactos, bolsa, tarifas | — | — (ADR 0003) |

## 17. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint` y un commit)

| Tarea | Crea/edita | Criterio de aceptación |
|---|---|---|
| **F1-T1 Roles de BD y entorno** (1A) | `docker/postgres-init/01-roles.sql`, `docker-compose.dev.yml` (volumen `:ro`), `.env.example`, `config/env.ts` + test | `docker compose -f docker-compose.dev.yml down -v && up -d` → `psql -U zydesk_app -d zydesk -c "select 1"` y `psql -U zydesk_owner -d zydesk_test -c "select 1"` devuelven 1; `cargarEnv({ NODE_ENV: 'test' })` sin `TEST_DATABASE_URL` lanza; `EJECUTAR_JOBS=''` → `true`. |
| **F1-T2 Migración base y helpers** (1A) | `config/db.ts`, `database/data-source-owner.ts`, `database/cli.ts` (migrar/revertir), migraciones 1–2, entidades `Evento`, `Auditoria`, `Contador`, `Configuracion`, `core/historial/*`, `database/semillas/base.ts` (sin feriados aún), `test/{bd,setup,setup-global}.ts`, `vitest.config.ts` | `npm run db:migrar` aplica 2 migraciones; `npm run db:revertir -- --todo` las deshace; `permisos-bd.test.ts` verde; `historial.test.ts`: `registrarCambios` con 3 campos, 2 cambiados → 2 filas con `req_id` del contexto; `registrarAuditoria(null, …)` inserta con `ip` del contexto. |
| **F1-T3 `ruta()`, `validar`, paginación** (1A) | `core/http/{validar,ruta,paginacion,openapi}.ts`, migrar `/api/salud` a `ruta()` | Test: body inválido → 400 con `detalles.fieldErrors`; `rutasRegistradas()` contiene `GET /api/salud`; `generarDocumento()` produce un objeto con `paths['/salud']`. |
| **F1-T4 pg-boss** (1A) | `core/jobs/{boss,mantencion}.ts`, `server.ts` | `mantencion.test.ts` verde; `npm run dev -w @zydesk/api` registra `jobs iniciados` y el esquema `pgboss` existe; con `EJECUTAR_JOBS=false` no arranca pg-boss. |
| **F1-T5 Motor de horas** (1C) | `shared/src/horas-habiles/*`, `enums/*`, `formato/iniciales.ts`, `exports` de shared | 30 casos de §6.1 verdes con `TZ=UTC`; `npm run build -w @zydesk/shared` genera `dist/horas-habiles/index.js`. |
| **F1-T6 Permisos y esquemas** (1B) | `shared/permisos.ts`, `esquemas/*`, `errores.ts` | `permisos.test.ts` y `esquemas.test.ts` (rut válido/inválido, `HorarioDia` con colación fuera de rango → error, `politicaContrasena` 4 casos) verdes. |
| **F1-T7 Migraciones de dominio** (1A) | migraciones 3–6, entidades `Departamento`, `HorarioDia`, `Feriado`, `Usuario`, `Sesion`, `Cliente`, `Contacto`, `ContratoBolsa`, `TarifaCliente`, `Categoria`, `feriados-cl.json`, `sembrarBase` con feriados, `test/fabricas.ts` | `db:migrar` desde cero aplica 6; `db:revertir --todo` limpia; `sembrarBase` dos veces → 33 feriados; fábricas crean filas válidas. |
| **F1-T8 Sesiones y middlewares** (1B) | `core/auth/{cookie,ip,contrasena,autenticar,requiere,csrf,limites}.ts`, `contexto.ts`, `req-id.ts`, `app.ts` (`cookie-parser`, csrf, trust proxy) | Tests unitarios de `contrasena` (hash/verificar/temporal), `csrf`, `limites` (por IP y por cuenta con filas insertadas por el owner). |
| **F1-T9 Auth y `/api/yo`** (1B) | `modulos/auth/*`, `modulos/legal/*`, `docs/legal/*`, `CLAVES_REDACTADAS` | Endpoints de §5.7 y §5.8 con tests; pruebas de seguridad 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19. `curl -i -X POST localhost:3010/api/auth/ingresar -H "Content-Type: application/json" -H "X-Requested-With: Zydesk" -d '{"correo":"…","contrasena":"…"}'` devuelve `Set-Cookie: sesion=…; HttpOnly; SameSite=Lax`. |
| **F1-T10 Usuarios y auditoría visible** (1B) | `modulos/usuarios/*`, `modulos/auditoria/*`, `database/cli.ts admin` | Endpoints de §5.9–5.10 con tests; pruebas 2, 5; `ADMIN_PASSWORD=… npm run db:admin -- --correo admin@x.cl --nombre Admin` crea el admin y con él se puede ingresar; sin `ADMIN_PASSWORD` termina con 1. |
| **F1-T11 OpenAPI** (1B) | `openapi.ts` (documento completo), `/api/docs`, `/api/openapi.json`, `cli.ts openapi`, `docs/api/openapi.json` | Prueba 18; `npm run api:openapi` genera el archivo y `git diff` queda vacío al repetirlo; en el navegador `/api/docs` con admin muestra Scalar con todas las rutas. |
| **F1-T12 Departamentos y feriados** (1D) | `modulos/departamentos/*` | Endpoints de §7 con tests (409 con personas, reemplazo de horario, feriados por año y departamento). |
| **F1-T13 Categorías y plazos** (1D) | `modulos/categorias/*`, `modulos/plazos/*` | Endpoints de §9 y §6.2 con tests; `POST /api/plazos/calcular` reproduce el caso 5. |
| **F1-T14 Clientes** (1E) | `modulos/clientes/*` | Endpoints de §8 con tests (RUT duplicado 409, bolsa solapada 409, `bolsa.vigente` por fechas, tarifas reemplazadas, `lectura` 403 en contactos). |
| **F1-T15 Numeración y marca** (1E) | `core/numeracion/*`, `modulos/configuracion/*` | Tests de §10.1 y §10.2 (`NUMERACION_INICIAL_MENOR`, `…_DIGITOS_INSUFICIENTES`, evento + auditoría por cambio, logo inválido 400, `GET /api/config/logo` binario). Prueba de seguridad 1 (genérica) y 3 quedan verdes con todas las rutas registradas. |
| **F1-T16 Semillas de desarrollo** (1G) | `database/semillas/desarrollo.ts`, `cli.ts sembrar/reiniciar` | `desarrollo.test.ts` verde; `SEMILLA_PASSWORD=… npm run db:reiniciar` deja la BD lista y `hikki@zydesk.local` ingresa. |
| **F1-T17 shadcn y base web** (1F) | `components/ui/*`, `tema.css` (mapeo), `components/dominio/*`, `lib/api.ts` (`enviar`), `features/auth/{api,SesionProvider}.tsx`, `router.tsx`, guardas, `menu.ts`, `Pie.tsx`, `MenuLateral`/`BarraInferior` con el usuario real | `npm run build -w @zydesk/web` verde; tests de `MenuLateral` (permiso) y `RequierePermiso`; el fondo sigue `#F3F1EC` y el botón "Nuevo ticket" `#2F47C4` tras la CLI de shadcn. |
| **F1-T18 Ingreso, cambio de contraseña, términos, perfil, legal** (1F) | `features/auth/pages/*`, `features/legal/*`, `features/perfil/*` | `IngresoPage.test.tsx` verde; en el navegador: ingreso con la semilla → Mi día; usuario restablecido → forzado a `/cambiar-contrasena`; versión de términos cambiada en el `.md` → diálogo bloqueante; `/perfil` lista sesiones y "Cerrar las demás" invalida otra pestaña de incógnito; `/terminos` y `/privacidad` públicas con aviso de borrador. |
| **F1-T19 Pantalla Clientes** (1F) | `features/clientes/*` | Test de separación clientes/áreas; en el navegador la ficha de Viña Santa Clara muestra bolsa, tarifas, contacto y estados vacíos; técnico agrega contacto, técnico no ve "Editar ficha"; a 800 px lista y ficha se apilan. |
| **F1-T20 Pantalla Configuración** (1F) | `features/configuracion/*` (5 pestañas + Ingresos) | Tests de `DepartamentosTab` y `NumeracionTab`; en el navegador: crear persona muestra la temporal una vez; cambiar rol pide confirmación; jornada recalcula; agregar feriado; categoría con vista previa de plazo; guardar numeración con inicial menor muestra el error 400; historial de numeración lista el cambio; pestaña Ingresos muestra los `ingreso_ok`; usuario técnico en `/configuracion` ve `SinPermiso`; pestañas Tarifas y Plantillas deshabilitadas. |
| **F1-T21 Documentación y cierre** (1G) | §14 completo, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, commit | Criterios de §18 desde un clon limpio. |

## 18. Criterios de aceptación de la fase (verificación final, en este orden)

```
copy .env.example .env  (rellenar ADMIN_PASSWORD y SEMILLA_PASSWORD)
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d   → healthy, roles creados
npm install && npm run typecheck && npm run lint && npm run format:check                            → 0 errores
npm run db:migrar                                                                                   → 6 migraciones aplicadas
npm test                                                                                            → verde en shared (≥ 30 casos del motor), api (integración contra zydesk_test), web
npm run db:sembrar                                                                                  → 11 personas, 3 departamentos, 8 clientes, 6 categorías, 33 feriados
npm run db:admin -- --correo admin@zydesk.local --nombre "Administración"                          → crea el admin (falla sin ADMIN_PASSWORD)
npm run api:openapi                                                                                 → docs/api/openapi.json sin diff al repetir
npm run dev                                                                                         → "api iniciada", "jobs iniciados"
curl -i localhost:3010/api/yo                                                                       → 401 {"error":{"codigo":"NO_AUTENTICADO"...}}
curl -i -X POST localhost:3010/api/auth/ingresar -H "Content-Type: application/json" -d '{...}'    → 403 CSRF (sin X-Requested-With)
curl -i -X POST ... -H "X-Requested-With: Zydesk" -d '{"correo":"hikki@zydesk.local","contrasena":"<SEMILLA_PASSWORD>"}'  → 200 + Set-Cookie HttpOnly; SameSite=Lax
5 intentos fallidos + 1 correcto                                                                    → el 6.º responde 429 INGRESO_BLOQUEADO
psql -U zydesk_app -d zydesk -c "delete from auditoria"                                            → permission denied
```
En el navegador (1440 px y 800 px): pantalla 0 sin botón Microsoft, con texto "Pide a Administración que la restablezca"; ingreso → Mi día con el usuario real en el menú; `/configuracion` con técnico → sin permiso; con admin las 4 pestañas activas y 2 deshabilitadas; `/clientes` con la ficha de Viña Santa Clara; `/api/docs` con admin; `/terminos` con aviso de borrador; pie con enlaces.

## 19. Decisiones tomadas en esta spec (menores, con justificación)

1. **pg-boss entra en Fase 1** solo con `mantencion.limpiar` (ADR 0017 lo sitúa en Fase 1; evita un `setInterval` provisional).
2. **Nombre de cookie según entorno**: `__Host-sesion` en producción, `sesion` en desarrollo/test, porque `__Host-` exige `Secure` y el desarrollo es `http://localhost`.
3. **`X-Requested-With: Zydesk`** como valor exacto (ADR 0002 solo pide la cabecera); se salta con `Bearer`.
4. **Sin `express-rate-limit`** (ADR 0010 lo menciona): el límite por IP y por cuenta de ADR 0013 se implementa sobre `auditoria` (ADR 0017), que ya cubre ambos; dos limitadores darían respuestas inconsistentes.
5. **Deslizamiento de sesión escrito como máximo cada 5 min**, para no hacer un `UPDATE` por petición.
6. **Acciones de auditoría nuevas**: `usuario_reactivado` y `terminos_aceptados` (ADR 0017 no las lista; la fase las necesita).
7. **Términos**: una sola aceptación cubre términos y privacidad; la versión vigente es el front matter de `docs/legal/terminos-de-uso.md`, leído al arrancar; la API no arranca sin los archivos.
8. **Logo** guardado en `configuracion.logo` como `{ tipo_mime, base64 }` ≤ 200 KB y servido por `GET /api/config/logo`: `Storage` (ADR 0009) llega en Fase 2 y un logo no justifica adelantarlo. Migrarlo después es trivial.
9. **`GET /api/config/marca` y `/api/config/logo` públicos**: la pantalla de ingreso muestra nombre y logo antes de autenticarse. No exponen nada sensible.
10. **Bloqueo de contraseña y términos pendientes** como 403 `CONTRASENA_PENDIENTE` / `TERMINOS_PENDIENTES` con lista blanca de rutas, en vez de solo lógica en el front (el front no es barrera).
11. **`FuenteNumeros`** con implementación provisional en Fase 1 (no hay `ticket`/`ot`): las reglas de ADR 0014 quedan escritas y testeadas; Fase 2 solo cambia la fuente.
12. **`evento.entidad_id` es `text`** para que `contador` (clave textual, ADR 0014) y el resto (ids numéricos) compartan la tabla.
13. **Contactos editables por `tickets.editar`** (no solo `config.editar`): la spec deja la ficha de cliente al equipo y los técnicos son quienes conocen a los contactos; la ficha en sí y las tarifas siguen siendo de Administración; la bolsa, de Administración o Coordinación (ADR 0015).
14. **Categorías y clientes no se borran**, se desactivan (tickets futuros las referencian); los departamentos sí se borran si no tienen personas.
15. **Semilla base idempotente ejecutada al arrancar y en tests**, sin datos en migraciones (ADR 0005 pide cargar feriados al iniciar).
16. **Pestañas Tarifas y Plantillas visibles pero deshabilitadas** con tooltip "Fase 4", para que la navegación coincida con el diseño sin implementar nada.
17. **Test de permisos genérico** que recorre el registro de `ruta()`: cualquier ruta nueva queda cubierta.
18. **`fileParallelism: false`** en los tests de la API (una sola BD de test); `TRUNCATE` con el owner entre tests.
19. **Contraseña temporal generada en el cliente al crear** un usuario y devuelta por la API al restablecer; en ambos casos se muestra una sola vez y nunca se registra.
20. **Colores de avatar** = los 10 del diseño, asignados por rotación; editables.
21. **Días de la semana 0–6 con 0 = domingo** (`getDay`), como en ADR 0005.

## 20. Respuestas del usuario (2026-09-30)

1. **Nombre en la pantalla de ingreso**: "Zydesk" (el nombre visible configurable). No hay nombre de organización aparte. Los borradores legales mantienen `[RESPONSABLE DEL TRATAMIENTO]` hasta definirlo (E3).
2. **Correo de las semillas**: `@zydesk.local`. El correo es solo el identificador de ingreso; la app no envía correos (ADR 0013).
3. **Aceptación**: una sola para términos y privacidad.
4. **Sesiones activas**: nombre legible con `ua-parser-js` (en `apps/web`), con el `user_agent` recortado como respaldo.
5. **Feriados**: validados contra Boostr; se agregó el 17 sep 2027 (33 filas).

## 21. Cambios de ADR propuestos → registrados en ADR 0018

- **ADR 0017**: añadir `usuario_reactivado` y `terminos_aceptados` a la lista de `accion`; precisar que `evento.entidad_id` es `text`.
- **ADR 0010**: sustituir "`express-rate-limit` en `/api/auth/*`" por "límites de ADR 0013 implementados sobre `auditoria` (ADR 0017)".
- **ADR 0013 / 0002**: fijar el valor de `X-Requested-With` (`Zydesk`) y el nombre de cookie por entorno (`__Host-sesion` solo en producción).
- **ADR 0009 (o nueva ADR menor)**: dejar constancia de que el logo de marca vive en `configuracion` (base64 ≤ 200 KB), no en `Storage`.
- **ADR 0012**: la carpeta de manuales es `docs/manuales/` (PLAN) y no `docs/manual-usuario/` + `docs/manual-administracion.md` (ADR); esta spec sigue al PLAN porque es el más reciente y CLAUDE.md lo referencia. Conviene actualizar la ADR.
