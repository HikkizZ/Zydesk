# Fase 2 — Tickets · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §4 Fase 2, ADR 0003, 0004, 0005, 0006, 0008, 0009, 0010, 0011, 0014, 0017, 0018, 0019, **0020**; `preguntas-abiertas.md` A7, B1, B2, B5, B7, B10, B11, B13, B14; spec funcional §4.1–4.4, §5 pantallas 1, 2, 4, 5, §6; diseño "Tablero de tickets", "Tabla de tickets", "Nuevo ticket", "Ticket TK-1048".
>
> Rama `feat/fase-2-tickets`; PR a `main` al cerrar (una rama por fase desde ahora). Entorno: el de la Fase 1 (Windows 11, Node 22, npm 10, Docker; API 3010, Postgres 5433, web 5173; scripts con `cross-env`/`rimraf`). Todo lo construido en las Fases 0 y 1 (`ruta()`, `enTransaccion`, `registrarCambios`, `registrarEvento`, `registrarAuditoria`, `siguienteNumero`, `cargarCalendario`, `test/fabricas.ts`, `ingresarComo`, `Pill`, `Avatar`, `Campo`, `lib/api.ts`, `SesionProvider`, `menu.ts`) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md` (snake_case en datos, `type` explícito en `@Column`, SQL a mano en migraciones, servicios como único punto de escritura, `logger` sin contenido).

## 0. Alcance

**Entra**: workflow de CI (ADR 0020); tablas `archivo`, `ticket`, `ticket_responsable`, `ticket_seguidor`, `correo_adjunto`, `tarea`, `mensaje`, `mencion`, `registro_horas`; `Storage` en disco con subida en dos pasos, descarga con permisos y límites; parseo de correo `.eml`/`.msg`/texto con vista previa y adjuntos internos opcionales; ticket completo (creación con numeración de ADR 0014 conectada a la tabla real, edición por `PATCH`, máquina de estados con payloads, responsables con principal y seguidores, plazos con el motor de horas hábiles, archivado automático a 7 días); actividad (seguimientos, notas internas, historial) con adjuntos, menciones `@` (solo registro) y horas desde el redactor (B5, mínimo); tareas del ticket; listados para Tablero y Tabla; job `archivos.limpiar_huerfanos`; pantallas **4 Nuevo ticket**, **5 Detalle de ticket** (usable en celular), **1 Tablero** (dnd-kit + menú "Cambiar estado"; A7), **2 Tabla** (filtros rápidos, agrupación); ficha de cliente conectada a sus tickets; semillas con los tickets del diseño; manuales y CHANGELOG.

**No entra**: OT, "Convertir en OT", advertencia/bloqueo por OT abierta (B1, Fase 3: aquí solo queda el punto de enganche, §6.6), cotizaciones, planilla de horas (Fase 5; aquí solo se crea la fila de `registro_horas`), avisos y despachador de eventos de dominio (Fase 6: las menciones se guardan pero no avisan), Línea de tiempo (Fase 6, ADR 0016), exportar la Tabla a `.xlsx` (Fase 7, junto con los reportes; el botón se muestra deshabilitado con tooltip "Fase 7"), filtro "Con OT" (Fase 3; deshabilitado con tooltip "Fase 3"), edición o borrado de mensajes, borrado de archivos ya asociados, Playwright, CD/Dockerfiles (Fase 9).

## 1. Bloques y paralelismo

| Bloque | Contenido | Depende de | Archivos que toca (exclusivos) |
|---|---|---|---|
| **2A** CI | `ci.yml` de ADR 0020 | — | `.github/workflows/ci.yml`, `README.md` (sección CI) |
| **2B** BD y contratos | migraciones 7–9 y sus entidades, `entidades.ts`, `shared/estados/ticket.ts`, todos los esquemas Zod nuevos, enums, errores, `fabricas.ts` (nuevas fábricas), script de BD de test por bloque | — | `apps/api/src/database/**`, `apps/api/src/modulos/{tickets,archivos,mensajes,tareas,horas}/*.entity.ts`, `apps/api/test/**`, `packages/shared/src/**`, `config/env.ts`, `.env.example`, `.gitignore` |
| **2C** Archivos y correo | `Storage`, `modulos/archivos`, `modulos/correos`, parsers, job de huérfanos | 2B | `apps/api/src/integraciones/**`, `apps/api/src/modulos/{archivos,correos}/**` (salvo `*.entity.ts`), `core/jobs/archivos.ts` |
| **2D** Tickets API | `modulos/tickets` (servicio, rutas, listados, estados, responsables, plazos), `core/numeracion/fuente.ts`, job archivar, `clientes` (contadores) | 2B; 2C solo para la rama "crear con correo" (contrato en §5.3, se implementa cuando 2C esté) | `apps/api/src/modulos/tickets/**` (salvo entity), `core/numeracion/fuente.ts`, `core/jobs/archivar.ts`, `core/jobs/boss.ts`, `modulos/clientes/clientes.service.ts`, `modulos/configuracion/configuracion.service.ts` (usa la fuente nueva), `app.ts` |
| **2E** Actividad, tareas y horas API | `modulos/mensajes`, `modulos/tareas`, `modulos/horas` (mínimo B5) | 2B, 2C, 2D | `apps/api/src/modulos/{mensajes,tareas,horas}/**` (salvo entity) |
| **2F** Web base + Nuevo + Detalle | `features/tickets/api.ts`, componentes de dominio nuevos, pantallas 4 y 5, ruta `/tickets/:id` | 2C–2E (API) | `apps/web/src/features/tickets/{api.ts,eventos.ts,components/**,pages/NuevoTicketPage.tsx,pages/TicketDetallePage.tsx}`, `apps/web/src/components/{dominio,ui}/**`, `apps/web/src/app/router.tsx`, `apps/web/package.json` |
| **2G** Web Tablero + Tabla + ficha de cliente | pantallas 1 y 2, tarjetas Tickets de la ficha de cliente | 2F (`api.ts` y componentes) | `apps/web/src/features/tickets/pages/{TableroPage,TablaPage}.tsx`, `apps/web/src/features/tickets/tablero/**`, `apps/web/src/features/tickets/tabla/**`, `apps/web/src/features/clientes/**` |
| **2H** Semillas y docs | semillas de tickets, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md` | todo | `database/semillas/desarrollo*.ts`, `docs/manuales/**`, `docs/CHANGELOG.md`, `docs/api/**`, `CLAUDE.md` |

**En paralelo sin conflicto**: 2A con 2B; 2C con 2D (tras 2B); 2F puede empezar componentes puros (Pill de estado, Redactor, TarjetaTicket) contra los esquemas de 2B mientras 2C–2E terminan; 2G tras 2F. Lo demás en el orden de §15.

### 1.1 Una base de test por bloque (obligatorio para agentes en paralelo)

Los tests de la API truncan la BD entre casos (`fileParallelism: false`); dos agentes contra `zydesk_test` se pisan. Cada bloque que corre tests de API usa **su propia base** `zydesk_test_<bloque>` (`zydesk_test_2c`, `_2d`, `_2e`, `_2h`; 2B usa `zydesk_test`).

- `config/env.ts` gana `TEST_BD_SUFIJO: z.preprocess(vacioAUndefined, z.string().regex(/^[a-z0-9_]{1,20}$/).optional())`. Si está definida y `NODE_ENV === 'test'`, `cargarEnv` reescribe el `pathname` de `TEST_DATABASE_URL` y `TEST_DATABASE_URL_OWNER` a `/zydesk_test_<sufijo>` (con `new URL()`), antes de exportar `env`. Sin la variable todo sigue igual (CI y uso normal).
- `database/cli.ts` gana el subcomando `bd-test crear <sufijo>` (script raíz `"db:test:crear": "npm run db:test:crear -w @zydesk/api --"`): se conecta como superusuario de desarrollo con `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/postgres` (`env.ts` añade `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` como opcionales; el comando falla con código 1 y mensaje `Faltan POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_PORT` si faltan), ejecuta `CREATE DATABASE zydesk_test_<sufijo> OWNER zydesk_owner` (idempotente: si existe, no falla) y `GRANT CREATE ON DATABASE … TO zydesk_app`, y luego, conectado a la nueva base, las cuatro sentencias de esquema de `01-roles.sql` (`ALTER SCHEMA public OWNER TO zydesk_owner`, `GRANT USAGE`, los dos `ALTER DEFAULT PRIVILEGES`). Rechaza correr con `NODE_ENV=production`.
- Uso por agente (Windows y Linux): `npm run db:test:crear -- 2d` una vez y luego `npx cross-env TEST_BD_SUFIJO=2d npm run test -w @zydesk/api`. Las migraciones las aplica `prepararBd()` como siempre.
- Test `env.test.ts`: con `TEST_BD_SUFIJO=2d` y `TEST_DATABASE_URL=postgres://a:b@localhost:5433/zydesk_test`, `env.TEST_DATABASE_URL` termina en `/zydesk_test_2d`; sufijo inválido (`2D!`) lanza.

## 2. Versiones nuevas (mayor fijado; última estable del mayor)

| Paquete | Mayor | Dónde | Para |
|---|---|---|---|
| `multer` (+ `@types/multer`) | 2 | api | multipart a disco temporal (ADR 0009) |
| `file-type` | 19 o superior (ESM) | api | MIME real por contenido |
| `mailparser` (+ `@types/mailparser`) | 3 | api | `.eml` |
| `@kenjiuno/msgreader` | 1 | api | `.msg` |
| `html-to-text` (+ `@types/html-to-text`) | 9 | api | cuerpo HTML → texto |
| `@dnd-kit/core` · `@dnd-kit/utilities` | 6 · 3 | web | Kanban |
| `browser-image-compression` | 2 | web | fotos antes de subir |
| shadcn vía CLI: `textarea`, `popover`, `command`, `progress`, `scroll-area` | — | web | redactor, menciones, filtros |

Si `file-type` no reconoce `.msg` como `application/vnd.ms-outlook` (lo detecta como `application/x-cfb`) se acepta `x-cfb` **solo** cuando la extensión declarada es `.msg` y `msgreader` logra abrirlo (§4.3). Si algún paquete no soporta ESM/Node 22 o no instala en Windows, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 2B)

### 3.1 Migraciones (SQL a mano; `down` inverso; ninguna inserta datos)

7. `1791000000007-archivos`: `archivo`.
8. `1791000000008-tickets`: `ticket`, `ticket_responsable`, `ticket_seguidor`, `correo_adjunto` + `ALTER TABLE archivo ADD CONSTRAINT … FOREIGN KEY (origen_correo_id) REFERENCES correo_adjunto(id) ON DELETE SET NULL`.
9. `1791000000009-actividad`: `tarea`, `mensaje`, `mencion`, `registro_horas` + `ALTER TABLE archivo ADD COLUMN mensaje_id integer NULL REFERENCES mensaje(id) ON DELETE CASCADE`.

Convenciones de la Fase 1 (`identity`, `timestamptz`, `text`, `citext` para correos, `numeric` con `numericoANumero`). Todas las columnas `*_id` hacia `usuario` son `ON DELETE SET NULL` salvo indicación (los usuarios no se borran).

```sql
archivo (                                         -- ADR 0009
  id identity PK,
  entidad text NULL CHECK (entidad IN ('ticket')),  -- NULL = pendiente (subida en dos pasos); Fase 3 agrega 'ot'
  entidad_id integer NULL,
  mensaje_id integer NULL,                        -- se agrega en la migración 9
  categoria text NOT NULL CHECK (categoria IN ('foto','documento','correo')),
  nombre_original text NOT NULL, tipo_mime text NOT NULL, tamano integer NOT NULL CHECK (tamano > 0),
  clave text NOT NULL UNIQUE,                     -- aaaa/mm/<uuid>.<ext> en ARCHIVOS_DIR
  origen_correo_id integer NULL,                  -- adjunto interno extraído de un correo (migración 8)
  subido_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  subido_en timestamptz NOT NULL DEFAULT now()
)  -- índices: (entidad, entidad_id), (subido_por, subido_en), parcial (subido_en) WHERE entidad IS NULL

ticket (
  id identity PK,
  numero integer NOT NULL UNIQUE, codigo text NOT NULL UNIQUE,            -- ADR 0006/0014
  asunto text NOT NULL, descripcion text NULL,
  cliente_id integer NULL REFERENCES cliente(id) ON DELETE SET NULL,
  solicitante_nombre text NULL, solicitante_correo citext NULL,
  origen text NOT NULL CHECK (origen IN ('externo','interno')),
  prioridad text NOT NULL CHECK (prioridad IN ('urgente','alta','media','baja')),
  categoria_id integer NULL REFERENCES categoria(id) ON DELETE SET NULL,
  estado text NOT NULL CHECK (estado IN ('nuevo','en_curso','en_espera','resuelto','descartado','duplicado')),
  espera_de text NULL CHECK (espera_de IN ('cliente','proveedor','repuesto','aprobacion')), espera_detalle text NULL,
  motivo_cierre text NULL,
  duplicado_de_id integer NULL REFERENCES ticket(id) ON DELETE SET NULL,
  inicio_planificado timestamptz NULL, fecha_limite timestamptz NULL, respuesta_limite timestamptz NULL,
  primera_respuesta_en timestamptz NULL,
  horas_estimadas numeric(6,2) NULL CHECK (horas_estimadas >= 0),
  creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en, actualizado_en, cerrado_en timestamptz NULL, archivado_en timestamptz NULL,
  CHECK (estado <> 'en_espera' OR espera_de IS NOT NULL),
  CHECK (estado <> 'descartado' OR motivo_cierre IS NOT NULL),
  CHECK (estado <> 'duplicado' OR duplicado_de_id IS NOT NULL),
  CHECK ((estado IN ('resuelto','descartado','duplicado')) = (cerrado_en IS NOT NULL))
)  -- índices: (estado, archivado_en), (fecha_limite), (cliente_id), (creado_en desc), gin trigram NO (ILIKE basta a esta escala)
ticket_responsable ( ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE, usuario_id integer NOT NULL REFERENCES usuario(id), principal boolean NOT NULL DEFAULT false, PRIMARY KEY (ticket_id, usuario_id) )
  -- CREATE UNIQUE INDEX ticket_responsable_principal_uq ON ticket_responsable (ticket_id) WHERE principal
ticket_seguidor ( ticket_id … CASCADE, usuario_id … REFERENCES usuario(id), PRIMARY KEY (ticket_id, usuario_id) )
correo_adjunto (                                  -- ADR 0009
  id identity PK, ticket_id integer NOT NULL UNIQUE REFERENCES ticket(id) ON DELETE CASCADE,
  archivo_id integer NULL REFERENCES archivo(id) ON DELETE SET NULL,   -- original (.eml/.msg o .txt del texto pegado)
  origen text NOT NULL CHECK (origen IN ('eml','msg','texto')),
  de text NULL, para text NULL, fecha timestamptz NULL, asunto text NULL, cuerpo text NOT NULL DEFAULT ''
)
tarea (
  id identity PK, ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,   -- Fase 3: ticket_id pasa a NULL y se agrega ot_id
  titulo text NOT NULL, responsable_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL, fecha date NULL,
  hecha boolean NOT NULL DEFAULT false, hecha_en timestamptz NULL, orden integer NOT NULL,
  creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL, creado_en, actualizado_en
)  -- índice (ticket_id, orden)
mensaje (
  id identity PK, ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,   -- Fase 3: NULL + ot_id + copiado_desde_id
  tipo text NOT NULL CHECK (tipo IN ('seguimiento','nota_interna')),
  autor_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  texto text NOT NULL, horas numeric(5,2) NULL CHECK (horas > 0), creado_en
)  -- índice (ticket_id, creado_en)
mencion ( mensaje_id integer NOT NULL REFERENCES mensaje(id) ON DELETE CASCADE, usuario_id integer NOT NULL REFERENCES usuario(id), PRIMARY KEY (mensaje_id, usuario_id) )
registro_horas (                                  -- B5; la planilla completa es Fase 5
  id identity PK, usuario_id integer NOT NULL REFERENCES usuario(id), fecha date NOT NULL,
  ticket_id integer NULL REFERENCES ticket(id) ON DELETE SET NULL,   -- Fase 3 agrega ot_id; Fase 5 permite ambos NULL ("Sin ticket")
  mensaje_id integer NULL REFERENCES mensaje(id) ON DELETE SET NULL,
  horas numeric(5,2) NOT NULL CHECK (horas > 0 AND horas <= 24), fuera_de_horario boolean NOT NULL DEFAULT false,
  descripcion text NULL, creado_en, actualizado_en
)  -- índices: (usuario_id, fecha), (ticket_id)
```

`evento` no cambia: `entidad = 'ticket'`, `entidad_id = id` como texto. `entidades.ts` registra `Archivo`, `Ticket`, `TicketResponsable`, `TicketSeguidor`, `CorreoAdjunto`, `Tarea`, `Mensaje`, `Mencion`, `RegistroHoras`.

### 3.2 Variables de entorno nuevas (`.env.example`)

```dotenv
# Archivos en disco (ADR 0009); ruta relativa a la raíz del repo o absoluta. `datos/` está en .gitignore
ARCHIVOS_DIR=./datos/archivos
# Solo tests de la API: si falta, se usa un directorio temporal por proceso
TEST_ARCHIVOS_DIR=
# Solo para `npm run db:test:crear` (base de test por bloque, spec fase-2 §1.1)
TEST_BD_SUFIJO=
```

`env.ts`: `ARCHIVOS_DIR: z.string().default('./datos/archivos')` resuelta con `path.resolve(raízDelRepo, valor)`; `TEST_ARCHIVOS_DIR` opcional; en `NODE_ENV=test` `crearStorage()` usa `TEST_ARCHIVOS_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'zydesk-archivos-'))`. `.gitignore` añade `datos/`.

### 3.3 `packages/shared`

```ts
// enums/ticket.ts
export const ESTADOS_TICKET = ['nuevo','en_curso','en_espera','resuelto','descartado','duplicado'] as const;  export type EstadoTicket
export const ESTADOS_TICKET_CERRADOS = ['resuelto','descartado','duplicado'] as const;
export const ETIQUETA_ESTADO_TICKET = { nuevo: 'Nuevo', en_curso: 'En curso', en_espera: 'En espera', resuelto: 'Resuelto', descartado: 'Descartado', duplicado: 'Duplicado' }
export const ESPERA_DE = ['cliente','proveedor','repuesto','aprobacion'] as const;  ETIQUETA_ESPERA_DE = { cliente: 'cliente', proveedor: 'proveedor', repuesto: 'repuesto', aprobacion: 'aprobación' }
export const ORIGENES_TICKET = ['externo','interno'] as const;
export const TIPOS_MENSAJE = ['seguimiento','nota_interna'] as const;
export const CATEGORIAS_ARCHIVO = ['foto','documento','correo'] as const;

// estados/ticket.ts  (ADR 0004)
export function esCerrado(e: EstadoTicket): boolean
export function transicionesDesde(e: EstadoTicket): EstadoTicket[]     // abierto → los otros 5; cerrado → ['en_curso']
export function puedeTransicionar(desde: EstadoTicket, hasta: EstadoTicket): boolean   // desde ≠ hasta y hasta ∈ transicionesDesde(desde)
export const CambioEstadoTicket = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('nuevo') }),
  z.object({ estado: z.literal('en_curso') }),
  z.object({ estado: z.literal('en_espera'), espera_de: z.enum(ESPERA_DE), espera_detalle: texto(120).optional() }),
  z.object({ estado: z.literal('resuelto') }),
  z.object({ estado: z.literal('descartado'), motivo: texto(500) }),
  z.object({ estado: z.literal('duplicado'), duplicado_de_id: id }),
]);
export type CambioEstadoTicketDatos
```

Tests `estados/ticket.test.ts`: tabla de las 6×6 combinaciones (`puedeTransicionar`), `transicionesDesde('resuelto')` = `['en_curso']`, el esquema rechaza `en_espera` sin `espera_de` y `descartado` sin `motivo`.

```ts
// esquemas/archivo.ts
ArchivoSalida = { id, nombre_original: string, tipo_mime: string, tamano: number, categoria: z.enum(CATEGORIAS_ARCHIVO), url: string /* /api/archivos/:id */, es_imagen: boolean, subido_por: referencia|null, subido_en: instante, origen_correo: boolean }
ArchivosPendientesQuery = {}   // GET /api/archivos/pendientes no lleva query

// esquemas/correo.ts
CorreoParsearEntrada = z.union([ { archivo_id: id }, { texto: z.string().trim().min(1).max(200_000) } ])
AdjuntoCorreo = { indice: z.number().int().min(0), nombre: string, tamano: number, tipo_mime: string, permitido: boolean /* pasa la lista MIME y ≤ 20 MB */ }
CorreoParseadoSalida = { origen: z.enum(['eml','msg','texto']), de: string|null, para: string|null, fecha: instante|null, asunto: string|null, cuerpo_texto: string, adjuntos: AdjuntoCorreo[], solicitante_sugerido: { nombre: string|null, correo: string|null } }
CorreoAdjuntoSalida = { id, origen, de, para, fecha, asunto, cuerpo, archivo: ArchivoSalida|null, adjuntos: ArchivoSalida[] /* extraídos */ }

// esquemas/ticket.ts
UsuarioBreve = { id, nombre: string, iniciales: string, color_avatar: string }
Responsable = UsuarioBreve & { principal: boolean }
ClienteBreve = { id, nombre: string, es_interno: boolean }
TicketBase = { asunto: texto(200), descripcion: texto(20_000).nullable(), cliente_id: id.nullable(), solicitante_nombre: texto(120).nullable(), solicitante_correo: correo.nullable(),
               origen: z.enum(ORIGENES_TICKET), prioridad: z.enum(PRIORIDADES), categoria_id: id.nullable(),
               inicio_planificado: instante.nullable(), fecha_limite: instante.nullable(), horas_estimadas: z.number().min(0).max(9999).multipleOf(0.25).nullable() }
TicketCrearEntrada = TicketBase.extend({
  responsable_principal_id: id.nullable().default(null), responsables_ids: z.array(id).max(10).default([]), seguidores_ids: z.array(id).max(20).default([]),
  archivo_ids: z.array(id).max(10).default([]),                              // pendientes propios (fotos/documentos del ticket)
  correo: z.union([ { archivo_id: id, adjuntos_indices: z.array(z.number().int().min(0)).max(10).default([]) }, { texto: z.string().trim().min(1).max(200_000) } ]).nullable().default(null),
}).refine(fecha_limite null o inicio_planificado null o fecha_limite > inicio_planificado).refine(responsables_ids no contiene al principal; sin repetidos)
TicketEditarEntrada = TicketBase.partial()                                  // PATCH; misma regla de fechas si vienen ambas
ResponsablesEntrada = { principal_id: id.nullable(), otros_ids: z.array(id).max(10) }   // reemplaza el conjunto; si principal_id es null, otros_ids debe ser []
SeguidoresEntrada = { usuario_ids: z.array(id).max(20) }
TicketResumen = { id, numero: number, codigo: string, asunto: string, cliente: ClienteBreve|null, estado: z.enum(ESTADOS_TICKET), espera_de: z.enum(ESPERA_DE)|null, espera_detalle: string|null,
                  prioridad, responsables: Responsable[] /* principal primero */, fecha_limite: instante|null, inicio_planificado: instante|null, vencido: boolean, vence_hoy: boolean,
                  tiene_correo: boolean, n_mensajes: number /* B11 */, motivo_cierre: string|null, duplicado_de: { id, codigo }|null,
                  tipo: z.enum(['ticket','ot_facturable','ot_interna']) /* siempre 'ticket' en Fase 2 */, ot_vinculada: { id, codigo: string, tipo: z.enum(['facturable','interna']) }.nullable() /* null en Fase 2 */,
                  creado_en, actualizado_en, cerrado_en: instante|null, archivado_en: instante|null }
TicketSalida = TicketResumen & TicketBase & { categoria: referencia|null, seguidores: UsuarioBreve[], respuesta_limite: instante|null, primera_respuesta_en: instante|null,
                  correo: CorreoAdjuntoSalida|null, archivos: ArchivoSalida[] /* del ticket, sin los de mensajes ni el correo */, tareas: TareaSalida[], creado_por: referencia|null, ots: z.array(z.never()) /* Fase 3 */ }
TicketsQuery = esquemaPaginacion.extend({ q: texto(80).optional(), estado: csv(ESTADOS_TICKET).optional(), prioridad: csv(PRIORIDADES).optional(), responsable_id: id.optional(), solo_mios: z.enum(['true','false']).optional(),
                  sin_asignar: z.enum(['true','false']).optional(), cliente_id: id.optional(), categoria_id: id.optional(), archivados: z.enum(['true','false']).default('false'), vencen_hoy, vencidos: z.enum(['true','false']).optional(),
                  orden: z.enum(['-actualizado_en','-creado_en','fecha_limite','prioridad']).default('-actualizado_en') })
  // csv(valores) = z.string().transform(s => s.split(',')).pipe(z.array(z.enum(valores)).min(1)) — en esquemas/comunes.ts
TableroQuery = TicketsQuery.omit({ pagina, por_pagina, estado, archivados, orden })
EventoTicketSalida = { id: number, creado_en, autor: referencia|null, accion: string, campo: string|null, valor_anterior: string|null, valor_nuevo: string|null, datos: z.record(z.string(), z.unknown()).nullable() }
ActividadQuery = { tipo: z.enum(['todo','seguimiento','nota_interna','historial']).default('todo') }
ActividadItem = z.discriminatedUnion('tipo', [ { tipo: 'mensaje', creado_en, mensaje: MensajeSalida }, { tipo: 'evento', creado_en, evento: EventoTicketSalida } ])
ActividadSalida = { items: ActividadItem[], conteos: { todo: number, seguimiento: number, nota_interna: number, historial: number } }

// esquemas/mensaje.ts
MensajeEntrada = { tipo: z.enum(TIPOS_MENSAJE), texto: texto(20_000), archivo_ids: z.array(id).max(10).default([]), mencionados_ids: z.array(id).max(20).default([]), horas: z.number().min(0.25).max(24).multipleOf(0.25).nullable().default(null) }
MensajeSalida = { id, ticket_id: id, tipo, autor: UsuarioBreve|null, texto: string, horas: number|null, archivos: ArchivoSalida[], mencionados: UsuarioBreve[], creado_en }

// esquemas/tarea.ts
TareaEntrada = { titulo: texto(200), responsable_id: id.nullable().default(null), fecha: fechaIso.nullable().default(null) }
TareaEditarEntrada = TareaEntrada.partial().extend({ hecha: z.boolean().optional() })
TareaSalida = { id, ticket_id: id, titulo: string, responsable: UsuarioBreve|null, fecha: fechaIso|null, hecha: boolean, hecha_en: instante|null, orden: number, vencida: boolean /* fecha < hoy (Santiago) y no hecha */, creado_en, actualizado_en }
```

`ClienteResumen` gana `tickets_abiertos: number` (tickets no cerrados del cliente). Códigos nuevos en `shared/errores.ts`: `TRANSICION_INVALIDA: 409`, `OT_ABIERTA: 409` (se declara ahora, lo lanza la Fase 3), `TICKET_CERRADO: 409`, `ARCHIVO_NO_PERMITIDO: 400`, `ARCHIVO_MUY_GRANDE: 413`, `DEMASIADOS_ARCHIVOS: 400`, `CORREO_ILEGIBLE: 400`.

### 3.4 Fábricas nuevas (`test/fabricas.ts`)

`crearTicket({ estado?, prioridad?, cliente_id?, categoria_id?, principal_id?, otros_ids?, fecha_limite?, cerrado_en?, archivado_en?, creado_por? })` inserta directo con `numero` secuencial desde 5000 y `codigo = TK-<numero>` (no pasa por el contador) y devuelve la fila; `crearMensaje(ticket_id, { tipo?, autor_id, texto?, horas? })`; `crearTarea(ticket_id, { titulo?, responsable_id?, fecha?, hecha? })`; `crearArchivoPendiente(subido_por, { nombre?, tipo_mime?, contenido?: Buffer })` escribe un archivo real en el `Storage` de test y la fila; `archivoDePrueba(nombre)` lee `apps/api/test/fixtures/<nombre>` (ver §4.5).

## 4. Archivos y correo (bloque 2C, ADR 0009)

### 4.1 `Storage` (`integraciones/storage/`)

```ts
export interface Storage { guardar(origen: string /* ruta temporal */ | Buffer, ext: string): Promise<string /* clave */>; abrir(clave: string): Readable; ruta(clave: string): string; eliminar(clave: string): Promise<void>; existe(clave): Promise<boolean> }
export function crearStorage(dir: string): Storage      // StorageLocal: clave `${aaaa}/${mm}/${randomUUID()}${ext}`; mkdir -p; `guardar` mueve (rename) o escribe; `eliminar` ignora ENOENT
export const storage: Storage                             // instancia única con env.ARCHIVOS_DIR (o el de test)
```

`ext` viene de la lista permitida (nunca del nombre del usuario sin validar): se deriva del MIME detectado (`image/jpeg → .jpg`, …) y para `.eml/.msg/.txt/.csv` de la extensión declarada en minúsculas. La clave nunca contiene el nombre original.

### 4.2 Lista permitida y detección

`integraciones/archivos/mime.ts`: `MIME_PERMITIDOS`: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`, `application/zip`, Office (`application/msword`, `application/vnd.openxmlformats-officedocument.{wordprocessingml.document,spreadsheetml.sheet,presentationml.presentation}`, `application/vnd.ms-excel`), `message/rfc822` (.eml), `application/vnd.ms-outlook` (.msg), `text/plain`, `text/csv`. `detectarMime(rutaTemporal, nombreOriginal)`: `fileTypeFromFile`; si detecta un tipo → debe estar en la lista (o ser `application/x-cfb` con extensión `.msg`, que se registra como `application/vnd.ms-outlook`); si no detecta nada → solo se acepta con extensión `.eml`, `.txt` o `.csv` **y** contenido decodificable como UTF-8/Latin-1 sin bytes `0x00` en los primeros 8 KB (`.eml` → `message/rfc822`). Cualquier otro caso → 400 `ARCHIVO_NO_PERMITIDO` `{ nombre }`. `categoriaDe(mime)`: `image/*` → `foto`; `message/rfc822` y `vnd.ms-outlook` → `correo`; resto → `documento`.

### 4.3 Endpoints (`modulos/archivos/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `POST /api/archivos` | tickets.editar | multipart `archivos` (1–10, ≤ 20 MB c/u, `multer.diskStorage` en `os.tmpdir()`) | 201 `ArchivoSalida[]` | `multer` con `limits: { files: 10, fileSize: 20*1024*1024 }`; `LIMIT_FILE_SIZE` → 413 `ARCHIVO_MUY_GRANDE`, `LIMIT_FILE_COUNT` → 400 `DEMASIADOS_ARCHIVOS`; cada archivo: `detectarMime` → `storage.guardar` → fila con `entidad NULL`, `subido_por = actor`. Si uno falla, se eliminan los ya guardados de la petición y se responde el error (todo o nada). La ruta se declara con `ruta()` con `body: undefined` y `multer` como middleware previo dentro del `Router` (único caso: documentar en `ruta()` un `previos?: RequestHandler[]`). Temporales se borran siempre (`finally`). |
| `GET /api/archivos/pendientes` | tickets.editar | — | `ArchivoSalida[]` | los del actor con `entidad NULL` (para reanudar un formulario) |
| `GET /api/archivos/:id` | sesion | — | binario | ver 4.4 |
| `DELETE /api/archivos/:id` | tickets.editar | — | 204 | solo si `entidad IS NULL` y `subido_por = actor` (si no, 404: no revela existencia); borra fila y disco |

### 4.4 Descarga con permisos

`GET /api/archivos/:id`: 404 si no existe; si `entidad IS NULL` → solo `subido_por = actor` (si no, 404); si `entidad = 'ticket'` → cualquier usuario autenticado (todo rol lee tickets, B10). Cabeceras: `Content-Type` = `tipo_mime`; `Content-Length`; `Content-Disposition: inline` para `image/*` y `application/pdf`, `attachment` para el resto, con `filename*=UTF-8''<encodeURIComponent(nombre_original)>` y `filename="<ascii seguro>"`; `Cache-Control: private, max-age=3600`; `X-Content-Type-Options` lo pone Helmet. Se hace `stream.pipe(res)` desde `storage.abrir`. **Auditoría**: `registrarAuditoria(null, { accion: 'descarga_archivo', usuario_id, detalle: { archivo_id, entidad, entidad_id } })` **solo** cuando se sirve como `attachment` (documentos y correos); las imágenes y PDF que la galería muestra inline no se auditan (decisión §16).

Servicio compartido con otros módulos: `asociarArchivos(tx, ids: number[], destino: { entidad: 'ticket', entidad_id: number, mensaje_id?: number }, actor)`: verifica que todos existen, están pendientes y son del actor (si no → 400 `VALIDACION` `{ archivo_ids: ['Archivo no disponible'] }`) y hace el `UPDATE`. `archivosDe(m, entidad, entidad_id)` y `archivosDeMensajes(m, mensaje_ids[])` devuelven `ArchivoSalida[]`. `aSalida(fila)` fija `url = /api/archivos/${id}`, `es_imagen = tipo_mime.startsWith('image/')`.

### 4.5 Correo (`modulos/correos/` + `integraciones/correo/`)

```ts
export interface CorreoLeido { origen: 'eml'|'msg'|'texto'; de: string|null; para: string|null; fecha: Date|null; asunto: string|null; cuerpo_texto: string; adjuntos: Array<{ indice: number; nombre: string; tamano: number; tipo_mime: string; contenido: () => Promise<Buffer> }> }
export async function leerEml(ruta: string): Promise<CorreoLeido>      // mailparser simpleParser; de/para = `from.text`/`to.text`; cuerpo = text ?? htmlToText(html); adjuntos = attachments (sin los inline con contentId que aparecen en el HTML)
export async function leerMsg(ruta: string): Promise<CorreoLeido>      // @kenjiuno/msgreader: senderName/senderEmail → "Nombre <correo>"; recipients tipo 'to' → para; messageDeliveryTime → fecha; body ?? htmlToText(bodyHtml) ?? '' ; attachments con getAttachment(i)
export function leerTexto(texto: string): CorreoLeido                   // heurística ADR 0009 sobre las primeras 15 líneas: De:/From:, Para:/To:, Enviado:/Sent:/Fecha:/Date:, Asunto:/Subject: (insensible a mayúsculas, dos puntos obligatorio); lo demás → cuerpo; fecha con `Date.parse` y, si falla, null
export function solicitanteDesde(de: string|null): { nombre: string|null; correo: string|null }   // "Paula Herrera <p@x.cl>" → { nombre: 'Paula Herrera', correo: 'p@x.cl' }; solo correo → nombre null
export async function leerCorreo(entrada: { archivo: Archivo } | { texto: string }): Promise<CorreoLeido>   // despacha por tipo_mime; errores del parser → 400 CORREO_ILEGIBLE ("No se pudo leer el correo; pega el texto")
```

`cuerpo_texto` se **normaliza**: saltos `\r\n → \n`, se recortan espacios finales, máximo 20 000 caracteres (se corta con "…"). `html-to-text` con `wordwrap: false`, `selectors: [{ selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' }]`.

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `POST /api/correos/parsear` | tickets.editar | `CorreoParsearEntrada` | `CorreoParseadoSalida` | con `archivo_id`: debe ser pendiente del actor con `categoria = 'correo'` (si no, 404); no persiste nada; `adjuntos[].permitido` según la lista MIME por **extensión y tamaño** (el contenido se verifica al extraer) |

**Fixtures** (`apps/api/test/fixtures/`, generados por el programador, sin datos reales): `correo.eml` (RFC 822 con `From: Paula Herrera <pherrera@ejemplo.test>`, `To`, `Date`, `Subject: Error al emitir facturas desde el ERP`, cuerpo texto y un adjunto `captura.png` de 1×1 px), `correo-html.eml` (solo `text/html`), `correo.msg` (creado con la librería o tomado de los ejemplos de `@kenjiuno/msgreader` **si su licencia lo permite**; si no hay forma de generar un `.msg` sin Outlook, **detente y pregunta**: el test de `.msg` puede quedar como `it.skip` documentado), `correo.txt` (texto pegado con `De:`/`Para:`/`Enviado:`/`Asunto:`), `no-es-imagen.png` (bytes de un ejecutable con extensión .png), `foto.jpg`, `doc.pdf`.

### 4.6 Job `archivos.limpiar_huerfanos` (`core/jobs/archivos.ts`)

`registrarJobArchivos(boss)` (exportada desde `core/jobs/archivos.ts`, llamada desde `iniciarJobs` en `boss.ts`, bloque 2D): `createQueue` + `work` + `boss.schedule('archivos.limpiar_huerfanos', '0 4 * * *', {}, { tz: 'America/Santiago' })`. Handler exportado `limpiarHuerfanos()`: `SELECT id, clave FROM archivo WHERE entidad IS NULL AND subido_en < now() - interval '24 hours'`; por cada uno `storage.eliminar` y `DELETE`; log `info` con `job`, `job_id`, `duracion_ms`, `borrados`. Test: uno de hace 25 h se borra (fila y disco), uno de hace 1 h se conserva.

## 5. Tickets API (bloque 2D, `modulos/tickets/`)

### 5.1 Endpoints

| Método y ruta | Permiso | Entrada | Salida | Errores / notas |
|---|---|---|---|---|
| `GET /api/tickets` | sesion | `TicketsQuery` | paginado de `TicketResumen` | ver 5.2 |
| `GET /api/tickets/tablero` | sesion | `TableroQuery` | `TicketResumen[]` (sin paginar: todos los no archivados que cumplan los filtros) | el front agrupa por columna; Cerrados = cerrados no archivados |
| `GET /api/tickets/:id` | sesion | — | `TicketSalida` | 404 |
| `POST /api/tickets` | tickets.editar | `TicketCrearEntrada` | 201 `TicketSalida` | ver 5.3 |
| `PATCH /api/tickets/:id` | tickets.editar | `TicketEditarEntrada` | `TicketSalida` | 409 `TICKET_CERRADO` si `cerrado_en` no es null ("Reabre el ticket para editarlo"); `registrarCambios` con los campos de 5.5 |
| `POST /api/tickets/:id/cambiar-estado` | tickets.editar | `CambioEstadoTicket` | `TicketSalida` | ver 5.4 |
| `PUT /api/tickets/:id/responsables` | tickets.editar | `ResponsablesEntrada` | `TicketSalida` | usuarios deben existir y estar activos (400 `VALIDACION`); 409 `TICKET_CERRADO`; eventos `cambio` en `responsable_principal` y `responsables` (conjunto, nombres); B7: no recalcula fechas |
| `PUT /api/tickets/:id/seguidores` | tickets.editar | `SeguidoresEntrada` | `TicketSalida` | permitido en cerrados; evento `cambio` en `seguidores` |
| `GET /api/tickets/:id/actividad` | sesion | `ActividadQuery` | `ActividadSalida` | ver 6.3 (lo implementa 2E; 2D deja la ruta declarada llamando a `mensajes.service`) |

### 5.2 Listado y filtros (`listarTickets`, `listarTablero`)

Una consulta SQL con `LEFT JOIN cliente`, subconsultas para responsables (`json_agg` ordenado con el principal primero), `n_mensajes = (SELECT count(*) FROM mensaje WHERE ticket_id = t.id)` (B11: seguimientos + notas, no eventos), `tiene_correo = EXISTS(correo_adjunto)`, `duplicado_de` (join a `ticket` d). Filtros:

- `q`: si coincide con `^\d+$` o con el código exacto (`ILIKE`), busca `numero = $n OR codigo ILIKE $q`; si no, `asunto ILIKE %q% OR solicitante_nombre ILIKE %q% OR codigo ILIKE %q%` (ADR 0006: búsqueda por número insensible al prefijo).
- `estado` (lista), `prioridad` (lista), `responsable_id` (existe en `ticket_responsable`), `solo_mios=true` (actor es responsable **o** seguidor), `sin_asignar=true` (sin filas en `ticket_responsable`), `cliente_id`, `categoria_id`.
- `archivados`: `false` (defecto) → `archivado_en IS NULL`; `true` → `archivado_en IS NOT NULL` (pestaña "Archivados" de la Tabla).
- `vencen_hoy=true`: `fecha_limite` cae en el día de hoy en `America/Santiago` y no cerrado; `vencidos=true`: `fecha_limite < now()` y no cerrado (misma definición que ADR 0016).
- `orden`: `-actualizado_en` (defecto), `-creado_en`, `fecha_limite` (nulos al final), `prioridad` (urgente→baja con `CASE`, luego `fecha_limite`). Nunca por `numero` (ADR 0014).
- `vencido`/`vence_hoy` se calculan en SQL (`fecha_limite < now() AND cerrado_en IS NULL`; `(fecha_limite AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`).

`GET /api/tickets/tablero` reutiliza la misma consulta con `archivados=false`, sin paginar y con `orden` fijo: `prioridad` y luego `-actualizado_en`.

### 5.3 Crear (`crearTicket(actor, entrada)`) — un solo `enTransaccion`

1. Validar referencias: `cliente_id` activo, `categoria_id` activa, usuarios (principal, otros, seguidores) activos → 400 `VALIDACION` por campo.
2. `siguienteNumero(tx, 'ticket', fuenteNumeros)` (§5.7) → `numero`, `codigo`.
3. **Correo** (si `entrada.correo`): `leerCorreo` (§4.5). Con `archivo_id`: debe ser pendiente del actor y `categoria = 'correo'`; se asocia al ticket (`asociarArchivos`). Con `texto`: se guarda el texto tal cual como archivo `.txt` (`text/plain`, `categoria = 'correo'`, `nombre_original = 'correo-pegado.txt'`, `subido_por = actor`) para que también sea descargable. Se inserta `correo_adjunto` con lo leído (`de, para, fecha, asunto, cuerpo` = `cuerpo_texto`). Adjuntos internos: por cada índice en `adjuntos_indices` se obtiene el `contenido()`, se valida con `detectarMime` (buffer temporal) y tamaño; se guarda como `archivo` del ticket con `origen_correo_id` y su `categoria`; un adjunto no permitido → 400 `ARCHIVO_NO_PERMITIDO` `{ nombre }` (toda la creación se revierte). El **autocompletado** es responsabilidad del front (§9.3): la API guarda lo que llega en `asunto`, `descripcion`, `solicitante_*`.
4. **Plazos** (ADR 0005, spec 4.1): calendario = departamento del `responsable_principal_id` → si no, del `responsable_defecto` de la categoría → si no, del actor → si ninguno tiene departamento, no se calcula. `desde = inicio_planificado ?? now()`. Si `entrada.fecha_limite` es null y hay categoría y calendario: `fecha_limite = sumarPlazo(desde, categoria.plazo_resolucion[prioridad], cal)`. `respuesta_limite = sumarPlazo(desde, categoria.plazo_respuesta, cal)` siempre que haya categoría y calendario (no lo envía el usuario). `horas_estimadas` se guarda tal cual (null si no viene: no se deriva). Si el usuario envía `fecha_limite`, se respeta.
5. `INSERT ticket` con `estado = 'nuevo'`, `creado_por = actor`; responsables (principal + otros); seguidores; `asociarArchivos(entrada.archivo_ids, ticket)`.
6. `registrarEvento(tx, { entidad: 'ticket', entidad_id, actor, accion: 'creado', datos: { desde_correo: boolean, adjuntos_extraidos: n, codigo } })`.
7. Devolver `cargarTicket(tx, id)`.

Si no hay `responsable_principal_id` pero la categoría tiene `responsable_defecto` **no** se asigna automáticamente (la spec dice "responsable por defecto" para la categoría; el front lo **propone** en el formulario y la persona confirma). Ver §16.

### 5.4 Cambiar estado (`cambiarEstado(actor, id, payload)`) — ADR 0004

1. Cargar con `FOR UPDATE`. `puedeTransicionar(actual, payload.estado)` o 409 `TRANSICION_INVALIDA` `{ desde, hasta, permitidas: transicionesDesde(actual) }`.
2. `resuelto`: `const abiertas = await otsAbiertas(tx, id)` (§6.6); si `abiertas.length > 0` → 409 `OT_ABIERTA` `{ ots: abiertas }`. En Fase 2 siempre `[]`.
3. `duplicado`: `duplicado_de_id` debe existir, ser distinto de `id`, no estar en estado `duplicado` (B14) → 400 `VALIDACION` `{ duplicado_de_id: ['…'] }`.
4. `UPDATE`: `estado`; `espera_de/espera_detalle` (solo en `en_espera`, si no `NULL`); `motivo_cierre` (`descartado` → `motivo`; `duplicado` → `Duplicado de TK-xxxx`; si no `NULL`); `duplicado_de_id`; `cerrado_en = now()` al entrar a un cerrado, `NULL` al salir (reabrir); `archivado_en = NULL` al reabrir; `primera_respuesta_en = now()` si es null y el nuevo estado es `en_curso` (la primera toma del ticket cuenta como respuesta; también la fija el primer seguimiento, §6.1); `actualizado_en = now()`.
5. Un solo evento `cambio` con `campo = 'estado'`, `valor_anterior/valor_nuevo` = etiquetas ("Nuevo" → "En curso") y `datos` = payload sin `estado` (`{ espera_de, espera_detalle }`, `{ motivo }`, `{ duplicado_de_id, duplicado_de_codigo }`) o `null`. Reabrir no lleva acción propia: es `cambio estado "Resuelto" → "En curso"`.

### 5.5 Campos rastreados por `registrarCambios` (PATCH, responsables, seguidores)

`asunto`, `descripcion` (etiqueta: primeros 120 caracteres + "…"), `cliente` (nombre), `solicitante` (`"Nombre <correo>"`), `origen`, `prioridad` (etiqueta), `categoria` (nombre), `inicio_planificado`, `fecha_limite`, `horas_estimadas` (fechas con `formatearFechaHora` de `shared` en Santiago; horas como `"3,5 h"`), `responsable_principal` (nombre), `responsables` (nombres ordenados, unidos con ", "), `seguidores` (ídem). Cada uno es un `cambio` separado (ADR 0003). El servicio arma `antes`/`despues` con valores ya resueltos (nombres), para que el historial no dependa de joins.

### 5.6 Job `tickets.archivar` (`core/jobs/archivar.ts`)

`boss.schedule('tickets.archivar', '10 3 * * *', {}, { tz: 'America/Santiago' })` (10 min después de `mantencion.limpiar`). Handler `archivarCerrados()`: `UPDATE ticket SET archivado_en = now() WHERE cerrado_en < now() - interval '7 days' AND archivado_en IS NULL RETURNING id`; por cada id `registrarEvento(tx, { entidad: 'ticket', entidad_id, actor: { id: null }, accion: 'archivado' })` en una sola `enTransaccion`; log con `archivados`. Test: cerrado hace 8 días se archiva y genera evento; cerrado hace 2 días no; ya archivado no se toca.

### 5.7 Numeración conectada (`core/numeracion/fuente.ts`)

```ts
export const fuenteNumeros: FuenteNumeros = {
  ultimoUsado: 'ticket' → SELECT max(numero) FROM ticket (null si no hay); 'ot' → fuenteNumerosFase1.ultimoUsado (hasta Fase 3)
  usados:      'ticket' → SELECT count(*) FROM ticket WHERE numero >= contador.inicial;  'ot' → fase 1
  existe:      'ticket' → SELECT 1 FROM ticket WHERE numero = $1;  'ot' → false
}
```

`configuracion.service.ts` y `crearTicket` usan `fuenteNumeros` (la de Fase 1 deja de ser el valor por defecto: `siguienteNumero(tx, clave, fuente)` pasa a exigir el parámetro). Tests: crear dos tickets → `TK-1000`, `TK-1001`; con modo `aleatorio` (`UPDATE contador` en el test) el número cae en `[inicial, 10^digitos)` y no repite; `PUT /api/config/numeracion` con `inicial ≤ MAX(numero)` → 400 `NUMERACION_INICIAL_MENOR` ahora con tickets reales; una creación que falla después de `siguienteNumero` (p. ej. usuario inexistente) no consume número.

### 5.8 Clientes (cambio menor en `clientes.service.ts`)

`ClienteResumen.tickets_abiertos` (`count(*) FROM ticket WHERE cliente_id = c.id AND cerrado_en IS NULL`). La ficha usa `GET /api/tickets?cliente_id=…&archivados=…` (no se agrega nada a `ClienteSalida`). `DELETE contacto` no cambia.

## 6. Actividad, tareas y horas API (bloque 2E)

### 6.1 Mensajes (`modulos/mensajes/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `POST /api/tickets/:id/mensajes` | tickets.editar | `MensajeEntrada` | 201 `MensajeSalida` | permitido en tickets cerrados y archivados (una nota o un seguimiento tardío no reabre nada); `mencionados_ids` deben ser usuarios activos (400); `INSERT mensaje` → `asociarArchivos(archivo_ids, { entidad: 'ticket', entidad_id, mensaje_id })` → `INSERT mencion` por cada mencionado (sin avisos: Fase 6) → si `horas`: `INSERT registro_horas (usuario_id = actor, fecha = hoy en Santiago, ticket_id, mensaje_id, horas, fuera_de_horario = false, descripcion = null)` (B5) → si `tipo = 'seguimiento'` y `ticket.primera_respuesta_en IS NULL`: `UPDATE ticket SET primera_respuesta_en = now()` → `UPDATE ticket SET actualizado_en = now()`. Sin `evento` (el mensaje es el registro; §16). |
| `GET /api/tickets/:id/mensajes` | sesion | `{ tipo?: z.enum(TIPOS_MENSAJE) }` | `MensajeSalida[]` por `creado_en` asc | las notas internas las ve todo rol, incluido `lectura` (B10) |

El texto se guarda tal cual (texto plano; el front lo muestra con `white-space: pre-wrap`, nunca como HTML ni Markdown). Las menciones viajan como ids (ADR 0008): la API no parsea `@` del texto.

### 6.2 Tareas (`modulos/tareas/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/tickets/:id/tareas` | sesion | — | `TareaSalida[]` por `orden` | |
| `POST /api/tickets/:id/tareas` | tickets.editar | `TareaEntrada` | 201 `TareaSalida` | 409 `TICKET_CERRADO`; `orden = max+1`; evento en el **ticket**: `tarea_creada` `{ tarea_id, titulo, responsable }` |
| `PATCH /api/tareas/:id` | tickets.editar | `TareaEditarEntrada` | `TareaSalida` | `hecha: true` → `hecha_en = now()`, evento `tarea_hecha`; `hecha: false` → `hecha_en = NULL`, evento `tarea_reabierta`; otros campos → `tarea_editada` `{ tarea_id, titulo, cambios: { campo: [antes, despues] } }`. Marcar/desmarcar se permite aunque el ticket esté cerrado; editar título/responsable/fecha no (409) |
| `DELETE /api/tareas/:id` | tickets.editar | — | 204 | 409 `TICKET_CERRADO`; evento `tarea_quitada` `{ tarea_id, titulo }` |

Todos los eventos de tareas se registran con `entidad = 'ticket'` y `entidad_id = ticket_id` (decisión §16: el historial del ticket es uno solo). En Fase 3 las tareas de OT registrarán con `entidad = 'ot'`.

### 6.3 Actividad (`GET /api/tickets/:id/actividad`, en `mensajes.service.ts`)

`items` = mensajes (`MensajeSalida`, con sus archivos y mencionados) ∪ eventos de `evento WHERE entidad = 'ticket' AND entidad_id = $id` (`EventoTicketSalida` con `autor` resuelto por join a `usuario`), ordenados por `creado_en` asc y, a igual instante, eventos antes que mensajes. `tipo=seguimiento|nota_interna` filtra mensajes de ese tipo; `historial` solo eventos; `todo` todo. `conteos` siempre se calculan sobre el total (para las pestañas). Sin paginar (decisión §16).

### 6.4 Horas (`modulos/horas/`, mínimo)

Solo el servicio `registrarHorasDesdeMensaje(tx, { usuario_id, ticket_id, mensaje_id, horas })` y la entidad. **Sin rutas** en Fase 2 (la planilla y sus endpoints son Fase 5). La fecha es la de hoy en `America/Santiago` (`formatInTimeZone`-equivalente con `Intl.DateTimeFormat('en-CA', { timeZone: ZONA })`). Test: un seguimiento con `horas: 1.5` crea una fila con la fecha de hoy en Santiago y `mensaje_id`; sin `horas` no crea nada.

### 6.5 Menciones

Se guardan y salen en `MensajeSalida.mencionados`. Nada más en esta fase. Fase 6 publica `mencion` desde `crearMensaje` después del commit.

### 6.6 Preparado para la Fase 3 (OT)

- `tickets.service.ts` exporta `otsAbiertas(tx, ticket_id): Promise<Array<{ id: number; codigo: string; etapa: string }>>` que en Fase 2 devuelve `[]` con un comentario `// Fase 3: consulta ot WHERE ticket_id = $1 AND etapa NOT IN ('cerrada','cancelada') (ADR 0004)`. La Fase 3 solo reemplaza el cuerpo. El código `OT_ABIERTA` ya existe y el front ya trata el 409 (§9.4) mostrando el diálogo con la lista `detalles.ots`.
- `TicketResumen.tipo` y `ot_vinculada`, `TicketSalida.ots` existen con valores fijos; la Fase 3 los rellena sin cambiar esquemas de salida.
- `tarea`, `mensaje` y `registro_horas` tienen `ticket_id NOT NULL`; la Fase 3 lo relaja y agrega `ot_id` con un `CHECK` de exclusividad. `archivo.entidad` acepta `'ot'` en Fase 3 (`ALTER … DROP/ADD CONSTRAINT`).
- Botón "Convertir en OT" y tarjeta "OT vinculadas" en la pantalla 5: se dibujan deshabilitados con tooltip "Fase 3".

## 7. Eventos y auditoría generados en esta fase

| Acción | `evento` (`entidad = 'ticket'`) | `auditoria` |
|---|---|---|
| Crear ticket | `creado { desde_correo, adjuntos_extraidos, codigo }` | — |
| PATCH campos | `cambio` por campo de §5.5 | — |
| Cambiar estado (incl. reabrir) | `cambio` campo `estado` + `datos` del payload | — |
| Responsables / seguidores | `cambio` en `responsable_principal`, `responsables`, `seguidores` | — |
| Tareas | `tarea_creada`, `tarea_editada`, `tarea_hecha`, `tarea_reabierta`, `tarea_quitada` | — |
| Archivado automático | `archivado` (autor null) | — |
| Seguimiento / nota interna / horas / menciones | — (el `mensaje` es el registro) | — |
| Subir archivo / parsear correo | — | — |
| Descargar archivo como `attachment` | — | `descarga_archivo { archivo_id, entidad, entidad_id }` |

Garantía de cobertura (ADR 0003): test genérico `tickets/eventos.test.ts` que, para cada endpoint mutante de tickets y tareas (`POST /api/tickets`, `PATCH`, `cambiar-estado`, `PUT responsables`, `PUT seguidores`, `POST/PATCH/DELETE tareas`), ejecuta una petición válida y afirma que `count(*) FROM evento WHERE entidad='ticket' AND entidad_id=$id` **aumenta**; y que `POST mensajes` **no** lo aumenta.

## 8. Web: base y componentes (bloque 2F)

### 8.1 API del front (`features/tickets/api.ts`)

Funciones tipadas con `obtener`/`enviar`/`conQuery`: `tickets(query)`, `tablero(query)`, `ticket(id)`, `crearTicket`, `editarTicket`, `cambiarEstado`, `guardarResponsables`, `guardarSeguidores`, `actividad(id, tipo)`, `crearMensaje`, `tareas(id)`, `crearTarea`, `editarTarea`, `quitarTarea`, `parsearCorreo`, `subirArchivos(files: File[]) → fetch multipart` (sin `Content-Type` manual; con `X-Requested-With: Zydesk` y `credentials: 'same-origin'`; se agrega `enviarMultipart<T>(ruta, formData)` a `lib/api.ts`), `quitarArchivoPendiente`. Claves de TanStack Query: `['tickets', query]`, `['tablero', query]`, `['ticket', id]`, `['ticket', id, 'actividad', tipo]`, `['ticket', id, 'tareas']`. Tras cualquier mutación: `invalidateQueries(['ticket', id])`, `['tickets']`, `['tablero']`. `staleTime` 30 s; `refetchInterval` 60 s en Tablero y Tabla (ADR 0011).

### 8.2 Componentes de dominio nuevos (`components/dominio/`)

- `PillEstado({ estado, espera_de? })`: `Pill` con tono `nuevo→neutro`, `en_curso→acento`, `en_espera→en-espera` (texto "En espera · repuesto" si hay `espera_de`), `resuelto→resuelto`, `descartado→neutro` con `line-through`, `duplicado→neutro`. `PillPrioridad({ prioridad })`: `urgente/alta/media(acento)/baja(neutro)` con etiqueta. `PillTipo` ("Ticket" neutro; Fase 3 agrega OT).
- `Codigo({ children })`: `font-mono text-sm`. `FechaLimite({ fecha_limite, vencido, vence_hoy })`: "Hoy" en `text-urgente font-semibold` con ícono `triangle-alert` si vencido/vence hoy; si no, `formatearFecha` ("30 sep"); "Sin fecha" en `text-tinta-3`.
- `Avatares({ personas: UsuarioBreve[], max = 3 })`: pila de `Avatar` de 26 px con borde blanco y solapamiento −7 px, `title` con el nombre, "+N" si sobran; `<span class="sr-only">` con los nombres (accesibilidad).
- `SelectorPersonas({ valor, onChange, multiple, excluir?, etiqueta })`: `Popover` + `Command` (shadcn) con la lista de `GET /api/usuarios` (activos) mostrando `Avatar` + nombre + departamento; para responsables, un `SelectorResponsables` compone dos: **Principal** (uno) y **Otros responsables** (varios, excluye al principal).
- `SubidaArchivos({ archivos, onChange, acepta?, camara? })`: zona de arrastre + `input type="file" multiple` (con `accept="image/*" capture="environment"` cuando `camara`), lista de pendientes con miniatura (imágenes) o ícono por tipo, tamaño, botón quitar (llama `DELETE /api/archivos/:id`). Las imágenes se comprimen antes de subir con `browser-image-compression` (`maxWidthOrHeight: 2000, initialQuality: 0.8, useWebWorker: true`); errores 413/400 se muestran por archivo. Sube en cuanto se eligen y guarda los `ArchivoSalida` devueltos (subida en dos pasos).
- `Redactor({ ticketId, onEnviado })`: alternador **Seguimiento / Nota interna** (dos `button` con `aria-pressed`, el activo con fondo blanco y sombra, como el diseño); el contenedor cambia a `bg-nota-interna-fondo` con borde `nota-interna-borde` en modo nota y a `bg-superficie-suave` en seguimiento; texto de ayuda: "Avance oficial del ticket: qué se hizo, qué se acordó o qué respondió el cliente." / "Contexto solo para el equipo. No se incluye en reportes al cliente."; `Textarea` con placeholder "Registra un avance, acuerdo o respuesta del cliente…" / "Escribe una nota interna…"; **menciones**: al teclear `@` se abre un `Popover` anclado al textarea con la lista de personas filtrada por lo escrito tras `@`; al elegir, inserta `@Nombre Apellido ` y agrega el id a `mencionados_ids` (si luego el usuario borra el nombre del texto, el id se quita al enviar comparando con `@Nombre` presente); `SubidaArchivos` compacto con botón "Fotos" (cámara en móvil) y "Archivo"; campo **Horas** (`input type=number step=0.25 min=0.25 max=24`, ancho 90 px, sufijo "h", ayuda "Se registra en tu planilla de hoy"); botón primario "Registrar seguimiento" / "Guardar nota" deshabilitado sin texto; `Ctrl+Enter` envía. Tras enviar: limpiar, `onEnviado()`, toast "Seguimiento registrado" / "Nota guardada".
- `ListaTareas({ ticketId, tareas, cerrado })`: cabecera "Tareas · hechas/total" con barra de progreso (`Progress`, `aria-label`), fila por tarea: `Checkbox` (`aria-label="Tarea hecha: <título>"`), título (tachado y `text-tinta-3` si hecha), `Avatar` del responsable, fecha ("29 sep"; `text-urgente font-semibold` si `vencida`), botón quitar (`aria-label="Quitar tarea: <título>"`, `AlertDialog`); fila de alta al pie: input "Nueva tarea", `SelectorPersonas` (uno, opcional), fecha (`input type=date`), botón "Agregar" (Enter en el input agrega). Con `cerrado`, se ocultan alta y quitar; marcar sigue activo.
- `DialogoCambiarEstado({ ticket, estadoDestino?, abierto, onCerrar })`: `Dialog` con `RadioGroup`-like de estados permitidos (`transicionesDesde`), cada opción con `PillEstado`; según el elegido muestra los campos del payload (`Select` "¿De quién se espera?" + detalle opcional; `Textarea` motivo; buscador de ticket original con `GET /api/tickets?q=` que muestra código + asunto y excluye el propio y los duplicados); botón "Cambiar estado". Errores: 409 `TRANSICION_INVALIDA` → toast; 409 `OT_ABIERTA` → reemplaza el contenido por "Este ticket tiene OT abiertas" con la lista `detalles.ots` como enlaces a `/ots/:id` y texto "Cierra o cancela la OT primero" (Fase 3 lo activará; el código queda listo). Si el ticket está cerrado, solo ofrece "Reabrir (En curso)".
- `features/tickets/eventos.ts`: `describirEvento(e: EventoTicketSalida): { texto: string; cambio?: string }` para el historial: `creado` → "creó el ticket" (+ " desde un correo adjunto" si `datos.desde_correo`); `cambio` → "cambió {etiqueta del campo}" con `cambio = "${valor_anterior ?? '—'} → ${valor_nuevo ?? '—'}"` (campo `estado` con `datos.espera_de` → "… → En espera · repuesto"; `datos.motivo` se muestra en una segunda línea; `responsables` → "cambió los responsables"); `tarea_*` → "agregó la tarea «…»", "marcó hecha la tarea «…»", "reabrió la tarea «…»", "quitó la tarea «…»", "editó la tarea «…»"; `archivado` → "El sistema archivó el ticket". Test unitario con 8 casos.

### 8.3 Rutas y menú

`router.tsx`: `/tickets/:id` → `TicketDetallePage`; `/tickets/nuevo` acepta `?cliente_id=` y `?correo=1`. `menu.ts` no cambia. `TituloPagina` recibe también `codigo` opcional para poner "TK-1048 · Zydesk".

## 9. Pantalla 4 — Nuevo ticket (`features/tickets/pages/NuevoTicketPage.tsx`)

Ruta `/tickets/nuevo` (permiso `tickets.editar`; `lectura` ve `SinPermiso`). Diseño "Nuevo ticket": dos columnas a ≥ 1024 px (formulario 1fr + panel "Adjuntar correo" 380 px fijo a la derecha), una columna bajo (panel de correo **arriba**, colapsable, porque alimenta el formulario). Formulario RHF + `zodResolver(TicketCrearEntrada)`.

**Campos** (en este orden): Asunto (obligatorio); Descripción (`Textarea`, 6 filas); Cliente o área interna (`Select` con búsqueda: grupos "Clientes" y "Áreas internas" de `GET /api/clientes`; al elegir un área interna, `origen` pasa a `interno` automáticamente y viceversa, editable); Origen (`Select` Externo/Interno); Solicitante: nombre y correo; Prioridad (4 opciones con `PillPrioridad`, por defecto **Media**); Categoría (`Select`; al elegir, si no hay principal, se **propone** el `responsable_defecto` en el selector con el texto "Propuesto por la categoría" y la persona puede cambiarlo); Responsables (`SelectorResponsables`: Principal + Otros; por defecto el principal es **quien crea** si tiene departamento, salvo que la categoría proponga otro); Seguidores (`SelectorPersonas` múltiple); Inicio planificado (`input type=datetime-local`, opcional); Fecha límite (`datetime-local`, opcional) con **vista previa**: si está vacía y hay categoría + principal con departamento, muestra "Se calculará: vence el {fecha} ({plazo} hábiles desde {inicio ?? ahora})" usando `POST /api/plazos/calcular` con `departamento_id` del principal y `plazo_resolucion[prioridad]`; si no se puede calcular, "Sin fecha límite (elige responsable y categoría o escribe una)"; Horas estimadas (`number step=0.25`, opcional); Archivos (`SubidaArchivos`, "Fotos o documentos del ticket").

**Panel "Adjuntar correo"** (`components/PanelCorreo.tsx`): dos pestañas **Archivo** (arrastrar `.msg`/`.eml`, `accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"`, uno solo) y **Texto pegado** (`Textarea` "Pega aquí el correo completo, incluidos De/Para/Asunto"). Al soltar el archivo: `POST /api/archivos` → `POST /api/correos/parsear { archivo_id }`; al pegar: botón "Leer correo" → `parsear { texto }`. **Vista previa**: De · Para · Fecha · Asunto · cuerpo (scroll, `pre-wrap`, 240 px) y lista de **adjuntos internos** con `Checkbox` marcada por defecto si `permitido` (deshabilitada con "No permitido" si no) — solo para `.eml`/`.msg`. Botón **"Usar en el formulario"**: rellena `asunto` (si vacío o si el usuario confirma sobrescribir), `solicitante_nombre/correo` (de `solicitante_sugerido`), `descripcion` (cuerpo) y deja el panel en estado "Correo adjunto: nombre.msg · Quitar". Al enviar el formulario, `correo = { archivo_id, adjuntos_indices }` o `{ texto }`. Estados: leyendo ("Leyendo correo…"), 400 `CORREO_ILEGIBLE` → "No se pudo leer el archivo. Prueba pegando el texto.", 413/400 de subida → mensaje bajo la zona.

**Envío**: botón primario "Crear ticket" (y "Cancelar" → `/tickets`); enviando → "Creando…"; éxito → toast "Ticket TK-1052 creado" y navegar a `/tickets/:id`; 400 `VALIDACION` → errores por campo (`detalles.fieldErrors`); 409 `NUMERACION_AGOTADA` → mensaje global. Si se abandona la página con archivos pendientes no usados, no se hace nada (el job los limpia a las 24 h).

## 10. Pantalla 5 — Detalle de ticket (`features/tickets/pages/TicketDetallePage.tsx`)

Ruta `/tickets/:id`. Mobile-first (spec §7). A ≥ 1024 px: columna principal 1fr + panel derecho 320 px; bajo 1024 px: el panel se **apila debajo** de la actividad y el `Redactor` queda **fijo al pie** (`sticky bottom-0`, sobre la barra inferior de ADR 0019, con la cámara a un toque).

1. **Encabezado**: `Codigo` grande + `h1` asunto; línea con `PillEstado`, `PillPrioridad`, `FechaLimite` ("Vence 30 sep"), `Pill` "Correo adjunto" si `correo`, `Pill` "Archivado" si corresponde; botones: **"Cambiar estado"** (abre `DialogoCambiarEstado`), **"Editar"** (`Dialog` con `TicketEditarEntrada`: asunto, descripción, cliente, origen, solicitante, prioridad, categoría, fechas, horas), **"Convertir en OT"** (deshabilitado, tooltip "Fase 3"). Todo botón de escritura solo con `tickets.editar`.
2. **Descripción** (tarjeta, `pre-wrap`; "Sin descripción").
3. **Correo original** (si hay): tarjeta con De · Para · Fecha · Asunto, cuerpo colapsado a 6 líneas con "Ver completo", botón **"Descargar original"** (`<a href=url download>`), y "Adjuntos del correo" (lista con nombre, tamaño, descargar).
4. **Archivos del ticket**: galería (imágenes con `object-fit: cover` en cuadros de 96 px, `alt = nombre_original`, abren en nueva pestaña; documentos con ícono + nombre + tamaño). Incluye los de los mensajes con una etiqueta "en seguimiento del 29 sep".
5. **Tareas**: `ListaTareas`.
6. **Actividad**: `Tabs` (estado en URL `?actividad=`) **Actividad (N) · Seguimiento (N) · Notas internas (N) · Historial (N)** con los `conteos`; lista cronológica ascendente (lo más nuevo abajo, junto al redactor): mensajes como tarjetas (`Avatar`, nombre, `Pill` "Seguimiento" / "Nota interna · solo equipo" (tono ámbar y candado `lock`), hora `formatearFechaHora`, texto `pre-wrap`, "· 3 h registradas" si `horas`, miniaturas de sus archivos, `@menciones` resaltadas en `font-medium`); notas con `bg-nota-interna-fondo` + borde; eventos como línea discreta: `Avatar` pequeño o ícono `history`, "**Camila Rojas** cambió el estado" + chip `font-mono` con `cambio` ("Nuevo → En curso"), hora. Al cargar, `scrollIntoView` del último ítem. `Redactor` debajo (fijo en móvil).
7. **Panel derecho**: Estado (`PillEstado` + botón "Cambiar"), Prioridad (`Select` inline que hace `PATCH`), Responsables (`Avatares` + nombres, principal marcado "principal"; botón "Editar" → `Dialog` con `SelectorResponsables` → `PUT responsables`), Seguidores (ídem → `PUT seguidores`; botón "Seguir" / "Dejar de seguir" que agrega/quita al actor, solo `tickets.editar`), Solicitante (nombre · correo), Cliente (enlace a `/clientes/:id`), Categoría, Fecha límite, Inicio planificado, Horas estimadas, Primera respuesta ("registrada 28 sep 17:05" o "vence 28 sep 18:58"), Creado por · fecha; tarjeta **OT vinculadas** con `EstadoVacio` "Disponible en la Fase 3" y botón "Crear OT" deshabilitado.

Estados: `Cargando`; 404 → "Ticket no encontrado" con enlace al tablero; error → `EstadoError`; `lectura` ve todo (incluidas notas, B10) sin redactor ni botones de escritura, con texto "Solo lectura". Ticket cerrado: aviso superior "Cerrado el {fecha} · se archivará el {cerrado_en + 7 días}" o "Archivado el {fecha}", botón "Reabrir". Tras cada mutación: invalidar `['ticket', id]` y `['ticket', id, 'actividad']`.

## 11. Pantalla 1 — Tablero (`features/tickets/pages/TableroPage.tsx`, bloque 2G)

Ruta `/tickets`. Cabecera "Tablero" + botón "Nuevo ticket". **Barra de filtros** (estado en URL): búsqueda `q` (debounce 300 ms), Responsable (`SelectorPersonas` uno), Prioridad (multi), interruptor "Solo míos", (Tipo: deshabilitado "Fase 3"). Consulta `GET /api/tickets/tablero`.

**Columnas** (scroll horizontal bajo 1024 px, `min-w-[280px]` cada una): **Nuevo** (punto `baja-punto`), **En curso** (`acento`), **En espera** (`alta-punto`), **Cerrados** (`resuelto`, subtítulo "Se archivan a los 7 días"). Cabecera con nombre y contador. Columna vacía → "Sin tickets".

**Tarjeta** (`TarjetaTicket`, `article` con `aria-label="TK-1048 Error al emitir…"`): fila 1 `Codigo` + `PillPrioridad`; asunto (`font-medium`, 2 líneas máx.); cliente (`text-tinta-2`; "Sin cliente"); etiquetas: `mail` "Correo" si `tiene_correo`, `ot_vinculada` (Fase 3), "Espera: {espera_de}" en `en_espera`, en Cerrados `Pill` "Resuelto" / "Descartado · {motivo recortado}" (tachado) / "Duplicado de TK-1040"; pie: `Avatares` (o "Sin asignar" en `text-alta`), `FechaLimite`, `message-square` + `n_mensajes`. Toda la tarjeta es un `Link` a `/tickets/:id`; el menú **"Cambiar estado"** (`DropdownMenu` en el botón `⋯`, `aria-label="Acciones de TK-1048"`) lista `transicionesDesde(estado)` y abre `DialogoCambiarEstado` con el destino preseleccionado.

**Arrastrar y soltar** (`@dnd-kit/core`): `DndContext` con `PointerSensor` (`activationConstraint: { distance: 6 }`, para que el clic siga navegando) y `KeyboardSensor`; cada tarjeta `useDraggable` (deshabilitado sin `tickets.editar`), cada columna `useDroppable`. Al soltar en **Nuevo/En curso** → `cambiarEstado` directo (optimista: mover la tarjeta y revertir si falla). Soltar en **En espera** → `DialogoCambiarEstado` con `en_espera` preseleccionado (falta `espera_de`). Soltar en **Cerrados** (A7) → diálogo con selector Resuelto / Descartado / Duplicado y sus campos. Soltar en la misma columna: nada. Transición inválida → la tarjeta no se mueve y toast "No se puede pasar de X a Y". `DragOverlay` con la misma tarjeta a 3° de rotación y sombra. Anuncios `aria-live` de dnd-kit en español ("Tarjeta TK-1048 tomada", "soltada en En espera").

Tests (jsdom): agrupa 4 tarjetas en sus columnas; el menú de una tarjeta `nuevo` ofrece 5 estados; la tarjeta de `lectura` no tiene menú; `n_mensajes` y "Espera: repuesto" visibles.

## 12. Pantalla 2 — Tabla (`features/tickets/pages/TablaPage.tsx`, bloque 2G)

Ruta `/tickets/tabla`. Filtros rápidos como chips (URL): **Todos · Míos (`solo_mios`) · Sin asignar · Vencen hoy · Vencidos · Con OT (deshabilitado, "Fase 3") · Archivados (`archivados=true`)** con contador entre paréntesis (el contador de cada chip se obtiene con una petición `por_pagina=1` y leyendo `total`; se recalculan al cambiar `q`). Búsqueda `q`. **Agrupar por** (`Select`, URL `?agrupar=`): `prioridad` (defecto) · `estado` · `responsable` (principal; "Sin asignar") · `cliente` ("Sin cliente") · `ninguno`; la agrupación se hace en el cliente sobre la página actual (`por_pagina=100`). Cada grupo: cabecera con punto/pill y "N tickets", filas colapsables (estado local). Botón **"Exportar"** deshabilitado con tooltip "Disponible en la Fase 7".

Columnas: ID (`Codigo`, enlace) · Asunto + cliente debajo · Estado (`PillEstado`) · Prioridad (punto + texto) · Responsables (`Avatares`, "Sin asignar") · Tipo (`PillTipo`) · Vence (`FechaLimite`) · Actualizado (`FechaRelativa`: "hace 12 min", "ayer", "26 sep"; `title` con la fecha completa). Orden por columna con `?orden=` para las que la API soporta (Vence → `fecha_limite`, Prioridad → `prioridad`, Actualizado → `-actualizado_en`). Paginación al pie (`total`, "1–100 de 134", anterior/siguiente). Bajo 1024 px: scroll horizontal con la primera columna fija (`sticky left-0`). Fila con `⋯` → menú "Cambiar estado" (mismo diálogo) y "Abrir".

Tests: los chips cambian la URL; agrupar por estado produce cabeceras "En curso" etc.; `archivados=true` muestra la pestaña Archivados activa.

**Ficha de cliente** (`ClienteFichaPage`): tarjeta **Tickets** pasa de `EstadoVacio` a lista (`GET /api/tickets?cliente_id&por_pagina=20` con `Codigo`, asunto, `PillEstado`, `FechaLimite`) con enlace "Ver todos en la tabla" (`/tickets/tabla?cliente_id=`) y botón "Nuevo ticket para este cliente" **habilitado** (`/tickets/nuevo?cliente_id=`). La lista de clientes muestra "N tickets abiertos" bajo el nombre.

## 13. Semillas de desarrollo (bloque 2H, `database/semillas/desarrollo-tickets.ts`, llamada desde `desarrollo.ts`)

Idempotente por `codigo`. Inserta con `numero` explícito (sin pasar por el contador) y al final `UPDATE contador SET valor = GREATEST(valor, 1051) WHERE clave = 'ticket'`. Fechas relativas a "hoy" (Santiago) para que "Hoy"/"vencido" se vean al demostrar. Tickets de los diseños "Tablero" y "Tabla" (sin las etiquetas de OT, que llegan en Fase 3):

| Código | Asunto | Cliente | Estado | Prioridad | Responsables (principal primero) | Vence |
|---|---|---|---|---|---|---|
| TK-1051 | Servidor de archivos no responde en sucursal Temuco | Transportes Austral | nuevo | urgente | Diego Muñoz | hoy |
| TK-1050 | Solicitud de cotización: mantención preventiva de 12 equipos | Clínica Los Robles | nuevo | media | — | +2 d |
| TK-1049 | Alta de usuario para nueva contadora | Administración y Finanzas (interna) | nuevo | baja | Javiera Pérez | +5 d |
| TK-1048 | Error al emitir facturas desde el ERP | Viña Santa Clara | en_curso | alta | Sebastián Díaz, Camila Rojas | hoy |
| TK-1042 | Migración de correo a nuevo dominio | Constructora Andes | en_curso | alta | Camila Rojas, Matías Fuentes | +3 d |
| TK-1040 | Caída intermitente de VPN para equipo en terreno | Transportes Austral | en_curso | urgente | Diego Muñoz, Tomás Reyes | hoy |
| TK-1037 | Reemplazo de switch en bodega central | Operaciones (interna) | en_curso | media | Valentina Soto | +1 d |
| TK-1035 | Configurar respaldo semanal en NAS | Clínica Los Robles | en_curso | media | Ignacia Morales | +6 d |
| TK-1033 | Renovación de plataforma de respaldo | Constructora Andes | en_espera (aprobacion, "aprobación cliente") | media | Fernanda Castro | +6 d |
| TK-1028 | Revisión de cámaras de seguridad acceso norte | Viña Santa Clara | en_espera (repuesto) | alta | Tomás Reyes | +7 d |
| TK-1030 | Licencias de software de diseño por renovar | Marketing (interna) | en_espera (proveedor) | baja | Nicolás Vega | +9 d |
| TK-1026 | Impresora del piso 3 atasca papel | Oficina central (interna) | resuelto (cerrado ayer) | media | Sebastián Díaz | −2 d |
| TK-1047 | Oferta de proveedor reenviada al soporte | — | descartado ("No corresponde: publicidad de proveedor") | baja | Javiera Pérez | −1 d |
| TK-1024 | Restablecer acceso a portal de proveedores | Clínica Los Robles | resuelto (cerrado hace 2 d) | alta | Ignacia Morales, Javiera Pérez | −2 d |
| TK-1044 | VPN no conecta desde bodega | Transportes Austral | duplicado de TK-1040 (cerrado hace 3 d) | media | Diego Muñoz | −3 d |
| TK-1012 | Cableado estructurado oficina Temuco | Transportes Austral | resuelto, **archivado** (cerrado hace 20 d) | media | Tomás Reyes | −20 d |

Todos con `categoria` coherente (ERP / Facturación para TK-1048, Redes y VPN para TK-1040/1044/1051, etc.), `origen` según cliente, `creado_por` = Camila Rojas, `tiene_correo` en TK-1051, 1050, 1048, 1040, 1028, 1047, 1024 (se inserta `correo_adjunto` con `origen = 'texto'`, `archivo_id NULL`, remitente ficticio `@ejemplo.test`). **TK-1048** reproduce la pantalla "Ticket TK-1048": las 5 tareas (3 hechas/2 pendientes con fechas relativas), los mensajes y eventos del diseño en orden (2 seguimientos de Sebastián, 2 notas —una con mención a Sebastián y otra con "3 h"+"1 h" registradas como `registro_horas`—, cambios de estado/prioridad/responsables/fecha límite con sus eventos, **sin** los dos eventos de OT/COT), y `n_mensajes = 5` (spec del Tablero). Los demás tickets tienen entre 0 y 6 mensajes cortos para que los contadores del diseño cuadren aproximadamente. Test `desarrollo.test.ts`: tras sembrar dos veces hay 16 tickets, 1 archivado, TK-1048 tiene 5 tareas y 4 mensajes de actividad + eventos, y `contador.valor ≥ 1051`.

## 14. Pruebas de seguridad obligatorias (`modulos/tickets/seguridad.test.ts` + por módulo)

1. El **test genérico de permisos** de la Fase 1 sigue verde con todas las rutas nuevas (`lectura` → 403 en `POST /api/tickets`, `POST mensajes`, `POST tareas`, `POST /api/archivos`; 401 sin sesión).
2. **B10**: `lectura` → `GET /api/tickets/:id/actividad` incluye notas internas (200); `GET /api/archivos/:id` de un archivo del ticket → 200.
3. **Archivo pendiente ajeno**: `GET`/`DELETE /api/archivos/:id` de un pendiente de otro usuario → 404; `POST /api/tickets` con `archivo_ids` de otro → 400 `VALIDACION`.
4. **MIME falso**: `no-es-imagen.png` → 400 `ARCHIVO_NO_PERMITIDO`; `.exe` renombrado `.pdf` → 400; `.eml` con bytes nulos → 400. **Tamaño**: 20 MB + 1 byte → 413 `ARCHIVO_MUY_GRANDE` y no queda nada en disco ni en `archivo`. 11 archivos → 400 `DEMASIADOS_ARCHIVOS`.
5. **Nombre de archivo**: `nombre_original = '../../etc/passwd.pdf'` se guarda tal cual, la `clave` en disco es `aaaa/mm/<uuid>.pdf` y `Content-Disposition` lleva el nombre codificado (`filename*=UTF-8''`), sin `..` en la ruta real.
6. **Correo HTML**: `correo-html.eml` con `<script>` → `cuerpo_texto` sin etiquetas; la web lo renderiza como texto (test jsdom: el `<script>` aparece literal, no se ejecuta).
7. **Texto de mensaje**: `texto = '<img src=x onerror=alert(1)>'` se guarda y se devuelve igual; la vista lo muestra literal (test jsdom con `screen.getByText`).
8. **Estados**: `resuelto → descartado` → 409 `TRANSICION_INVALIDA`; `en_espera` sin `espera_de` → 400; `duplicado` de sí mismo y de un duplicado → 400 (B14); `descartado` sin `motivo` → 400.
9. **Cerrado**: `PATCH`, `POST tareas`, `DELETE tarea`, `PUT responsables` en un ticket resuelto → 409 `TICKET_CERRADO`; `POST mensajes` y marcar tarea → 200/201; reabrir → 200 y `archivado_en = NULL`.
10. **Eventos**: test genérico de cobertura de §7; `POST mensajes` no crea `evento`; `cambiar-estado` a `en_espera` guarda `datos.espera_de`.
11. **Numeración**: creación fallida no consume número; modo aleatorio no repite (100 creaciones con `digitos = 3`, `inicial = 100`).
12. **Plazos**: ticket con categoría (alta = 1 día hábil) y principal de "Soporte TI" creado el jueves 17-sep-2026 17:00 (Santiago) → `fecha_limite` = lunes 21-sep 17:00 (feriados 18 y 19); sin principal ni categoría → `fecha_limite = NULL`; `fecha_limite` enviada se respeta; cambiar el principal no la modifica (B7).
13. **Descarga auditada**: `GET` de un `.pdf` → fila `descarga_archivo` con `archivo_id`; `GET` de un `.jpg` (inline) → sin fila.
14. **Job de huérfanos** no borra pendientes recientes ni archivos asociados; **job de archivado** no toca abiertos.
15. **Logs**: subir un archivo y crear un mensaje no deja en el logger de test el `nombre_original` ni el `texto` (solo ids).
16. `X-Request-Id` presente en 413 y 409, y `evento.req_id` de un `cambiar-estado` coincide con la cabecera.

## 15. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit)

| Tarea | Bloque | Crea/edita | Criterio de aceptación |
|---|---|---|---|
| **F2-T1 Workflow de CI** | 2A | `.github/workflows/ci.yml`, `README.md` (sección "Integración continua") | Workflow según ADR 0020: `on: push` (todas las ramas) y `pull_request` a `main`; `permissions: contents: read`; `concurrency` por ref con `cancel-in-progress`; job `verificar` en `ubuntu-24.04`, `timeout-minutes: 20`, servicio `postgres:16-alpine` (`POSTGRES_USER/PASSWORD/DB = zydesk`, puerto `5433:5432`, healthcheck `pg_isready`); pasos: `actions/checkout` y `actions/setup-node` **fijados por SHA de commit** (resolver el SHA del último tag v4 de cada acción y dejar el tag como comentario `# v4.x.y`), `node-version-file: .nvmrc`, `cache: npm`; `npm ci`; `.env` generado con `cp .env.example .env` + `echo` de `SEMILLA_PASSWORD=Semilla.CI.Prueba.1` y `ADMIN_PASSWORD=Admin.CI.Prueba.1`; `PGPASSWORD=zydesk psql -h localhost -p 5433 -U zydesk -d zydesk -f docker/postgres-init/01-roles.sql` (instalar `postgresql-client` si `psql` falta); `npm run typecheck`, `lint`, `format:check`, `test`, `build`; `npm run api:openapi && git diff --exit-code docs/api/openapi.json`. Verificación: el workflow pasa en verde en la rama `feat/fase-2-tickets` (primer push); un commit que rompa un test lo pone en rojo. |
| **F2-T2 Contratos y migraciones** | 2B | `shared/src/{enums/ticket,estados/ticket,esquemas/{archivo,correo,ticket,mensaje,tarea},errores}.ts`, `comunes.ts` (`csv`), migraciones 7–9, entidades, `entidades.ts`, `env.ts`, `.env.example`, `.gitignore`, `cli.ts bd-test`, `fabricas.ts`, `test/fixtures/**` | `db:migrar` desde cero aplica 9; `db:revertir --todo` limpia; `estados/ticket.test.ts` y `esquemas.test.ts` (casos nuevos: `CambioEstadoTicket`, `TicketCrearEntrada` con fechas invertidas → error, `csv`) verdes; `npm run db:test:crear -- 2d` crea `zydesk_test_2d` y `TEST_BD_SUFIJO=2d` apunta a ella; fábricas crean filas válidas. |
| **F2-T3 Storage y subida** | 2C | `integraciones/storage/**`, `integraciones/archivos/mime.ts`, `modulos/archivos/**`, `ruta()` con `previos` | Endpoints §4.3–4.4 con tests; pruebas de seguridad 3, 4, 5, 13, 15; `curl -F "archivos=@foto.jpg" -H "X-Requested-With: Zydesk" -b cookie localhost:3010/api/archivos` → 201 y el archivo aparece en `datos/archivos/aaaa/mm/`. |
| **F2-T4 Correo** | 2C | `integraciones/correo/**`, `modulos/correos/**`, fixtures `.eml/.msg/.txt` | `leerEml`, `leerTexto`, `solicitanteDesde` con tests de tabla (≥ 8 casos); `leerMsg` con fixture o `it.skip` documentado; `POST /api/correos/parsear` en ambos modos; prueba 6; `CORREO_ILEGIBLE` con un `.eml` corrupto. |
| **F2-T5 Job de huérfanos** | 2C | `core/jobs/archivos.ts` (handler + `registrarJobArchivos(boss)`; **no** toca `boss.ts`, lo conecta F2-T10) | `limpiarHuerfanos` test §4.6. |
| **F2-T6 Tickets: crear, leer, editar, numeración** | 2D | `modulos/tickets/{ticket,…}.service.ts`, `tickets.routes.ts`, `core/numeracion/fuente.ts`, `configuracion.service.ts`, `app.ts` | `POST/GET/PATCH` con tests (plazos: prueba 12; eventos `creado` y `cambio`); §5.7 (dos tickets → 1000/1001; fallo no consume; aleatorio); `TICKET_CERRADO`; `GET /api/config/numeracion` refleja `usados` reales. |
| **F2-T7 Tickets: estados, responsables, seguidores** | 2D | `tickets.service.ts` (`cambiarEstado`, `otsAbiertas`, responsables, seguidores) | Pruebas 8, 9, 10; los 6 payloads; reabrir limpia `cerrado_en`/`archivado_en`/`motivo_cierre`; `PUT responsables` con principal inactivo → 400; B7 verificado. |
| **F2-T8 Listados y tablero** | 2D | `tickets.service.ts` (`listarTickets`, `listarTablero`), `clientes.service.ts` | Cada filtro de §5.2 con test (incl. `q=1048`, `q=TK-1048`, `q=facturas`, `vencidos`, `archivados`, `solo_mios` como seguidor); `n_mensajes`, `tiene_correo`, `vencido`, `vence_hoy` correctos; `tablero` excluye archivados; `ClienteResumen.tickets_abiertos`. |
| **F2-T9 Crear con correo** | 2D (+2C) | `tickets.service.ts` (paso 3 de §5.3) | Ticket desde `correo.eml` con 1 adjunto seleccionado → `correo_adjunto`, archivo original asociado, adjunto extraído con `origen_correo_id`, evento `creado { desde_correo: true, adjuntos_extraidos: 1 }`; desde texto → archivo `.txt` descargable; adjunto no permitido revierte toda la creación. |
| **F2-T10 Jobs de archivado y huérfanos conectados** | 2D | `core/jobs/archivar.ts`, `boss.ts` (registra `tickets.archivar` y llama a `registrarJobArchivos` de F2-T5) | Test §5.6; `npm run dev` registra las 3 colas. |
| **F2-T11 Mensajes, menciones, horas y actividad** | 2E | `modulos/mensajes/**`, `modulos/horas/**` | §6.1, §6.3, §6.4 con tests; pruebas 2, 7, 10; `primera_respuesta_en` se fija con el primer seguimiento; mención a usuario inactivo → 400. |
| **F2-T12 Tareas** | 2E | `modulos/tareas/**` | §6.2 con tests; eventos `tarea_*` en el ticket; marcar hecha en ticket cerrado → 200, editar título → 409. |
| **F2-T13 Web: api, componentes, shadcn** | 2F | `features/tickets/{api,eventos}.ts`, `components/dominio/{PillEstado,PillPrioridad,PillTipo,Codigo,FechaLimite,FechaRelativa,Avatares,SelectorPersonas,SelectorResponsables,SubidaArchivos,Redactor,ListaTareas,DialogoCambiarEstado}.tsx`, `components/ui/{textarea,popover,command,progress,scroll-area}.tsx`, `lib/api.ts` (`enviarMultipart`), `package.json` | Tests jsdom: `describirEvento` (8 casos), `Redactor` alterna modo y deshabilita el botón sin texto, `@` abre la lista y agrega el id, `DialogoCambiarEstado` muestra el campo "¿De quién se espera?" solo con `en_espera` y solo "Reabrir" para un cerrado, `ListaTareas` calcula el progreso; `tema.css` intacto tras la CLI de shadcn. |
| **F2-T14 Pantalla 4 Nuevo ticket** | 2F | `pages/NuevoTicketPage.tsx`, `components/PanelCorreo.tsx`, `router.tsx` | Test: el panel de correo rellena asunto/solicitante/descripción con `fetch` simulado; la vista previa de plazo llama a `/api/plazos/calcular` con el departamento del principal. En el navegador: arrastrar `correo.eml` → vista previa → "Usar en el formulario" → crear → detalle con correo original descargable y adjunto extraído; a 390 px el panel va arriba y colapsa. |
| **F2-T15 Pantalla 5 Detalle** | 2F | `pages/TicketDetallePage.tsx`, componentes de la pantalla | Tests: pestañas filtran y muestran conteos; nota interna con fondo ámbar y candado; `lectura` no ve el redactor pero sí las notas; ticket cerrado muestra "Reabrir". En el navegador (1440 y 390 px): registrar seguimiento con foto desde la cámara del móvil (emulación), nota con `@` y 1,5 h → aparecen en Actividad y en `registro_horas`; cambiar estado a En espera desde el panel; marcar tarea; el redactor queda fijo al pie en móvil. |
| **F2-T16 Pantalla 1 Tablero** | 2G | `pages/TableroPage.tsx`, `tablero/**` | Tests §11. En el navegador: arrastrar TK-1051 a En curso cambia el estado y genera el evento; soltar en Cerrados abre el selector (A7); soltar en En espera pide "de quién"; menú "Cambiar estado" funciona con teclado (Tab + Enter) y en móvil; `lectura` no arrastra; filtros en la URL. |
| **F2-T17 Pantalla 2 Tabla + ficha de cliente** | 2G | `pages/TablaPage.tsx`, `tabla/**`, `features/clientes/**` | Tests §12. En el navegador: chips con contadores, agrupar por responsable, Archivados muestra TK-1012, orden por Vence, `⋯` cambia estado; ficha de Viña Santa Clara lista TK-1048 y TK-1028 y "Nuevo ticket para este cliente" prellena el cliente. |
| **F2-T18 Semillas de tickets** | 2H | `database/semillas/desarrollo-tickets.ts`, `desarrollo.ts`, `desarrollo.test.ts` | §13; `npm run db:reiniciar` deja el Tablero igual al diseño (sin etiquetas OT). |
| **F2-T19 Documentación y cierre** | 2H | `docs/manuales/usuario/01-tecnico.md` (crear ticket desde correo, seguimiento vs nota, tareas, fotos, horas desde el redactor, estados y qué exige cada uno, Tablero/Tabla, archivado), `docs/manuales/usuario/00-primeros-pasos.md` (enlace), `docs/manuales/administracion.md` (sección "Archivos: dónde se guardan, `ARCHIVOS_DIR`, límites, limpieza de huérfanos, espacio en disco"), `docs/api/README.md` (subida multipart con `curl`, descarga), `docs/CHANGELOG.md`, `CLAUDE.md` (tabla §7; `ruta()` con `previos`; BD de test por bloque), `README.md` (`ARCHIVOS_DIR`, `db:test:crear`), `docs/api/openapi.json` | Criterios de §16 desde un clon limpio; PR a `main` con CI verde. |

## 16. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 9 migraciones aplicadas
npm test                                                                                    → verde (shared: estados + esquemas; api: todos los módulos; web)
npm run db:reiniciar                                                                        → 16 tickets, TK-1048 con 5 tareas y actividad
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (3 colas: mantencion.limpiar, tickets.archivar, archivos.limpiar_huerfanos)
curl -b cookie -H "X-Requested-With: Zydesk" -F "archivos=@apps/api/test/fixtures/correo.eml" localhost:3010/api/archivos         → 201 [{ id, categoria: "correo" }]
curl -b cookie -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"archivo_id":1}' localhost:3010/api/correos/parsear  → 200 con de/asunto/adjuntos
curl -b cookie -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"asunto":"Prueba","origen":"externo","prioridad":"media", ...}' localhost:3010/api/tickets → 201 { codigo: "TK-1052" }
curl -b cookie -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"estado":"en_espera"}' localhost:3010/api/tickets/<id>/cambiar-estado → 400 VALIDACION (falta espera_de)
curl -b cookie -F "archivos=@no-es-imagen.png" localhost:3010/api/archivos                  → 400 ARCHIVO_NO_PERMITIDO
GitHub Actions: workflow CI verde en la rama y en el PR a main
```

En el navegador (1440 px y 390 px): `/tickets` muestra las 4 columnas con las tarjetas del diseño; arrastrar a Cerrados abre el selector; `/tickets/tabla` agrupa por prioridad con los chips; `/tickets/nuevo` con `correo.eml` autocompleta; `/tickets/:id` de TK-1048 reproduce la actividad del diseño (pestañas con conteos, nota ámbar con mención, "3 h registradas"), tareas con progreso 2/5, panel derecho, redactor fijo al pie en móvil, correo original descargable; con `nvega` (lectura) todo se ve, nada se edita.

## 17. Decisiones tomadas en esta spec (menores, con justificación)

1. **Todas las migraciones de la fase en el bloque 2B** (F2-T2) para que 2C y 2D avancen en paralelo sin pisarse; `archivo` recibe `mensaje_id` por `ALTER` en la migración 9 para evitar una referencia circular.
2. **Una BD de test por bloque** con `TEST_BD_SUFIJO` y `npm run db:test:crear` (§1.1); CI y desarrollo normal siguen usando `zydesk_test`.
3. **La API re-lee el correo al crear el ticket** (`correo: { archivo_id } | { texto }`), en vez de aceptar `de/para/asunto` desde el cliente: lo guardado en `correo_adjunto` es lo que dice el archivo; el usuario edita los campos del ticket, no el correo. El texto pegado se guarda además como archivo `.txt` para que "original descargable" valga en los tres modos.
4. **El autocompletado vive en el front** ("Usar en el formulario"), como pide la spec 4.2 ("el usuario revisa antes de crear").
5. **`respuesta_limite` y `primera_respuesta_en`** se calculan y guardan (la categoría define el plazo de respuesta desde la Fase 1 y los reportes lo usarán); la UI solo los muestra en el panel. La primera respuesta se fija con el primer seguimiento o al pasar a En curso.
6. **La categoría propone el responsable por defecto, no lo asigna**: la spec habla de "responsable por defecto" como sugerencia; la persona confirma en el formulario.
7. **Sin responsable ni categoría no hay fecha límite** (queda `NULL` y la tarjeta dice "Sin fecha"); no se inventa un plazo.
8. **Tickets cerrados**: admiten mensajes, seguidores y marcar/desmarcar tareas; no admiten `PATCH`, responsables ni alta/baja/edición de tareas (409 `TICKET_CERRADO`, "Reabre el ticket para editarlo"). Reabrir = `cambiar-estado` a `en_curso`.
9. **Un solo evento por cambio de estado** (`cambio estado` con `datos` del payload) en vez de eventos separados por `espera_de`/`motivo`: el historial muestra "Nuevo → En espera · repuesto" en una línea, como el diseño.
10. **Eventos de tareas bajo `entidad = 'ticket'`** (`tarea_creada`, `tarea_hecha`, …) para que la actividad del ticket sea una sola consulta (ADR 0003 exige rastro de tareas; no exige entidad propia).
11. **Los mensajes no generan `evento`** (serían duplicados en la actividad); "N° de mensajes" cuenta mensajes (B11).
12. **Sin edición ni borrado de mensajes ni de archivos asociados** en esta fase (la spec no lo pide; "todo deja rastro").
13. **Menciones solo como ids** (ADR 0008); el `@` en el texto es presentación.
14. **Horas desde el redactor** (B5): fila de `registro_horas` con la fecha de hoy en Santiago, `fuera_de_horario = false` (marca manual en la planilla, B4) y `mensaje_id`; sin endpoints de horas hasta la Fase 5.
15. **Auditoría de descargas solo para `attachment`**: las imágenes inline de la galería generarían decenas de filas por visita sin valor de seguridad; documentos y correos sí se auditan (ADR 0017).
16. **`ruta()` gana `previos?: RequestHandler[]`** para intercalar `multer` entre autorización y handler en la única ruta multipart, manteniendo la declaración única de rutas (ADR 0010).
17. **Detección de MIME por contenido con `file-type`**, aceptando texto plano solo para `.eml/.txt/.csv` con contenido textual; `.msg` detectado como CFB solo si `msgreader` lo abre.
18. **Actividad sin paginar** (decenas de ítems por ticket) y con `conteos` para las pestañas.
19. **Listado sin paginar para el Tablero** (activos + cerrados no archivados, ADR 0010) y paginado para la Tabla; agrupación en el cliente sobre `por_pagina=100`.
20. **`orden` del Tablero: prioridad y luego actualización** (el diseño ordena las columnas por prioridad).
21. **Exportar (Fase 7), filtro Con OT y Convertir en OT (Fase 3)** visibles y deshabilitados con tooltip, como se hizo con Tarifas/Plantillas en la Fase 1.
22. **`OT_ABIERTA` y `otsAbiertas()`** se declaran ahora para que la Fase 3 no toque el contrato ni el front del diálogo (B1 se implementa allí).
23. **`ClienteResumen.tickets_abiertos`** en vez de embeber tickets en `ClienteSalida`: la ficha consulta `GET /api/tickets?cliente_id`.
24. **Semillas insertan `numero` explícito** y luego ajustan `contador.valor` para no depender del modo configurado.
25. **CI genera `.env` desde `.env.example`** y ejecuta el mismo `01-roles.sql`, para que CI y local sean idénticos (ADR 0020).

## 18. Preguntas para el usuario

1. **Fixture `.msg`**: no se puede generar un `.msg` real sin Outlook. ¿Puedes exportar **un correo de prueba sin datos reales** (enviado por ti a ti mismo, con un adjunto pequeño) como `.msg` y dejarlo en `apps/api/test/fixtures/correo.msg`? Si no, el test de `.msg` queda como `it.skip` y se prueba a mano en la demo.
2. **Responsable por defecto de la categoría**: la spec lo llama "responsable por defecto". Aquí se **propone** en el formulario y la persona confirma (decisión 6). ¿Prefieres que se asigne automáticamente si nadie elige principal?
3. **Tickets cerrados**: ¿confirmas que no se editan campos ni tareas sin reabrir (decisión 8)? Alternativa: permitir todo y dejar rastro.
4. **Fecha de las horas del redactor**: siempre "hoy" (decisión 14). ¿Quieres un selector de fecha en el redactor (p. ej. "registré 3 h ayer") o basta con corregirlo en la planilla de la Fase 5?
5. **Tamaño del cuerpo de correo**: se guarda hasta 20 000 caracteres (se recorta con "…"; el original sigue descargable). ¿Suficiente?
6. **Rama protegida en GitHub**: ADR 0020 asume que configurarás `main` como rama protegida con "CI verde obligatorio" y sin push directo. ¿Lo haces tú al abrir el repo público?
7. **Auditoría de descargas**: ¿de acuerdo con auditar solo descargas de documentos y correos, no las imágenes que la galería muestra inline (decisión 15)?

## 19. Cambios de ADR propuestos (no se editan las ADR; registrar en una ADR 0021 "Precisiones de la Fase 2" al cerrar)

- **ADR 0017**: precisar que `descarga_archivo` se registra solo para descargas `attachment` (documentos y correos), no para imágenes/PDF servidos inline.
- **ADR 0003**: dejar constancia de que los eventos de tareas se registran con `entidad = 'ticket'` (u `'ot'`) y `datos.tarea_id`, y de que los mensajes (seguimientos/notas) no generan `evento`.
- **ADR 0004**: el cambio de estado genera un único `evento` `cambio` en `estado` con el payload en `datos`; un ticket cerrado admite mensajes y marcar tareas pero no edición de campos (409 `TICKET_CERRADO`); reabrir limpia `archivado_en`.
- **ADR 0009**: el texto pegado se guarda también como archivo `.txt` (`categoria = correo`); `archivo.entidad` NULL = pendiente; `mensaje_id` para adjuntos de mensajes; detección con `file-type` con la excepción de texto plano para `.eml/.txt/.csv`.
- **ADR 0005 / spec 4.1**: `respuesta_limite` y `primera_respuesta_en` en `ticket`; sin responsable con departamento ni categoría no se calcula fecha límite.
- **ADR 0010**: `ruta()` admite `previos` (middlewares previos al handler) para multipart.
- **ADR 0008**: el job `tickets.archivar` corre a las 03:10 (no 03:00) para no solaparse con `mantencion.limpiar`, y registra un `evento` `archivado` por ticket.
- **ADR 0001 / PLAN §3**: se agrega la carpeta `apps/api/src/integraciones/{storage,correo,archivos}` (ya prevista en el PLAN) y `apps/api/test/fixtures/`.
