# Fase 4 — Cotizador · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §1 (revisión de seguridad al cierre) y §4 Fase 4; ADR 0003, 0004, 0006, **0007**, 0008, 0009, 0010, 0011, 0014, **0015**, 0017, 0020, 0021, 0022, **0023**, **0024**; `preguntas-abiertas.md` A2, A3, B10, **B12**; spec funcional §4.5 (OT facturable), **§4.7 Cotizador**, §4.11 (formatos), §5 pantallas 6, 7 y 12 (pestañas Tarifas y Plantillas), §6 (`Cotizacion`, `LineaCotizacion`, `PlantillaCotizacion`); diseño "Cotizador COT-0218" (líneas, totales, caso $475.000 neto / $565.250 con IVA), "Orden de trabajo OT-0218" (panel Cotización, botón "Revisar y enviar cotización", galería), "Órdenes de trabajo" (columna neto) y "Configuración" (pestañas Tarifas y Plantillas de cotización).
>
> Rama `feat/fase-4-cotizador`; PR a `main` al cerrar con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1. Entorno: el de la Fase 3. Todo lo construido en las Fases 0–3 (`ruta()`, `enTransaccion`, `registrarCambios`, `registrarEvento`, `registrarAuditoria`, `bloquearTicket` → `bloquearOt`, `cargarOt`, `registrarAprobacionCliente`, `cambiarEtapa`, `efectosCierreOt`, `Storage`, `prepararDescarga`, `publicar` de eventos de dominio, `configuracion` como clave/valor jsonb, `tarifa_cliente`, fábricas, BD de test por bloque) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, `type` explícito en `@Column`, SQL a mano en migraciones, servicios como único punto de escritura, un módulo escribe en tablas de otro solo a través del servicio de ese módulo con el mismo `tx`, `logger` sin contenido (ni montos ni descripciones: solo ids), procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: **rendimiento de la suite de tests de la API como primera tarea** (§3); tablas `cotizacion`, `linea_cotizacion`, `plantilla_cotizacion`, `plantilla_linea`; tarifas globales, IVA y validez por defecto en `configuracion`; cotización por OT facturable, **versionada** (`COT-0218 v1`, `v2`…, código derivado de la OT, ADR 0006/0014) con estados `borrador → enviada → aprobada | rechazada | reemplazada`; encabezado (contacto, emisión, validez 15/30 días, moneda CLP o UF con `valor_uf`), líneas (tipo, descripción, cantidad, unidad, precio unitario, descuento %, total) y totales (subtotal, descuentos, neto, IVA desactivable, total) con la **función de cálculo única en `shared`** (ADR 0007) usada por el front en vivo, por la API al guardar (recalcula y **descarta** lo que mande el cliente) y por los exportadores; condiciones comerciales (van en la planilla) y nota interna (no va); "Importar horas de las tareas de la OT" con tarifa del cliente si existe y si no la global (B12); plantillas de cotización (Configuración → Plantillas) y "Aplicar plantilla"; descargas **.xlsx** (exceljs, con fórmulas) y **PDF** (pdfmake) registradas en el historial de la OT (`evento`) y en `auditoria` (`exportacion`, ADR 0017; son `attachment`, ADR 0021); integración con la OT: "Marcar como enviada" pasa la OT de `borrador` a `cotizada` automáticamente y **desaparece la marca manual de la Fase 3**; `OtResumen.neto` y `OtSalida.cotizacion` poblados; la aprobación del cliente exige una cotización `enviada` y la **congela** (`aprobada`, inmutable; "Duplicar como vN" solo antes de aprobar); "Volver a borrador" (rechazo del cliente) marca la cotización `rechazada`; `OtSalida.costo_interno` en OT internas (horas registradas × tarifa de costo interno, al vuelo, ADR 0007); regla mínima de bolsa (`descuenta_bolsa: true` con contrato ya fijado no cambia el contrato); pantalla **7 Cotizador** (mobile-first), lista mínima `/cotizaciones` (vista, ADR 0022), panel y acciones de la pantalla 6, columna neto en `/ots`; pestañas **Tarifas** y **Plantillas** de Configuración; semillas (COT-0218 v1 del diseño, COT-0214/0216/0217, tarifas y las 3 plantillas del diseño); manuales, CHANGELOG, ADR 0025.

**No entra**: correo saliente (enviar la cotización por correo: "enviar" significa marcar como enviada tras descargar el documento, ADR 0013); avisos y despachador (Fase 6: aquí solo se publica `cotizacion.respondida`); "Por aprobar" en Mi día; pantalla **10 Órdenes de trabajo** completa (indicadores en pesos, "Esperando aprobación", exportación `.xlsx` de facturación: Fase 6; la lista `/ots` solo gana la columna neto); planilla de horas y `tarea_id` en `registro_horas` (Fase 5); datos de la empresa en el PDF (`[RUT]`, razón social, dirección: configuración de la Fase 9; el PDF lleva nombre y logo de la marca); prefijo `COT-` configurable (fijo en esta fase, §18.11); consulta automática del valor de la UF (se ingresa a mano, ADR 0007); edición de una cotización enviada (se duplica); borrar versiones enviadas; reportes; Playwright; CD.

## 1. Bloques y paralelismo

| Bloque | Contenido | Depende de | Archivos que toca (exclusivos) |
|---|---|---|---|
| **4A** Rendimiento de tests | `test/bd.ts`, `test/setup.ts`, `test/fabricas.ts` (`ingresarComo`, hash constante), tests de los helpers; (condicional) `vitest.config.ts`, `setup-global.ts`, `bd-test.ts`, `cli.ts`, `ci.yml` | — (**primera tarea de la fase**) | `apps/api/test/**`, `apps/api/vitest.config.ts`, `apps/api/src/database/{bd-test,cli}.ts`, `apps/api/src/database/bd-test.test.ts`, `.github/workflows/ci.yml`, `CLAUDE.md` §3 |
| **4B** Contratos y BD | `shared` (enums, `cotizacion/calcular.ts` con tests de tabla, `formato/moneda.ts`, `esquemas/{cotizacion,configuracion,ot}.ts`, `estados/ot.ts`, `errores.ts`, `eventos.ts`), migración 11, entidades, `entidades.ts`, fábricas | 4A | `packages/shared/src/**`, `apps/api/src/database/**` (salvo semillas), `apps/api/src/modulos/cotizaciones/*.entity.ts`, `apps/api/src/modulos/configuracion/plantilla*.entity.ts`, `apps/api/test/fabricas.ts` |
| **4C** API cotizaciones y OT | `modulos/cotizaciones/**` (servicio, consulta, rutas, exportadores en `integraciones/{xlsx,pdf}`), cambios en `modulos/ots/**` (neto, `cotizacion`, `costo_interno`, aprobación, `cambiar-etapa`, bolsa), `app.ts` | 4B; 4D solo para `leerTarifas` (firma fijada en §8.1) | `apps/api/src/modulos/cotizaciones/**` (salvo entities), `apps/api/src/modulos/ots/**` (salvo entities), `apps/api/src/integraciones/{xlsx,pdf}/**`, `apps/api/src/app.ts` |
| **4D** API configuración | tarifas, IVA, validez, plantillas en `modulos/configuracion/**` | 4B | `apps/api/src/modulos/configuracion/**` (salvo entities) |
| **4E** Web cotizador y OT | `features/cotizador/**`, cambios en `features/ots/**`, `components/dominio/{Monto,PillEstadoCotizacion}.tsx`, `lib/api.ts` (`descargar`), `router.tsx` | 4C (API); componentes puros contra los esquemas de 4B | `apps/web/src/features/cotizador/**`, `apps/web/src/features/ots/**`, `apps/web/src/components/dominio/**`, `apps/web/src/lib/api.ts`, `apps/web/src/app/router.tsx` |
| **4F** Web configuración | pestañas Tarifas y Plantillas | 4D (API); formularios contra los esquemas de 4B | `apps/web/src/features/configuracion/**` |
| **4G** Semillas y docs | semillas, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0025 | todo | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md` |

**En paralelo sin conflicto**: 4C con 4D (tras 4B); 4E con 4F (tras la API); 4E puede empezar `TablaLineas`, `TotalesCotizacion`, `Monto` y `PillEstadoCotizacion` contra los esquemas y `calcularCotizacion` de 4B. 4A va **sola y primero**: toca los helpers que usan todos los tests. Orden general en §16.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en las Fases 2 y 3: `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 4A y 4B usan `zydesk_test` (sin variable; 4A corre sola); 4C `4c`; 4D `4d`; 4G `4g`. CI sigue con `zydesk_test`. Si se implementa §3.4 (paralelismo), las bases por worker se derivan del sufijo (`zydesk_test_4c_w1`…) y las crea `setup-global.ts`.

### 1.2 Orden de bloqueo de filas (obligatorio)

Se extiende el de la Fase 3 (§1.2): **ticket → OT → cotización → tarea/mensaje**. Toda operación sobre una cotización bloquea primero su OT (`bloquearOt`) y después la fila `cotizacion` (`SELECT … FOR UPDATE`); nunca al revés. La aprobación del cliente y "Volver a borrador" ya bloquean la OT y, desde esta fase, bloquean después la cotización vigente. Enviar una cotización no toca el ticket (no hay que bloquearlo).

## 2. Versiones nuevas

| Paquete | Dónde | Versión | Licencia | Para qué |
|---|---|---|---|---|
| `exceljs` | `apps/api` | `^4.4.0` | MIT | `.xlsx` con fórmulas y formato (ADR 0007) |
| `pdfmake` | `apps/api` | `^0.2.20` | MIT | PDF de la cotización (ADR 0001); fuentes **Roboto** (Apache 2.0) incluidas en `pdfmake/build/vfs_fonts` cargadas como `Buffer` en `PdfPrinter` (§7.2) |
| `@types/pdfmake` | `apps/api` (dev) | `^0.2.11` | MIT | tipos |

Sin AGPL/GPL (regla del CHANGELOG sobre `ua-parser-js`). Sin paquetes nuevos en `web` ni en `shared`; sin componentes shadcn nuevos (la tabla de líneas usa `table`, `input`, `select`, `checkbox`, `textarea`, `dialog`, `alert-dialog`, `tooltip` existentes). Si al implementar hace falta otro paquete (p. ej. `pdf-parse` para un test), **detente y pregunta**; el test del PDF de §10.17 no lo necesita.

## 3. Rendimiento de la suite de la API (bloque 4A, primera tarea)

### 3.1 Diagnóstico (medido el 2026-10-01 en la máquina de desarrollo, Postgres 16 en Docker, Windows)

- `npm run test -w @zydesk/api`: 50 archivos, **447 tests**, ~13 min local (~4–5 min en GitHub Actions). `ots.test.ts` (24 tests) tarda 40 s: **1,7 s por test**.
- `test/setup.ts` ejecuta `reiniciarBd()` **antes de cada test**: abre y cierra el `DataSource` owner (35 ms), hace `TRUNCATE` de las 25 tablas de `public` con `RESTART IDENTITY CASCADE` (**686 ms**: el costo de `TRUNCATE` es por relación —archivos nuevos para tabla, índices y TOAST— y en este entorno vale ~27 ms por tabla aunque esté vacía) y vuelve a sembrar la base (7 ms). Total **750 ms por test** ≈ 5,6 min de los 13.
- `ingresarComo()` hace `POST /api/auth/ingresar` real: `argon2id` con `m=65536, t=3` tarda **194 ms** por verificación (petición completa 223 ms); hay 78 llamadas en el código de tests, casi todas dentro de helpers `como(rol)` que corren una o dos veces por test → ≈ 2–3 min.
- `crearUsuario` hashea una vez por proceso (`hashPorDefecto`), pero `fileParallelism: false` con `pool: forks` recrea el módulo por archivo: 50 hashes de ~300 ms ≈ 15 s.
- El resto (migraciones en `globalSetup`, peticiones reales, consultas) ≈ 4 min y es trabajo legítimo.

Un `TRUNCATE` selectivo de solo las tablas con filas (medido: 546 ms con `CASCADE`) **no** resuelve nada: el costo es del `TRUNCATE` en sí. Un `DELETE` de solo las tablas con filas, en orden hijos → padres, más `ALTER SEQUENCE … RESTART` de sus identidades, **sí**: **56 ms** con 10 tablas pobladas.

### 3.2 Objetivo medible

- Local: `npm run test -w @zydesk/api` **≤ 6 min** (hoy ~13) con la misma cobertura (447 tests o más, ninguno saltado) y el mismo aislamiento (cada test arranca con todas las tablas vacías, identidades en 1 y la semilla base).
- CI: paso "Tests" del job `verificar` **≤ 3 min** (hoy ~4–5).
- Se mide con `Duration` de Vitest al final de la salida y con la duración del paso en Actions; ambas cifras se anotan en el commit de F4-T1 y en el CHANGELOG.

### 3.3 Solución (obligatoria, F4-T1)

1. **Limpieza barata en `test/bd.ts`** (`reiniciarBd`):
   - El `DataSource` owner se abre **una vez por archivo** (`beforeAll` de `setup.ts`, junto al de la app) y se cierra en `afterAll`; `prepararBd` (migraciones en `globalSetup`) no cambia.
   - En la primera llamada del archivo se calculan y cachean: la lista de tablas de `public` (sin `migracion`), el **orden de borrado** y las secuencias de identidad. Orden: topológico hijos → padres sobre las FK **bloqueantes** (`pg_constraint` con `contype = 'f'`, `confdeltype IN ('a','r')` —NO ACTION/RESTRICT—, excluyendo autorreferencias `conrelid = confrelid`); las FK `ON DELETE SET NULL/CASCADE` no se consideran porque no impiden el `DELETE`. Si queda un ciclo, `reiniciarBd` lanza un error con los nombres de las tablas (así se detecta al escribir una migración, no en un test aleatorio).
   - Por test: una sola consulta `SELECT 'tabla' AS t, EXISTS (SELECT 1 FROM "tabla") AS hay UNION ALL …` sobre todas las tablas; `DELETE FROM "t"` **solo** de las que tienen filas, en el orden cacheado; `ALTER SEQUENCE <seq> RESTART` solo de las identidades de esas tablas (`pg_get_serial_sequence` sobre `pg_attribute.attidentity <> ''`); luego `sembrarBase` como hoy. Invariante: una tabla que recibió filas se vacía y reinicia en el siguiente reinicio; una que nunca las recibió ya está vacía y en 1. `evento` y `auditoria` se borran con el owner (ADR 0017: la app no puede).
   - `db:reiniciar` de desarrollo **no cambia** (sigue con `TRUNCATE`; corre una vez).
2. **Sesiones de prueba directas en BD** (`test/fabricas.ts`):
   - `ingresarComo(app, usuario, contrasena?, mantener = false)` conserva la firma. **Sin `contrasena`** (75 usos) inserta la sesión con `crearSesion(dataSource.manager, { usuario_id, mantener, ip: '127.0.0.1', user_agent: 'vitest' })` de `core/auth/sesiones.ts` y arma `cookie = \`${nombreCookie('test')}=${token}\``; el `agente` es `request.agent(app).set('X-Requested-With', 'Zydesk').set('Cookie', cookie)`. **Con `contrasena`** (3 usos: `seguridad.test.ts:414`, `auth.test.ts:150`, `usuarios.test.ts:277`, que prueban que una contraseña nueva o temporal sirve para entrar) hace el `POST /api/auth/ingresar` real como hoy.
   - Consecuencia: la sesión directa **no** deja `ingreso_ok` en `auditoria` ni actualiza `ultimo_ingreso`. Los tests que afirman sobre `ingreso_ok`, límites o `ultimo_ingreso` (`auth.test.ts`, `limites.test.ts`, `seguridad.test.ts`, `auditoria.test.ts`, `usuarios.test.ts`) deben seguir llamando al endpoint explícitamente (pasando `CONTRASENA_PRUEBA` como tercer argumento si usaban `ingresarComo`). Se revisan uno a uno al correr la suite; **ningún `expect` se relaja**.
   - `crearUsuario` usa una **constante** `HASH_CONTRASENA_PRUEBA` (hash argon2id de `CONTRASENA_PRUEBA` con los parámetros de producción, generado una vez y pegado como literal con un comentario) en lugar de `hashPorDefecto`; otras contraseñas se siguen hasheando. Test: `verificar(HASH_CONTRASENA_PRUEBA, CONTRASENA_PRUEBA)` es `true` (si alguien cambia la constante o la contraseña, falla aquí y no en 400 tests).
   - `core/auth/contrasena.ts` **no cambia**: los parámetros de argon2 de producción no se reducen por entorno (ADR 0013; evita una rama `NODE_ENV === 'test'` en código de seguridad).
3. Tests nuevos en `apps/api/src/database/fabricas.test.ts` (o `bd.test.ts` nuevo): tras poblar usuario, cliente, ticket con responsable, OT con tarea y mensaje con archivo, `reiniciarBd()` deja `count(*) = 0` en todas las tablas salvo `configuracion` (2), `contador` (2) y `feriado` (33), y `(await crearUsuario()).id === 1`; el orden de borrado no tiene ciclos; `ingresarComo` sin contraseña autentica (`GET /api/yo` → 200 con el id) y no crea `auditoria`; con contraseña crea `ingreso_ok`.

**Estimación**: −0,69 s × 447 (limpieza) y −0,2 a −0,4 s × 447 (ingresos) ≈ −7 min → **5–6 min local**.

### 3.4 Paralelismo por archivo con una base por worker (F4-T2, **condicional**)

Se implementa **solo si** tras F4-T1 la suite local supera 6 min o CI supera 3 min. Diseño fijado para no decidir después:

- `vitest.config.ts`: `fileParallelism: true`, `maxWorkers: 4` (local y CI), `pool: 'forks'`.
- `setup-global.ts`: con `crearBdTest(sufijo)` (ya existe; usa `POSTGRES_USER/PASSWORD/PORT`, presentes en `.env.example` y en CI) crea si faltan `zydesk_test[_<TEST_BD_SUFIJO>]_w1..w4` y aplica las migraciones en cada una (owner). Deja de migrar la base "sin worker".
- `setup.ts`: antes de importar `config/db.js`, fija `process.env.TEST_BD_SUFIJO = \`${sufijoBase ?? ''}${sufijoBase ? '_' : ''}w${process.env.VITEST_POOL_ID}\`` (import dinámico después; `env.ts` ya deriva `TEST_DATABASE_URL*` del sufijo). `bd-test.ts` acepta el sufijo compuesto (`SUFIJO_VALIDO` ya admite 20 caracteres `[a-z0-9_]`).
- Independencia verificada: el `Storage` de test ya usa un directorio temporal por proceso; pg-boss usa el esquema `pgboss` de **su** base; los tests de numeración y semillas solo tocan su base; `logger.test.ts` y `env.test.ts` no usan BD. Nada comparte estado entre archivos.
- `01-roles.sql` no cambia (las bases nuevas las crea `crearBdTest`). `ci.yml` no cambia salvo que el tiempo lo exija.
- Objetivo si se hace: **≤ 4 min local, ≤ 2,5 min CI**.

Si se requiere, se registra en ADR 0025 (precisa ADR 0020: "`fileParallelism: false`, igual que en local").

## 4. Base de datos y contratos (bloque 4B)

### 4.1 Migración `1791000000011-cotizaciones` (SQL a mano; `down` inverso; no inserta datos)

```sql
cotizacion (
  id identity PK,
  ot_id integer NOT NULL REFERENCES ot(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  codigo text NOT NULL,                                                        -- 'COT-0218' (sin la versión; ADR 0006/0014)
  estado text NOT NULL CHECK (estado IN ('borrador','enviada','aprobada','rechazada','reemplazada')),
  contacto_id integer NULL REFERENCES contacto(id) ON DELETE SET NULL,
  fecha_emision date NOT NULL,
  validez_dias integer NOT NULL CHECK (validez_dias IN (15, 30)),
  moneda text NOT NULL CHECK (moneda IN ('CLP','UF')),
  valor_uf numeric(12,2) NULL CHECK (valor_uf > 0),                            -- obligatorio si UF (ADR 0007)
  aplica_iva boolean NOT NULL DEFAULT true,
  iva_pct numeric(5,2) NOT NULL CHECK (iva_pct >= 0 AND iva_pct <= 100),      -- snapshot de la configuración al crear
  condiciones text NULL, nota_interna text NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),             -- materializados por la API con `calcularCotizacion`
  descuentos numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuentos >= 0),
  neto numeric(14,2) NOT NULL DEFAULT 0 CHECK (neto >= 0),
  iva numeric(14,2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  enviada_en timestamptz NULL, enviada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  aprobada_en timestamptz NULL, rechazada_en timestamptz NULL,
  creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL, creado_en, actualizado_en,
  UNIQUE (ot_id, version),
  CHECK (moneda <> 'UF' OR valor_uf IS NOT NULL),
  CHECK (estado = 'borrador' OR enviada_en IS NOT NULL),
  CHECK (estado <> 'aprobada' OR aprobada_en IS NOT NULL)
)
CREATE UNIQUE INDEX cotizacion_borrador_uq ON cotizacion (ot_id) WHERE estado = 'borrador';   -- a lo sumo un borrador por OT
CREATE UNIQUE INDEX cotizacion_aprobada_uq ON cotizacion (ot_id) WHERE estado = 'aprobada';   -- a lo sumo una aprobada por OT
CREATE INDEX cotizacion_ot_version_idx ON cotizacion (ot_id, version DESC);
CREATE INDEX cotizacion_estado_idx ON cotizacion (estado, actualizado_en DESC);

linea_cotizacion (
  id identity PK,
  cotizacion_id integer NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
  orden integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('mano_de_obra','material','servicio','traslado')),
  descripcion text NOT NULL,
  cantidad numeric(10,2) NOT NULL CHECK (cantidad > 0),
  unidad text NOT NULL CHECK (unidad IN ('h','un','km','gl')),
  precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  total numeric(14,2) NOT NULL CHECK (total >= 0),                            -- redondeado por línea (ADR 0007)
  UNIQUE (cotizacion_id, orden)
)

plantilla_cotizacion (
  id identity PK, nombre text NOT NULL, descripcion text NULL, condiciones text NULL,
  activo boolean NOT NULL DEFAULT true, creado_en, actualizado_en
)
CREATE UNIQUE INDEX plantilla_cotizacion_nombre_uq ON plantilla_cotizacion (lower(nombre));

plantilla_linea (
  id identity PK,
  plantilla_id integer NOT NULL REFERENCES plantilla_cotizacion(id) ON DELETE CASCADE,
  orden integer NOT NULL, tipo text NOT NULL CHECK (tipo IN (…los 4…)), descripcion text NOT NULL,
  cantidad numeric(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0), unidad text NOT NULL CHECK (unidad IN (…las 4…)),
  precio_unitario numeric(14,2) NULL CHECK (precio_unitario >= 0),              -- NULL = se toma de la tarifa al aplicar (§5.6)
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  UNIQUE (plantilla_id, orden)
)
```

`evento` no cambia: los eventos de cotización se registran con `entidad = 'ot'` y `datos.cotizacion_id` (§9, mismo criterio que las tareas en ADR 0021.2: la actividad de la OT es una sola consulta). `configuracion` recibe en la semilla base dos claves nuevas (§8.1): `tarifas` y `cotizacion`. `tarifa_cliente` no cambia (`costo_interno` **no** es tarifa por cliente: es interna). `entidades.ts` registra `Cotizacion`, `LineaCotizacion`, `PlantillaCotizacion`, `PlantillaLinea` (todas con `numericoANumero` en los `numeric`). `down`: elimina las cuatro tablas (las claves de `configuracion` quedan; son datos, no esquema).

### 4.2 `packages/shared`

```ts
// enums/cotizacion.ts
export const MONEDAS = ['CLP','UF'] as const;                       ETIQUETA_MONEDA = { CLP: 'Pesos chilenos (CLP)', UF: 'Unidades de fomento (UF)' }
export const TIPOS_LINEA = ['mano_de_obra','material','servicio','traslado'] as const
export const ETIQUETA_TIPO_LINEA = { mano_de_obra: 'Mano de obra', material: 'Material', servicio: 'Servicio', traslado: 'Traslado' }
export const UNIDADES = ['h','un','km','gl'] as const;             ETIQUETA_UNIDAD = { h: 'h', un: 'un', km: 'km', gl: 'gl' }
export const VALIDEZ_DIAS = [15, 30] as const
export const ESTADOS_COTIZACION = ['borrador','enviada','aprobada','rechazada','reemplazada'] as const
export const ETIQUETA_ESTADO_COTIZACION = { borrador: 'Borrador', enviada: 'Enviada', aprobada: 'Aprobada', rechazada: 'Rechazada', reemplazada: 'Reemplazada' }
export const CONCEPTOS_TARIFA_GLOBAL = [...CONCEPTOS_TARIFA, 'costo_interno'] as const   // enums/tarifa.ts; ETIQUETA_CONCEPTO_TARIFA gana costo_interno: 'Costo interno (OT internas)'

// cotizacion/calcular.ts  (ADR 0007: la única implementación del cálculo)
export interface LineaCalculo { cantidad: number; precio_unitario: number; descuento_pct: number }
export interface ParametrosCalculo { moneda: Moneda; aplica_iva: boolean; iva_pct: number }
export interface TotalesCotizacion { subtotal: number; descuentos: number; neto: number; iva: number; total: number }
export function decimalesDe(moneda: Moneda): 0 | 2                               // CLP 0, UF 2
export function redondear(n: number, moneda: Moneda): number                       // half-up: Math.round((n + Number.EPSILON) * f) / f, f = 10^decimales; montos ≥ 0
export function totalLinea(l: LineaCalculo, moneda: Moneda): number                // redondear(cantidad × precio × (1 − descuento/100))
export function calcularCotizacion(lineas: LineaCalculo[], p: ParametrosCalculo): { lineas: number[] /* total por línea */ } & TotalesCotizacion
  // subtotal = Σ redondear(cantidad × precio); neto = Σ totalLinea; descuentos = subtotal − neto; iva = aplica ? redondear(neto × iva_pct/100) : 0; total = neto + iva
export function enClp(monto: number, moneda: Moneda, valor_uf: number | null): number | null   // CLP → monto; UF → redondear(monto × valor_uf, 'CLP'); null si falta valor_uf
export function venceEl(fecha_emision: string /* AAAA-MM-DD */, validez_dias: 15 | 30): string  // suma días calendario (date-fns addDays sobre la fecha ISO, sin zona)

// formato/moneda.ts (se mantiene formatearCLP)
export function formatearMonto(n: number, moneda: Moneda): string   // CLP → formatearCLP(n) ('$565.250'); UF → `UF ${Intl es-CL con 2 decimales}` ('UF 12,50'; negativo '-UF 1,00')
```

Tests `cotizacion/calcular.test.ts` (**tabla**, `it.each`):

| Caso | Entrada | Esperado |
|---|---|---|
| Diseño COT-0218 | 5 líneas: 3×38 000, 4×38 000, 2×45 000, 1×38 000, 1×90 000 con 10 %; CLP, IVA 19 | líneas 114 000 / 152 000 / 90 000 / 38 000 / 81 000; **subtotal 484 000, descuentos 9 000, neto 475 000, iva 90 250, total 565 250** |
| Mismo sin IVA | `aplica_iva: false` | iva 0, total 475 000 |
| Half-up CLP | 1,5 × 33 333 | 49 999,5 → **50 000** |
| Half-up CLP con descuento | 1 × 1 000 con 33,33 % | 666,7 → **667**; subtotal 1 000, descuentos 333 |
| `.005` en UF | 1 × 1,005 UF | **1,01** (no 1,00: el `EPSILON` evita `100.49999`) |
| UF | 2,5 × 1,333 UF | 3,3325 → **3,33**; iva de 3,33 al 19 % = 0,6327 → **0,63**; total 3,96 |
| Redondeo por línea, no al final | 3 líneas de 1 × 0,5 CLP | cada una 1 → neto 3 (sumar antes daría 1,5 → 2) |
| Sin líneas | `[]` | todo 0 |
| Descuento 100 % | 2 × 1 000 con 100 % | línea 0, subtotal 2 000, descuentos 2 000 |
| `enClp` | 10 UF a 38 000,5 | 380 005 |
| `enClp` sin valor | UF, `valor_uf: null` | `null` |
| `venceEl` | `2026-09-29`, 30 | `2026-10-29`; con 15 → `2026-10-14` |
| `formatearMonto` | 565 250 CLP / 12,5 UF / 0 UF | `$565.250` / `UF 12,50` / `UF 0,00` |

```ts
// esquemas/cotizacion.ts
LineaCotizacionEntrada = { tipo: z.enum(TIPOS_LINEA), descripcion: texto(300), cantidad: z.number().positive().max(999_999).multipleOf(0.01),
                           unidad: z.enum(UNIDADES), precio_unitario: z.number().min(0).max(999_999_999).multipleOf(0.01),
                           descuento_pct: z.number().min(0).max(100).multipleOf(0.01).default(0) }
CotizacionEntrada = z.object({ contacto_id: id.nullable(), fecha_emision: fechaIso, validez_dias: z.union([z.literal(15), z.literal(30)]),
                               moneda: z.enum(MONEDAS), valor_uf: z.number().positive().max(999_999).multipleOf(0.01).nullable(),
                               aplica_iva: z.boolean(), condiciones: texto(5000).nullable(), nota_interna: texto(5000).nullable(),
                               lineas: z.array(LineaCotizacionEntrada).max(100) })
                     .refine(v => v.moneda !== 'UF' || v.valor_uf !== null, { path: ['valor_uf'], message: 'Indica el valor de la UF' })
  // Sin `iva_pct` ni totales: la API los pone. Zod descarta claves desconocidas (`total`, `neto`, `iva_pct` enviados por el cliente se ignoran; test §10.6)
ImportarHorasEntrada = { origen: z.enum(['estimadas','reales']).default('estimadas') }
AplicarPlantillaEntrada = { plantilla_id: id }
LineaCotizacionSalida = LineaCotizacionEntrada.extend({ id, orden: z.number().int(), total: z.number() })
CotizacionBreve = { id, ot_id: id, codigo: string, version: z.number().int(), estado: z.enum(ESTADOS_COTIZACION), moneda, neto: number, total: number,
                    neto_clp: z.number().nullable() /* enClp */, enviada_en: instante.nullable(), actualizado_en: instante }
CotizacionVersion = { id, version, estado, total, enviada_en: instante.nullable(), aprobada_en: instante.nullable() }
CotizacionSalida = CotizacionBreve & { ot: { id, codigo: string, titulo: string, tipo: z.enum(TIPOS_OT), etapa: z.enum(ETAPAS_OT), ticket: { id, codigo } },
                    cliente: ClienteBreve.nullable(), contacto: { id, nombre, correo: string|null, area: string|null }.nullable(),
                    fecha_emision: fechaIso, validez_dias, vence_el: fechaIso, valor_uf: z.number().nullable(), aplica_iva: boolean, iva_pct: number,
                    condiciones: string|null, nota_interna: string|null, lineas: z.array(LineaCotizacionSalida),
                    totales: { subtotal, descuentos, neto, iva, total }, total_clp: z.number().nullable(),
                    versiones: z.array(CotizacionVersion) /* todas las de la OT, por version */, vigente: boolean /* es la de mayor versión */,
                    editable: boolean /* vigente && estado === 'borrador' && OT no final */, duplicable: boolean /* vigente && estado ∈ {enviada, rechazada} && OT ∈ {borrador, cotizada} */,
                    enviada_por: referencia.nullable(), rechazada_en: instante.nullable(), aprobada_en, creado_por: referencia.nullable(), creado_en }
CotizacionResumen = CotizacionBreve & { ot: { id, codigo, titulo, etapa }, cliente: ClienteBreve.nullable(), contacto_nombre: string|null, fecha_emision, vence_el, vigente: boolean }
CotizacionesQuery = esquemaPaginacion.extend({ q: texto(80).optional(), estado: csv(ESTADOS_COTIZACION).optional(), cliente_id: idQuery.optional(),
                                               ot_id: idQuery.optional(), solo_vigentes: booleanoTexto.optional(), orden: z.enum(['-actualizado_en','-fecha_emision']).default('-actualizado_en') })

// esquemas/configuracion.ts (nuevo)
TarifasEntrada = { hora_normal: montoClp.nullable(), hora_extendida: montoClp.nullable(), hora_urgencia: montoClp.nullable(), traslado_km: montoClp.nullable(),
                   costo_interno: montoClp.nullable(), iva_pct: z.number().min(0).max(100).multipleOf(0.01), validez_dias_defecto: z.union([z.literal(15), z.literal(30)]),
                   condiciones_defecto: texto(5000).nullable() }      // montoClp = z.number().int().min(0).max(999_999_999); null = "[TARIFA]" sin definir
TarifasSalida = TarifasEntrada
PlantillaLineaEntrada = { tipo, descripcion: texto(300), cantidad: positivo .multipleOf(0.01).default(1), unidad, precio_unitario: montoDecimal.nullable().default(null), descuento_pct: … .default(0) }
PlantillaCotizacionEntrada = { nombre: texto(80), descripcion: texto(300).nullable(), condiciones: texto(5000).nullable(), lineas: z.array(PlantillaLineaEntrada).max(50) }
PlantillaCotizacionSalida = PlantillaCotizacionEntrada & { id, activo: boolean, lineas: z.array(PlantillaLineaEntrada & { id, orden }), creado_en, actualizado_en }
PlantillaActivoEntrada = { activo: z.boolean() }
PlantillasQuery = { activo: booleanoTexto.optional() }   // sin `activo` → solo activas (como /api/usuarios); 'false' → inactivas

// esquemas/ot.ts (cambios)
OtResumen.neto: z.number().nullable()               // neto en CLP de la cotización vigente (enClp); null si no hay cotización o falta valor_uf
OtSalida.cotizacion: CotizacionBreve.extend({ n_versiones: z.number().int() }).nullable()     // la vigente
OtSalida.costo_interno: z.object({ horas: z.number() /* horas.registradas */, tarifa: z.number(), monto: z.number() }).nullable()   // interna con tarifa configurada; si no, null
OtSalida.puede_cotizar: z.boolean()                 // facturable && etapa ∈ {borrador, cotizada} && cliente externo (lo usa el botón "Crear cotización")

// estados/ot.ts (cambio)
export const CambioEtapaOt = z.object({ etapa: z.enum(['borrador','en_ejecucion']) })   // `cotizada` ya no se marca a mano (§6.2)

// eventos.ts (+)
'cotizacion.respondida': { ot_id: number; cotizacion_id: number; resultado: 'aprobada' | 'rechazada'; destinatarios_ids: number[] /* responsables ∪ seguidores del ticket */ }
```

Códigos nuevos en `shared/errores.ts`: `COTIZACION_NO_EDITABLE: 409` ("La cotización no es un borrador o no es la versión vigente"), `COTIZACION_APROBADA: 409` ("La cotización aprobada no se puede cambiar ni duplicar"), `COTIZACION_REQUERIDA: 409` ("La OT necesita una cotización enviada"), `TARIFA_FALTANTE: 409` ("Configura la tarifa en Configuración → Tarifas"). Se reutilizan `OT_CERRADA`, `TRANSICION_INVALIDA`, `VALIDACION`, `NO_ENCONTRADO`, `SIN_PERMISO`.

Tests `esquemas.test.ts`: `CotizacionEntrada` rechaza UF sin `valor_uf`, cantidad 0, descuento 101, 101 líneas, descripción vacía; acepta y **descarta** `total`, `iva_pct`, `neto` extra (`parse` devuelve objeto sin esas claves); `CambioEtapaOt` rechaza `cotizada`; `TarifasEntrada` rechaza montos con decimales o negativos; `PlantillaLineaEntrada` acepta `precio_unitario: null`.

### 4.3 Fábricas (`test/fabricas.ts`)

- `crearCotizacion(ot_id, { version?, estado?, moneda?, valor_uf?, aplica_iva?, iva_pct?, contacto_id?, fecha_emision?, validez_dias?, lineas?: LineaCalculo & { tipo?, descripcion?, unidad? }[], condiciones?, nota_interna? })`: inserta cotización y líneas **calculando totales con `calcularCotizacion`** (misma función que la API), `codigo` derivado de la OT (`'COT-' + ot.codigo.replace(/^\D+/, '')`), `version = max + 1` por defecto, y rellena lo que exigen los `CHECK` (enviada/aprobada/rechazada/reemplazada → `enviada_en`; aprobada → `aprobada_en`).
- `crearPlantilla({ nombre?, lineas? })`; `fijarTarifas(parcial)` escribe la clave `tarifas` de `configuracion` fusionando con la semilla (`hora_normal: 38000, hora_extendida: 45000, iva_pct: 19, validez_dias_defecto: 30`, el resto `null`).
- Test `fabricas-fase4.test.ts`: `crearCotizacion` con las 5 líneas del diseño deja `neto = 475000` y `total = 565250`; dos borradores en la misma OT → viola `cotizacion_borrador_uq`.

## 5. API de cotizaciones (bloque 4C, `modulos/cotizaciones/`)

### 5.1 Endpoints

| Método y ruta | Permiso | Entrada | Salida | Errores / notas |
|---|---|---|---|---|
| `GET /api/cotizaciones` | sesion | `CotizacionesQuery` | paginado de `CotizacionResumen` | lista mínima (§11.3); B10: `lectura` ve montos |
| `GET /api/cotizaciones/:id` | sesion | — | `CotizacionSalida` | 404 |
| `POST /api/ots/:id/cotizaciones` | tickets.editar | — (sin cuerpo) | 201 `CotizacionSalida` | crea **v1** en borrador; ver 5.2; se declara en `cotizaciones.routes.ts` |
| `PUT /api/cotizaciones/:id` | tickets.editar | `CotizacionEntrada` | `CotizacionSalida` | reemplaza encabezado y **todas** las líneas; ver 5.3; 409 `COTIZACION_NO_EDITABLE` |
| `POST /api/cotizaciones/:id/importar-horas` | tickets.editar | `ImportarHorasEntrada` | `CotizacionSalida` | ver 5.5; 409 `TARIFA_FALTANTE` |
| `POST /api/cotizaciones/:id/aplicar-plantilla` | tickets.editar | `AplicarPlantillaEntrada` | `CotizacionSalida` | ver 5.6; 400 si la plantilla no existe o está inactiva |
| `POST /api/cotizaciones/:id/enviar` | tickets.editar | — | `CotizacionSalida` | "Marcar como enviada"; ver 5.7; OT → `cotizada` |
| `POST /api/cotizaciones/:id/duplicar` | tickets.editar | — | 201 `CotizacionSalida` (la nueva) | ver 5.8; 409 `COTIZACION_APROBADA` |
| `DELETE /api/cotizaciones/:id` | tickets.editar | — | 204 | solo borrador vigente; ver 5.9 |
| `GET /api/cotizaciones/:id/descargar.xlsx` | sesion | — | binario `attachment` | ver §7 |
| `GET /api/cotizaciones/:id/descargar.pdf` | sesion | — | binario `attachment` | ver §7 |

Todas las mutaciones: `enTransaccion`; `bloquearOt(tx, cot.ot_id)` → `SELECT … FROM cotizacion WHERE id = $1 FOR UPDATE` (orden §1.2); OT final → 409 `OT_CERRADA`. **Vigente** = la cotización de **mayor `version`** de la OT. Solo la vigente se edita, envía, duplica o elimina; las demás son historial.

### 5.2 Crear (`crearCotizacion(actor, ot_id)`)

`bloquearOt`; `tipo !== 'facturable'` → 400 `VALIDACION { ot: ['Solo una OT facturable se cotiza'] }`; etapa ∉ {`borrador`, `cotizada`} → 409 `TRANSICION_INVALIDA { entidad: 'ot', desde: etapa, hasta: 'cotizada', permitidas }`; `cliente_id` nulo o interno → 400 `VALIDACION { cliente_id: ['La OT debe tener un cliente externo'] }`; ya existe un borrador → 409 `COTIZACION_NO_EDITABLE` ("Ya hay un borrador: edítalo o elimínalo"); la vigente está `enviada` → 409 `COTIZACION_NO_EDITABLE` ("Duplica la cotización enviada como nueva versión"); vigente `aprobada` → 409 `COTIZACION_APROBADA`. Es decir, crear solo vale cuando la OT **no tiene** cotizaciones o todas están `rechazada`/`reemplazada` (caso raro: tras borrar un borrador duplicado). Valores: `version = COALESCE(MAX(version), 0) + 1`, `codigo = 'COT-' + <número de la OT con los dígitos de su código>` (`ot.codigo.replace(/^\D+/, '')`; decisión §18.11), `estado = 'borrador'`, `contacto_id = ot.contacto_id`, `fecha_emision = hoy (Santiago)`, `validez_dias`, `iva_pct`, `condiciones` desde `leerTarifas(tx)` (§8.1), `moneda = 'CLP'`, `aplica_iva = true`, `nota_interna = null`, sin líneas, totales 0, `creado_por = actor`. Evento en la OT `cotizacion_creada { cotizacion_id, codigo, version }` (valor_nuevo `"COT-0218 v1"`). `registrarActividadEnOt`. Devuelve `cargarCotizacion(tx, id)`.

### 5.3 Editar (`editarCotizacion(actor, id, e)`)

Bloqueos; no vigente o `estado !== 'borrador'` → 409 `COTIZACION_NO_EDITABLE`; OT final → 409 `OT_CERRADA`. Validar `contacto_id` (activo y de `ot.cliente_id`; 400). **Recalcular**: `const r = calcularCotizacion(e.lineas, { moneda: e.moneda, aplica_iva: e.aplica_iva, iva_pct: cot.iva_pct })` —`iva_pct` es el snapshot de la cotización, **nunca** el del cuerpo—; `UPDATE cotizacion SET contacto_id, fecha_emision, validez_dias, moneda, valor_uf (NULL si CLP), aplica_iva, condiciones, nota_interna, subtotal, descuentos, neto, iva, total, actualizado_en`; `DELETE FROM linea_cotizacion WHERE cotizacion_id` e `INSERT` de las nuevas con `orden` 1..n y `total = r.lineas[i]`. `registrarCambios` (`entidad = 'ot'`, `datos: { cotizacion_id, version }` en cada evento) con campos y etiquetas: `contacto` (nombre), `fecha_emision` (`formatearFecha`), `validez_dias` ("30 días"), `moneda`, `valor_uf` (`formatearCLP`), `aplica_iva` ("sí"/"no"), `lineas` (`"5 líneas"`), `neto` y `total` (`formatearMonto`), `condiciones` y `nota_interna` (recortadas a 120). `registrarActividadEnOt`.

### 5.4 Consulta (`cotizaciones.consulta.ts`)

`cargarCotizacion(m, id)`: una consulta con `JOIN ot`, `JOIN ticket`, `LEFT JOIN cliente`, `LEFT JOIN contacto`, usuarios; líneas por `orden`; `versiones` = todas las de la OT por `version`; `vigente = version === MAX(version)`; `vence_el = venceEl(fecha_emision, validez_dias)`; `total_clp = enClp(total, moneda, valor_uf)`; `editable`/`duplicable` según §5.1 y la etapa de la OT. `listarCotizaciones(m, q)`: `q` por dígitos → `codigo ILIKE` o número de OT; texto → `codigo`, `ot.titulo`, `cliente.nombre`; `solo_vigentes=true` → `version = (SELECT max(version) … WHERE ot_id = c.ot_id)`; orden `-actualizado_en` (defecto) o `-fecha_emision`; nunca por `version` ni `codigo` (ADR 0014). `cotizacionVigente(m, ot_id): Promise<{ id, version, estado, moneda, neto, total, valor_uf, enviada_en, actualizado_en, n_versiones } | null>` exportada para `cargarOt` y `listarOts` (§6.1).

### 5.5 Importar horas de las tareas (`importarHoras(actor, id, e)`)

Bloqueos y mismas condiciones de edición que 5.3. Tarifa: `tarifaHora = tarifa_cliente(hora_normal) del ot.cliente_id ?? tarifas.hora_normal` (B12); si ambas son `null` → 409 `TARIFA_FALTANTE { concepto: 'hora_normal' }`. Tareas de la OT con `horas_<origen> > 0` por `orden`; por cada una se **agrega** (tras las líneas existentes) una línea `{ tipo: 'mano_de_obra', descripcion: tarea.titulo, cantidad: horas, unidad: 'h', precio_unitario: tarifaHora, descuento_pct: 0 }`. Sin tareas con horas → 400 `VALIDACION { origen: ['Las tareas no tienen horas estimadas'] }` (o "reales"). Recalcular y guardar como 5.3. Evento `cotizacion_lineas_agregadas { cotizacion_id, version, n, origen: 'tareas' }`. La línea 3 del diseño (horario extendido a $45.000) la cambia la persona a mano: la importación no adivina horario extendido (decisión §18.6).

### 5.6 Aplicar plantilla (`aplicarPlantilla(actor, id, e)`)

Como 5.5 con las líneas de la plantilla activa (400 si no existe o está inactiva): `precio_unitario = plantilla.precio_unitario ?? tarifa por unidad` donde `h → hora_normal` (cliente > global), `km → traslado_km` (cliente > global), `un`/`gl → 0` (se completa a mano); sin tarifa para una línea `h`/`km` → `TARIFA_FALTANTE { concepto }`. Si la cotización no tiene `condiciones` y la plantilla sí, se copian. Evento `cotizacion_lineas_agregadas { …, origen: 'plantilla', plantilla_id }`.

### 5.7 Enviar — "Marcar como enviada" (`enviarCotizacion(actor, id)`)

Bloqueos; no vigente o no borrador → 409 `COTIZACION_NO_EDITABLE`; sin líneas → 400 `VALIDACION { lineas: ['Agrega al menos una línea'] }`; `contacto_id` nulo → 400 `VALIDACION { contacto_id: ['Indica el contacto que recibe la cotización'] }`; OT: `tipo !== 'facturable'` o etapa ∉ {`borrador`, `cotizada`} → 409 `TRANSICION_INVALIDA`; cliente interno → 400 (misma regla que la antigua marca manual). Entonces, en la misma transacción:
1. `UPDATE cotizacion SET estado = 'enviada', enviada_en = now(), enviada_por = actor`; las versiones anteriores en `enviada` → `reemplazada` (`UPDATE … WHERE ot_id = $1 AND id <> $2 AND estado = 'enviada'`).
2. `UPDATE ot SET contacto_id = COALESCE(contacto_id, $cot.contacto_id)`; si la OT está en `borrador`, `registrarEtapa`-equivalente a `cotizada` (reutiliza la función de `ots.etapas.service.ts`, que se exporta; evento `cambio etapa` "Borrador" → "Cotizada" con `datos: { cotizacion_id, codigo, version }`); si ya está en `cotizada` (nueva versión enviada) no cambia de etapa.
3. Evento en la OT `cotizacion_enviada { cotizacion_id, codigo, version, moneda, neto, total }` (valor_nuevo `"COT-0218 v1 · $565.250"`). `registrarActividadEnOt` y `registrarActividadEnTicket` (la OT vinculada cambió de etapa; el tablero muestra la etiqueta).

No envía correo (ADR 0013): el documento se descarga y se envía fuera de la app; "enviada" registra ese hecho.

### 5.8 Duplicar como vN (`duplicarCotizacion(actor, id)`)

Bloqueos; no vigente → 409 `COTIZACION_NO_EDITABLE`; `estado === 'aprobada'` o la OT en `aprobada`/`en_ejecucion` → 409 `COTIZACION_APROBADA` ("lo aprobado queda congelado"); `estado === 'borrador'` → 409 `COTIZACION_NO_EDITABLE` ("Ya es un borrador"); OT final → `OT_CERRADA`. Permitido desde `enviada` y `rechazada` con la OT en `borrador` o `cotizada`. Crea `version + 1` en `borrador` copiando encabezado (`contacto_id`, `validez_dias`, `moneda`, `valor_uf`, `aplica_iva`, `iva_pct` **de la original** —snapshot fiscal—, `condiciones`, `nota_interna`), `fecha_emision = hoy`, líneas y totales tal cual; `creado_por = actor`. Evento `cotizacion_creada { cotizacion_id, codigo, version, desde_version }` (valor_nuevo `"COT-0218 v2"`). La original conserva su estado (`enviada` sigue siendo lo que el cliente tiene hasta que se envíe la v2, que la marca `reemplazada`).

### 5.9 Eliminar borrador (`eliminarCotizacion(actor, id)`)

Bloqueos; solo vigente y `borrador` (si no, 409 `COTIZACION_NO_EDITABLE`). `DELETE` (las líneas caen por `CASCADE`). Evento `cotizacion_eliminada { cotizacion_id, codigo, version }`. Si era la única cotización de una OT en `borrador`, la OT queda sin cotización (botón "Crear cotización" vuelve a aparecer).

## 6. Cambios en `modulos/ots` (bloque 4C)

### 6.1 `cargarOt` y `listarOts` (`ots.consulta.ts`)

- `SELECT_RESUMEN` gana una subconsulta `LATERAL` con la cotización vigente (`ORDER BY version DESC LIMIT 1`) y calcula `neto` en CLP: `CASE moneda WHEN 'CLP' THEN neto WHEN 'UF' THEN round(neto * valor_uf) END` (el redondeo SQL coincide con `enClp`; test que compara ambos sobre la semilla). Sin cotización → `NULL`.
- `OtSalida.cotizacion = cotizacionVigente(m, id)` con `n_versiones`; `null` si no hay.
- `OtSalida.costo_interno`: solo `tipo = 'interna'` y `tarifas.costo_interno` no nulo → `{ horas: horas.registradas, tarifa, monto: redondear(horas × tarifa, 'CLP') }`; si no, `null`. Decisión §18.8.
- `OtSalida.puede_cotizar` según §4.2.
- `ContextoCierreOt.ot.neto` del cierre (`ots.cierre.service.ts`) deja de ser `null`: `neto` en CLP de la vigente. Test en `cierre.test.ts`: cerrar OT-0217 (semilla) produce `datos`/texto con `($1.240.000 neto)` como en el diseño "Cerrar OT-0218".

### 6.2 Etapas (`ots.etapas.service.ts`)

- `cambiarEtapa` ya no acepta `cotizada` (Zod). La validación de cliente externo se mueve a `enviarCotizacion` (§5.7). La función que registra la etapa (`registrarEtapa`) se **exporta** para que `cotizaciones.service` la reutilice con el mismo `tx` (regla de módulos de `CLAUDE.md`: `ots` escribe en `ot`; `cotizaciones` le pasa el `tx`).
- `cotizada → borrador` ("Volver a borrador", rechazo del cliente, ADR 0004): tras bloquear la OT, bloquea la cotización vigente; si está `enviada` → `UPDATE estado = 'rechazada', rechazada_en = now()` y evento `cotizacion_rechazada { cotizacion_id, codigo, version }`; tras el commit `publicar('cotizacion.respondida', { ot_id, cotizacion_id, resultado: 'rechazada', destinatarios_ids })`. Si la vigente es un `borrador` (v2 en preparación) o no hay cotización (OT cotizada a mano antes de esta fase), no toca cotizaciones. Esta función vive en `cotizaciones.service.ts` (`rechazarVigenteEnTx(tx, actor, ot)`) y `ots.etapas.service` la importa: dependencia `ots → cotizaciones` permitida (no circular: `cotizaciones` importa de `ots` solo `bloquearOt`, `registrarActividadEnOt`, `registrarEtapa` y `cargarOt`… **no**: para evitar el ciclo, `cotizaciones` importa de `ots.acceso.ts` y `ots.etapas.service.ts`, y `ots.etapas.service.ts` importa de `cotizaciones.service.ts` → ciclo). **Regla**: `cotizaciones.service.ts` importa de `ots/ots.acceso.ts` (bloqueo, actividad) y de `ots/ots.etapas.service.ts` (`registrarEtapa`); `ots/ots.etapas.service.ts` **no** importa de `cotizaciones`: la lógica de rechazo y de aprobación de la cotización vive en `cotizaciones/cotizaciones.estados.ts` con funciones `rechazarVigenteEnTx` y `aprobarVigenteEnTx` que **reciben el `tx` y la OT bloqueada**, y `ots.etapas.service.ts` las importa desde ese archivo, que a su vez solo importa `shared`, `core` y `ots.acceso.ts`. Así no hay ciclo (`ots.etapas → cotizaciones.estados → ots.acceso`), igual que `tickets ↔ ots` se limita a `*.service.ts` en la Fase 3.
- `registrarAprobacionCliente` (`PUT /api/ots/:id/aprobacion`): tras bloquear la OT y antes de insertar `aprobacion_cliente`, `aprobarVigenteEnTx(tx, actor, ot)`: la vigente debe existir y estar `enviada`; si no hay cotización o la vigente es `borrador`/`rechazada` → 409 `COTIZACION_REQUERIDA { cotizacion: vigente ? { id, version, estado } : null }` (con un `borrador` v2 pendiente hay que enviarlo o eliminarlo). `UPDATE estado = 'aprobada', aprobada_en = now()`; evento `cotizacion_aprobada { cotizacion_id, codigo, version, moneda, neto, total }`; el evento `cambio etapa` "Cotizada" → "Aprobada por cliente" gana `datos.cotizacion_id`. Tras el commit `publicar('cotizacion.respondida', { …, resultado: 'aprobada' })`. **Congelación**: con una `aprobada`, `cotizacion_aprobada_uq` impide otra; `duplicar` responde 409 `COTIZACION_APROBADA`; `editar` 409 `COTIZACION_NO_EDITABLE`; crear 409. La única salida es cancelar la OT (la cotización aprobada queda como historial) o, antes de aprobar, "Volver a borrador".
- OT ya `cotizada` sin cotización (marcadas a mano en la Fase 3): no existen en producción (Fases 0–3 no desplegadas); las semillas se corrigen (§14). No hay migración de datos. Un `PUT aprobacion` sobre una OT así responde `COTIZACION_REQUERIDA`: se crea y envía la cotización primero (§18.1).

### 6.3 Bolsa (`editarOt`, regla mínima; precisa ADR 0015 y 0024)

`descuenta_bolsa: true` cuando `ot.contrato_id` **ya no es null** → **no se toca** `contrato_id` (no se vuelve a resolver el contrato vigente) y no cuenta como cambio para la regla de ADR 0024.3. Para cambiar de contrato (p. ej. una bolsa renovada) hay que enviar `false` y luego `true`, en Borrador o Cotizada, o con `ots.aprobar` en etapas posteriores. `descuenta_bolsa: true` con `contrato_id` null sigue resolviendo el vigente (400 si no hay). Test §10.12.

### 6.4 Rutas

`ots.routes.ts`: sin cambios de forma salvo el enum de `cambiar-etapa` (resumen "Cambiar la etapa de una OT (Borrador, En ejecución)"). `cotizaciones.routes.ts` declara `POST /api/ots/:id/cotizaciones` (igual que `convertir-en-ot` vive en `ots.routes.ts`). `app.ts` monta `crearRutasCotizaciones()`.

## 7. Documentos: `.xlsx` y PDF (bloque 4C, `integraciones/xlsx/cotizacion.xlsx.ts`, `integraciones/pdf/cotizacion.pdf.ts`)

Ambos reciben `CotizacionSalida` + `{ nombre_app, logo?: { tipo_mime, datos } }` y devuelven `Buffer`. Son funciones puras (sin BD) con tests propios. El servicio `descargarCotizacion(actor, id, formato)`:
1. `cargarCotizacion`; `obtenerMarca`/`leerLogo` (logo solo si es PNG o JPEG; SVG se omite en el PDF).
2. Genera el buffer; nombre `${codigo}_v${version}.xlsx|pdf` (`COT-0218_v1.xlsx`), con `-BORRADOR` antes de la extensión si `estado === 'borrador'`.
3. `enTransaccion`: evento en la OT `cotizacion_descargada { cotizacion_id, codigo, version, formato }` (ADR 0003 lo nombra) y `registrarAuditoria('exportacion', { tipo: formato, entidad: 'cotizacion', entidad_id, ot_id })` (ADR 0017; es `attachment`, coherente con ADR 0021). `registrarActividadEnOt` **no** (descargar no es trabajo sobre la OT).
4. La ruta responde `Content-Type` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / `application/pdf`), `Content-Disposition: attachment` con el mismo `contentDisposition()` de `archivos.routes.ts` (se mueve a `core/http/descarga.ts` y lo usan ambas rutas), `Cache-Control: no-store`, `Content-Length`. `respuesta: z.unknown()` y `return undefined` como la descarga de archivos.

Los documentos **no se guardan** como `archivo` de la OT (decisión §18.5): la cotización enviada es inmutable y se regenera igual cada vez.

### 7.1 Planilla (exceljs)

Hoja "Cotización" (`views: [{ showGridLines: false }]`), columnas A–I con anchos fijos:
- Filas 1–7: `nombre_app` (negrita 14), "Cotización COT-0218 v1" (si borrador: "BORRADOR · Cotización …"), "Fecha de emisión" / "Válida hasta" (`vence_el`, formato `dd-mm-yyyy`), "Cliente" / "Contacto" (nombre y correo), "Orden de trabajo" (`OT-0218 · título`) / "Ticket". Si UF: "Valor UF al dd-mm-yyyy: $38.000" (ADR 0007).
- Fila 9: cabecera `N° · Tipo · Descripción · Cantidad · Unidad · Precio unitario · Desc. % · Total · (Bruto)`; columna **I "Bruto"** oculta (`hidden: true`) para el subtotal.
- Filas 10..9+n: valores numéricos en D, F, G; **fórmulas** `H = ROUND(D{r}*F{r}*(1-G{r}/100), d)` e `I = ROUND(D{r}*F{r}, d)` con `d = decimalesDe(moneda)` y `result` = valor calculado por `shared` (así se ve bien aunque el visor no recalcule). La **descripción se escribe siempre como texto** (`cell.value = String(descripcion)`; una descripción que empiece por `=`, `+`, `-` o `@` queda como cadena, nunca como fórmula: test §10.17).
- Totales (dos filas bajo las líneas, etiquetas en G y fórmulas en H): `Subtotal = SUM(I10:I{n})`, `Descuentos = H_sub - H_neto`, `Neto = SUM(H10:H{n})`, `IVA = IF($B$k, ROUND(H_neto*$B$j/100, d), 0)` con `B$k` = celda `aplica_iva` (TRUE/FALSE) y `B$j` = celda `iva_pct` (ambas en el bloque de encabezado, etiquetadas "Aplica IVA" e "IVA %"), `Total = H_neto + H_iva`; cada una con `result`. Formato numérico `#,##0` (CLP) o `#,##0.00` (UF) en F, H, I y totales; `0.00` en D y G.
- Debajo: "Condiciones comerciales" con el texto (`alignment: { wrapText: true }`). **Nunca** `nota_interna`.
- `workbook.creator = nombre_app`, `created = ahora`.

### 7.2 PDF (pdfmake)

`PdfPrinter` con fuentes `Roboto` tomadas de `pdfmake/build/vfs_fonts` (`Buffer.from(vfs['Roboto-Regular.ttf'], 'base64')`, etc.; decisión §18.9). Página A4, márgenes 40. Contenido: logo (si PNG/JPEG, 120 px de ancho) y `nombre_app`; título "Cotización COT-0218 v1" (con "BORRADOR" en rojo si corresponde); bloque de datos (emisión, válida hasta, cliente, contacto, OT y ticket); tabla de líneas (`N°`, `Descripción` con el tipo en gris debajo, `Cant.`, `Un.`, `P. unitario`, `Desc.`, `Total`) con montos `formatearMonto` alineados a la derecha; totales a la derecha (subtotal, descuentos como `−$9.000`, neto, "IVA 19 %" o "Exento de IVA", **total en negrita**); si UF, línea "Equivale a $X al valor UF del dd mmm aaaa"; "Condiciones comerciales" en párrafo; pie "Generado con {nombre_app} · {fecha}". Sin `nota_interna`. `info: { title, author: nombre_app }`. El PDF se genera con `createPdfKitDocument` → `Buffer` (concatenando el stream).

## 8. Configuración: tarifas, IVA, validez y plantillas (bloque 4D, `modulos/configuracion/`)

### 8.1 Tarifas (`configuracion.service.ts`)

Clave `tarifas` en `configuracion` (jsonb) con la forma de `TarifasSalida`; la semilla base (`sembrarBase`) inserta `{"hora_normal":null,"hora_extendida":null,"hora_urgencia":null,"traslado_km":null,"costo_interno":null,"iva_pct":19,"validez_dias_defecto":30,"condiciones_defecto":null}` con `ON CONFLICT DO NOTHING` (los valores del diseño van en la semilla de desarrollo, §14). `leerTarifas(m): Promise<TarifasSalidaDatos>` **exportada** (la usan 4C y `cargarOt`), que valida con `TarifasSalida.parse` y, si la clave falta (base antigua), devuelve los valores por defecto. `guardarTarifas(actor, e)`: `guardarClave('tarifas', e)` + `registrarAuditoria('config_cambiada', { seccion: 'tarifas', campos: <claves cuyo valor cambió> })` (sin montos en `detalle`: ids y nombres de campo). Cambiar `iva_pct` **no** altera cotizaciones existentes (snapshot, ADR 0007; test).

| Método y ruta | Permiso | Entrada | Salida |
|---|---|---|---|
| `GET /api/config/tarifas` | sesion | — | `TarifasSalida` (el cotizador necesita las tarifas; B10) |
| `PUT /api/config/tarifas` | config.editar | `TarifasEntrada` | `TarifasSalida` |

### 8.2 Plantillas (`plantillas.service.ts` dentro de `modulos/configuracion/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/config/plantillas-cotizacion` | sesion | `PlantillasQuery` | `PlantillaCotizacionSalida[]` por `nombre` | sin `activo` → activas |
| `POST /api/config/plantillas-cotizacion` | config.editar | `PlantillaCotizacionEntrada` | 201 | nombre único sin distinguir mayúsculas → 409 `CONFLICTO { nombre }` |
| `PUT /api/config/plantillas-cotizacion/:id` | config.editar | `PlantillaCotizacionEntrada` | 200 | reemplaza líneas |
| `PATCH /api/config/plantillas-cotizacion/:id/activo` | config.editar | `PlantillaActivoEntrada` | 200 | desactivar (no se borran: una cotización pudo nacer de ella) |

Auditoría `config_cambiada { seccion: 'plantillas', plantilla_id, accion: 'creada' | 'editada' | 'activada' | 'desactivada' }`. Sin `evento` (configuración, ADR 0003).

## 9. Eventos y auditoría generados en esta fase

| Acción | `evento` `entidad = 'ot'` (todos con `datos.cotizacion_id` y `datos.version`) | `evento` `entidad = 'ticket'` | `auditoria` | evento de dominio (tras commit) |
|---|---|---|---|---|
| Crear v1 / Duplicar | `cotizacion_creada { codigo, version, desde_version? }` | — | — | — |
| Editar | `cambio` por campo de §5.3 | — | — | — |
| Importar horas / aplicar plantilla | `cotizacion_lineas_agregadas { n, origen, plantilla_id? }` | — | — | — |
| Marcar como enviada | `cotizacion_enviada { codigo, version, moneda, neto, total }` + `cambio etapa` Borrador → Cotizada si aplica | — | — | — |
| Aprobación del cliente (`PUT aprobacion`) | `cotizacion_aprobada {…}` + `cambio etapa` (ya existía, con `datos.cotizacion_id`) | — | — | `cotizacion.respondida` (aprobada) |
| Volver a borrador | `cotizacion_rechazada {…}` + `cambio etapa` (ya existía) | — | — | `cotizacion.respondida` (rechazada) |
| Eliminar borrador | `cotizacion_eliminada { codigo, version }` | — | — | — |
| Descargar .xlsx / .pdf | `cotizacion_descargada { codigo, version, formato }` | — | `exportacion { tipo, entidad: 'cotizacion', entidad_id, ot_id }` | — |
| Tarifas / plantillas | — | — | `config_cambiada { seccion: 'tarifas' \| 'plantillas', … }` | — |

Cobertura (ADR 0003): `cotizaciones/eventos.test.ts` ejecuta cada mutación (`POST cotizaciones`, `PUT`, `importar-horas`, `aplicar-plantilla`, `enviar`, `duplicar`, `DELETE`, `descargar.xlsx`, `descargar.pdf`, `PUT /api/ots/:id/aprobacion`, `cambiar-etapa borrador`) y afirma que `count(*) FROM evento WHERE entidad = 'ot' AND entidad_id = $ot` aumenta y que `datos->>'cotizacion_id'` es el esperado; que las descargas crean `auditoria.accion = 'exportacion'`; y que `GET /api/cotizaciones/:id` no crea nada.

## 10. Pruebas de seguridad obligatorias (`cotizaciones/seguridad.test.ts`, bloque 4C; las de configuración en `configuracion/tarifas.test.ts`)

1. Test genérico de permisos (Fase 1) verde con las rutas nuevas: sin sesión → 401 en todas.
2. **Roles**: `lectura` → 200 en `GET /api/cotizaciones`, `GET /:id`, ambas descargas y `GET /api/config/tarifas` y `/plantillas-cotizacion`; **403** en toda mutación. `tecnico` → 201/200 en crear, `PUT`, importar, plantilla, enviar, duplicar, `DELETE`; **403** en `PUT /api/config/tarifas` y en las mutaciones de plantillas. `coordinacion` → 200 en `PUT /api/ots/:id/aprobacion`, 403 en configuración. `admin` → todo.
3. **Tipo de OT**: `POST /api/ots/:id/cotizaciones` en una OT interna → 400; con cliente interno → 400; en `aprobada`/`en_ejecucion`/`cerrada`/`cancelada` → 409 (`TRANSICION_INVALIDA` u `OT_CERRADA`).
4. **Un borrador por OT**: segundo `POST cotizaciones` → 409 `COTIZACION_NO_EDITABLE`; `crearCotizacion` por fábrica dos veces en borrador → error de índice único.
5. **Inmutabilidad**: `PUT` sobre `enviada` → 409 `COTIZACION_NO_EDITABLE` y las filas no cambian (`actualizado_en` igual); `PUT` sobre la v1 cuando existe v2 → 409 (no vigente); `PUT`, `duplicar`, `POST cotizaciones` con una `aprobada` → 409 `COTIZACION_APROBADA`/`COTIZACION_NO_EDITABLE`; `DELETE` de una `enviada` → 409.
6. **Recalcular en servidor / montos manipulados**: `PUT` con `lineas` del diseño más `total: 1, neto: 1, iva_pct: 0, totales: {…}` en el cuerpo → 200 con `totales.neto = 475000`, `totales.total = 565250`, `iva_pct = 19` y en BD lo mismo; `PUT` con `cantidad: 0`, `precio_unitario: -1`, `descuento_pct: 101`, `cantidad: 1.001` → 400 `VALIDACION` por campo; `PUT` con 101 líneas → 400; `PUT` UF sin `valor_uf` → 400; cambiar `iva_pct` en `PUT /api/config/tarifas` a 0 **no** cambia `iva_pct` ni `total` de una cotización existente, pero una nueva nace con 0.
7. **Contacto**: `contacto_id` de otro cliente o inactivo → 400; `enviar` sin contacto → 400; `enviar` sin líneas → 400.
8. **Enviar**: OT `borrador` → tras enviar `etapa = 'cotizada'` con evento `cambio etapa` cuyo `datos.cotizacion_id` coincide; enviar v2 (duplicada de una v1 `enviada`) deja v1 `reemplazada` y la OT sigue `cotizada` con `OtSalida.cotizacion.version = 2`; `enviar` dos veces → 409.
9. **Aprobación congela**: `PUT /api/ots/:id/aprobacion` sin cotización → 409 `COTIZACION_REQUERIDA`; con vigente `borrador` → 409 con `detalles.cotizacion.estado = 'borrador'`; con vigente `enviada` → 200, cotización `aprobada` con `aprobada_en`, `OtSalida.cotizacion.estado = 'aprobada'`, `neto` en `OtResumen`; luego `duplicar` → 409 `COTIZACION_APROBADA`.
10. **Rechazo**: OT `cotizada` con vigente `enviada` → `cambiar-etapa { etapa: 'borrador' }` → 200, cotización `rechazada` con `rechazada_en`, evento `cotizacion_rechazada`, evento de dominio `cotizacion.respondida { resultado: 'rechazada' }` en el oyente; `duplicar` desde `rechazada` → 201 v2 `borrador`.
11. **`cambiar-etapa { etapa: 'cotizada' }`** → 400 (Zod): la marca manual desapareció.
12. **Bolsa** (§6.3): OT facturable con `contrato_id = A`; se crea un contrato B (A con `vigente_hasta` ayer, B desde hoy); `PATCH { descuenta_bolsa: true }` por un técnico en `aprobada` → 200 **sin** cambiar `contrato_id` (sigue A) y sin `evento`; en `borrador` `PATCH { descuenta_bolsa: false }` y luego `true` → B.
13. **Importar horas**: sin tarifa global ni del cliente → 409 `TARIFA_FALTANTE`; con `tarifa_cliente.hora_normal = 40000` y global 38 000 → líneas a 40 000 (B12); sin tarifa del cliente → 38 000; tareas sin horas → 400; `origen: 'reales'` toma `horas_reales`.
14. **Plantilla**: plantilla inactiva → 400; línea `h` sin tarifa → 409 `TARIFA_FALTANTE { concepto: 'hora_normal' }`; línea `un` sin precio → 0.
15. **Listados**: `GET /api/cotizaciones?estado=enviada`, `?solo_vigentes=true` (una OT con v1 reemplazada y v2 enviada devuelve solo v2), `?q=218`, `?q=COT-0218`, `?cliente_id`, `?ot_id`; `GET /api/ots` muestra `neto` de la vigente (UF convertida) y `null` sin cotización.
16. **Descargas**: `.xlsx` y `.pdf` responden 200, `Content-Disposition: attachment; filename="COT-0218_v1.xlsx"` (con `-BORRADOR` en borrador), auditoría `exportacion` con `entidad = 'cotizacion'` y `tipo`, y un `evento` `cotizacion_descargada` en la OT; `lectura` descarga (B10); 404 con id inexistente; **ninguna** fila de `archivo` nueva.
17. **Contenido de los documentos** (`integraciones/xlsx/cotizacion.xlsx.test.ts`, `integraciones/pdf/cotizacion.pdf.test.ts`): el `.xlsx` releído con exceljs tiene en la celda Total de la primera línea `formula` que contiene `ROUND(` y `result = 114000`, totales con `result` 484 000 / 9 000 / 475 000 / 90 250 / 565 250, formato `#,##0`, la columna Bruto oculta; una descripción `=1+1` y otra `@cmd` quedan con `type === ValueType.String` y sin `formula`; la hoja **no contiene** el texto de `nota_interna`; en UF los formatos son `#,##0.00` y aparece "Valor UF". El PDF empieza por `%PDF-`, pesa > 1 KB, `info.Title` incluye `COT-0218 v1`; el buffer, descomprimido con `zlib.inflateSync` sobre cada stream `FlateDecode`, no contiene el texto de `nota_interna` (la nota se escribe como texto único `NOTA-INTERNA-SECRETA-XYZ` en el test; basta comprobar que ese literal no aparece ni crudo ni en los streams inflados).
18. **Texto**: descripción `'<img src=x onerror=alert(1)>'` y condiciones con HTML se guardan y devuelven literales; en el `.xlsx` quedan como texto.
19. **Logs**: `PUT` y `enviar` no dejan en el logger de test `descripcion`, `condiciones`, `nota_interna`, `neto` ni `total` (solo ids).
20. **Eventos de dominio**: `cotizacion.respondida` llega al oyente con `destinatarios_ids` = responsables ∪ seguidores del ticket; no se publica si la transacción falla (`contacto_id` inválido en la aprobación).
21. **Numeración**: `codigo` de la cotización coincide con el número de la OT (`OT-0200` → `COT-0200`); con contador OT a 6 dígitos (`PUT /api/config/numeracion`), una OT nueva `OT-000201` da `COT-000201`; cambiar el prefijo de OT a `OTX-` **no** altera cotizaciones existentes ni el prefijo `COT-`.
22. `X-Request-Id` presente en 409 y `evento.req_id` de un `enviar` coincide con la cabecera.

## 11. Web cotizador (bloque 4E)

### 11.1 API del front (`features/cotizador/api.ts`)

`cotizaciones(query)`, `cotizacion(id)`, `crearCotizacion(otId)`, `guardarCotizacion(id, entrada)`, `importarHoras(id, origen)`, `aplicarPlantilla(id, plantillaId)`, `enviarCotizacion(id)`, `duplicarCotizacion(id)`, `eliminarCotizacion(id)`, `urlDescarga(id, formato)`, `tarifas()`, `plantillas()`. Claves: `['cotizaciones', query]`, `['cotizacion', id]`, `['tarifas']`, `['plantillas']`. `invalidarCotizacion(queryClient, id, otId, ticketId)`: `['cotizacion', id]`, `['cotizaciones']` y `invalidarOt(queryClient, otId, ticketId)` (reutilizada de `features/ots/api.ts`). `lib/api.ts` gana `descargar(ruta): Promise<void>` (fetch con `credentials: 'same-origin'`, lee `filename*`/`filename` del `Content-Disposition`, crea un `Blob` y un `<a download>`; errores JSON pasan por `procesar`).

### 11.2 Componentes de dominio (`components/dominio/`)

- `Monto({ valor, moneda = 'CLP', className })`: `formatearMonto` en `font-mono`, alineado a la derecha (`tabular-nums`). Sustituye los `formatearCLP` sueltos nuevos (no se tocan los existentes).
- `PillEstadoCotizacion({ estado })`: `borrador → neutro`, `enviada → acento`, `aprobada → resuelto`, `rechazada → alta`, `reemplazada → neutro` con `line-through`.

### 11.3 Rutas

`router.tsx`: `/cotizaciones` → `CotizacionesPage` (lista mínima); `/cotizaciones/:id` → `CotizadorPage` (reemplaza el placeholder). `menu.ts` no cambia. `TituloPagina` recibe "COT-0218 v1 · Zydesk".

**`CotizacionesPage`** (vista, ADR 0022): chips en la URL **Todas · Borradores · Enviadas · Aprobadas** (`estado=`; por defecto `solo_vigentes=true`), búsqueda `q`, tabla con Cotización (`Codigo` "COT-0218 v1", enlace), OT (enlace), Cliente, Emisión, Vence, Estado (`PillEstadoCotizacion`), Neto y Total (`Monto`), paginación; bajo 1024 px scroll horizontal con la primera columna fija (como `/ots`). Vacío: "Sin cotizaciones. Se crean desde una OT facturable." Tests: chips cambian la URL; una fila muestra `$565.250`.

### 11.4 Pantalla 7 — Cotizador (`features/cotizador/pages/CotizadorPage.tsx`)

Diseño "Cotizador COT-0218". Mobile-first: a ≥ 1024 px columna principal 1fr + panel derecho 320 px (totales y versiones); bajo 1024 px el panel se apila y los **totales quedan fijos al pie** (`sticky bottom-0`) mientras se editan líneas; bajo 768 px cada línea es una **tarjeta** con los campos apilados (no tabla).

1. **Encabezado**: `Codigo` "COT-0218 v1" + `PillEstadoCotizacion`; "OT-0218 · Regularización de folios…" (enlace a la OT) y "TK-1048" (enlace); cliente; **acciones** (`usePermiso('tickets.editar')`): con `editable` → "Guardar" (primario, deshabilitado sin cambios o con errores), "Importar horas de las tareas…", "Aplicar plantilla…", "Marcar como enviada…" (`AlertDialog`: "Descarga el documento y envíalo al cliente fuera de la app. Al confirmar, la OT pasa a Cotizada y esta versión deja de ser editable."; con cambios sin guardar el botón está deshabilitado con tooltip "Guarda primero"), "Eliminar borrador…" (`AlertDialog`); con `duplicable` → "Duplicar como v{n+1}"; siempre → "Descargar .xlsx" y "Descargar PDF" (`descargar(urlDescarga(...))`; toast "Descarga registrada en el historial de la OT"); sin permiso → "Solo lectura". Estados `enviada`/`aprobada`/`rechazada`/`reemplazada` muestran un aviso bajo el título: "Enviada el 29 sep · ya no se edita; duplica para hacer cambios" / "Aprobada por el cliente el 30 sep · congelada" / "Rechazada: duplica como v2 para corregir" / "Reemplazada por la v2".
2. **Datos** (tarjeta, RHF + `zodResolver(CotizacionEntrada)`; todo deshabilitado si no `editable`): Contacto (`Select` con los contactos activos del cliente; los que aprueban cotizaciones llevan "aprueba"), Fecha de emisión (`input type=date`), Validez (`Select` 15 / 30 días; texto "Vence el 29 oct 2026" con `venceEl`), Moneda (`Select` CLP / UF; con UF aparece Valor UF `input type=number step=0.01` con prefijo `$`), casilla **"Aplica IVA 19 %"** (texto con `iva_pct` de la cotización), Condiciones comerciales (`Textarea`, ayuda "Va en la planilla y el PDF"), Nota interna (`Textarea` con fondo `nota-interna`, ayuda "Solo el equipo la ve; no va en los documentos").
3. **Líneas** (`TablaLineas`, `useFieldArray`): columnas `N° · Tipo (Select) · Descripción (Input) · Cantidad (number, step 0.01, min 0.01) · Unidad (Select) · Precio unitario (number, step según moneda) · Desc. % (number) · Total (Monto, calculado) · quitar`; fila "Agregar línea" al pie (tipo Mano de obra, cantidad 1, unidad h, precio = `tarifas.hora_normal ?? 0`, como el diseño); cálculo **en vivo** con `calcularCotizacion` sobre `watch('lineas')`; errores por campo bajo el control; `aria-label` por celda ("Cantidad de la línea 3"). Vacío (sin líneas): `EstadoVacio` "Sin líneas" con botones "Importar horas de las tareas", "Aplicar plantilla" y "Agregar línea".
4. **Totales** (`TotalesCotizacion`, panel): `dl` Subtotal · Descuentos (`−$9.000`, en `alta` si > 0) · **Neto** · IVA (o "Exento") · **Total** (grande, `font-titulo`); si UF, "≈ $X al valor UF indicado"; texto en `tinta-3` "La API vuelve a calcular al guardar".
5. **Versiones** (panel): lista `v1 · Enviada · $565.250 · 29 sep` con la actual marcada (`aria-current`), enlaces a cada versión.
6. **Diálogos**: `DialogoImportarHoras` (radios Estimadas / Reales con el total de horas por origen y la tarifa que se usará: "Tarifa del cliente $40.000/h" o "Tarifa global $38.000/h"; si falta tarifa, aviso con enlace a Configuración → Tarifas para admin y texto "Pide a Administración configurarla" para el resto); `DialogoPlantilla` (lista de plantillas activas con descripción y líneas; "Aplicar").

Estados: `Cargando`, 404 "Cotización no encontrada" (enlace a `/cotizaciones`), `EstadoError`; toasts ("Cotización guardada", "Marcada como enviada · OT-0218 pasó a Cotizada", "COT-0218 v2 creada", "Borrador eliminado" → navega a la OT). Errores 409 `COTIZACION_NO_EDITABLE`/`COTIZACION_APROBADA`/`TARIFA_FALTANTE`/`OT_CERRADA` → toast con el `mensaje` de la API y refetch. Al guardar, el formulario se **resetea con la respuesta** del servidor (totales y líneas tal como quedaron). Tras cada mutación `invalidarCotizacion`.

Tests (jsdom): con las 5 líneas del diseño los totales muestran `$484.000`, `−$9.000`, `$475.000`, `$90.250`, `$565.250` y al desmarcar IVA `$475.000` de total; cantidad 0 muestra error y deshabilita Guardar; `enviada` deja los campos deshabilitados y muestra "Duplicar como v2"; `aprobada` no muestra Duplicar; "Marcar como enviada" deshabilitado con cambios sin guardar; UF muestra Valor UF y `UF 12,50`; bajo 768 px las líneas se renderizan como tarjetas (`data-vista="tarjetas"`).

## 12. Web OT y lista de OT (bloque 4E, `features/ots/**`)

- **`PanelOt` → tarjeta Cotización** (facturable): sin cotización → `EstadoVacio` "Sin cotización" con botón **"Crear cotización"** (habilitado con `puede_cotizar` y `tickets.editar`; tooltip con el motivo si no: "Solo en Borrador o Cotizada" / "La OT necesita un cliente externo"; al crear navega a `/cotizaciones/:id`); con cotización → `Codigo` "COT-0218 v1", `PillEstadoCotizacion`, Neto y Total (`Monto`), "Vence el …" (si enviada), "{n_versiones} versiones", botón "Abrir cotizador" (enlace). **Tarjeta Costo interno** (interna): con `costo_interno` → "12 h registradas × $18.000 = **$216.000**" (`Monto`) y horas reales debajo; sin tarifa → "Configura la tarifa de costo interno en Configuración → Tarifas" (enlace para admin).
- **`AccionesOt`**: desaparece "Marcar como cotizada" y su `AlertDialog`. Facturable `borrador` con `puede_cotizar`: primario **"Crear cotización"** (sin cotización) o **"Revisar y enviar cotización"** (con borrador; etiqueta del diseño; enlace al cotizador). `cotizada`: "Registrar aprobación del cliente…" se **deshabilita** con tooltip "Primero marca la cotización como enviada" si `cotizacion.estado !== 'enviada'`; "Volver a borrador" pide confirmación con texto "La cotización COT-0218 v1 quedará **rechazada**; podrás duplicarla como v2" cuando la vigente está enviada.
- **`DialogoAprobacionCliente`**: muestra "Aprueba COT-0218 v1 · Total $565.250" sobre el formulario; el contacto se preselecciona con `cotizacion.contacto`.
- **`Etapas`**: sin cambios.
- **Lista `/ots`** (`TablaOts`): la columna "Horas (est. / reg.)" pasa a **"Neto / horas"**: facturable con `neto` → `Monto`; interna → horas como hoy (diseño "Órdenes de trabajo": `$475.000` / `6 h`). Test: una fila facturable muestra `$475.000`.
- **`DialogoCerrarOt`**: nada que cambiar (el texto con `neto` viene de `efectosCierreOt`); test: con `ot.neto = 475000` el bloque muestra "($475.000 neto)".
- `features/ots/eventos.ts` (`describirEventoOt`): `cotizacion_creada` → "creó la cotización" + chip "COT-0218 v1" (+ " a partir de la v1" con `desde_version`); `cotizacion_enviada` → "marcó como enviada" + chip "COT-0218 v1 · $565.250"; `cotizacion_aprobada` → "el cliente aprobó" + chip; `cotizacion_rechazada` → "el cliente rechazó" + chip; `cotizacion_lineas_agregadas` → "agregó 4 líneas desde las tareas" / "… desde la plantilla"; `cotizacion_descargada` → "descargó COT-0218 v1 en .xlsx"; `cotizacion_eliminada` → "eliminó el borrador COT-0218 v2"; `cambio` con `campo ∈ {neto, total, lineas, …}` y `datos.cotizacion_id` → "cambió {campo} de la cotización" con chip "$400.000 → $475.000". Tests: 8 casos nuevos.

## 13. Web configuración (bloque 4F, `features/configuracion/`)

`ConfiguracionPage`: `tarifas` y `plantillas` pasan de `DESHABILITADAS` a `PESTANAS` (rutas `/configuracion/tarifas` y `/configuracion/plantillas`).

- **`TarifasTab`**: `Tarjeta` "Tarifas" con una fila por concepto de `CONCEPTOS_TARIFA_GLOBAL` (etiqueta, unidad "por hora" / "por km", `input type=number step=1` con prefijo `$`; vacío = sin definir, se muestra "[TARIFA]" en gris como el diseño); `Tarjeta` "Cotizaciones" con IVA % (`step 0.01`), Validez por defecto (`Select` 15/30) y Condiciones comerciales por defecto (`Textarea`); un solo botón "Guardar" (`PUT /api/config/tarifas`; toast "Tarifas guardadas"); texto bajo IVA: "Cambiar el IVA solo afecta a cotizaciones nuevas". RHF + `zodResolver(TarifasEntrada)`. Test: guardar envía enteros y `null` en los vacíos; IVA 101 muestra error.
- **`PlantillasTab`**: lista de plantillas activas (nombre, descripción, "3 líneas: Diagnóstico · h, …" como el diseño) con "Editar" y "Desactivar…"; chip "Ver inactivas"; botón "Nueva plantilla" → `DialogoPlantilla` (nombre, descripción, condiciones, tabla de líneas con `useFieldArray`: tipo, descripción, cantidad, unidad, precio unitario opcional con ayuda "Vacío = tarifa vigente al aplicar", desc. %). Tests: crear envía `lineas` con `precio_unitario: null`; desactivar llama al `PATCH`.

## 14. Semillas de desarrollo (bloque 4G, `database/semillas/desarrollo-cotizaciones.ts`, llamada desde `desarrollo.ts` tras `sembrarOts`)

Idempotente por `(codigo, version)`. Tarifas (en `desarrollo.ts`, `UPDATE configuracion SET valor` solo si la clave sigue con la semilla base): `hora_normal 38000`, `hora_extendida 45000`, `hora_urgencia null`, `traslado_km null`, `costo_interno 18000` (ficticio, para que OT-0215 muestre costo interno), `iva_pct 19`, `validez_dias_defecto 30`, `condiciones_defecto` "Precios en pesos chilenos. Validez según fecha indicada. Forma de pago: 30 días desde la factura. No incluye repuestos ni licencias salvo indicación expresa." Plantillas: las 3 del diseño ("Soporte por horas", "Mantención preventiva", "Proyecto de instalación") con sus líneas y `precio_unitario null`. Fechas relativas a hoy (Santiago), eventos con autor y hora como en la Fase 3.

| Cotización | OT | Estado | Contenido |
|---|---|---|---|
| **COT-0218 v1** | OT-0218 (`cotizada`) | `enviada` (ayer 10:40, Camila; emisión ayer, validez 30, CLP, IVA sí) | contacto Paula Herrera; las 5 líneas del diseño (3×38 000 Diagnóstico y revisión de logs del ERP; 4×38 000 Carga de nuevo CAF y pruebas en ambiente QA; 2×45 000 Paso a producción y acompañamiento (horario extendido); 1×38 000 Capacitación breve al equipo de facturación; 1×90 000 Soporte remoto post-implementación (7 días) con 10 %) → **neto 475 000, total 565 250**; condiciones por defecto; nota interna "Paula pidió detallar el soporte post-implementación por separado." Eventos en la OT: `cotizacion_creada` (Camila 10:40, como el diseño "creó la cotización COT-0218 v1") y `cotizacion_enviada` (10:55); el `cambio etapa` Borrador → Cotizada existente gana `datos.cotizacion_id` |
| COT-0214 v1 | OT-0214 (`cotizada`) | `enviada` (hace 5 días) | 1 línea servicio "Renovación de plataforma de respaldo (licencias, instalación y migración)" 1 un × 2 150 000 → neto 2 150 000 (diseño: `$2.150.000`) |
| COT-0217 v1 | OT-0217 (`en_ejecucion`) | `aprobada` (hace 3 días, con la aprobación existente) | 2 líneas: 16 h × 38 000 "Migración de buzones y alias"; servicio "Validación de dominio y DNS" 1 × 632 000 → neto 1 240 000 (diseño) |
| COT-0216 v1 | OT-0216 (`cerrada`) | `aprobada` (hace 8 días) | 1 línea servicio "Mantención preventiva de 12 equipos" 12 un × 56 666,67… **no**: 12 × 56 667 = 680 004; se usa 1 un × 680 000 → neto 680 000 (diseño) |

Test `desarrollo.test.ts`: tras sembrar dos veces hay 4 cotizaciones; COT-0218 v1 tiene 5 líneas, `neto = 475000`, `total = 565250`; `GET /api/ots` muestra `neto = 475000` para OT-0218 y `1240000` para OT-0217; OT-0215 tiene `costo_interno.monto = horas.registradas × 18000`; hay 3 plantillas activas.

## 15. Documentación (bloque 4G)

- `docs/manuales/usuario/01-tecnico.md`: "Cotizar una OT" (crear, importar horas, plantilla, líneas, IVA, UF, descargar, marcar como enviada, duplicar como v2).
- `docs/manuales/usuario/02-coordinacion.md`: "Aprobación con cotización" (qué exige, qué se congela, qué pasa al volver a borrador), "Descargas e historial".
- `docs/manuales/administracion.md`: "Tarifas, IVA y validez" y "Plantillas de cotización"; nota sobre `[TARIFA]` sin definir y "Importar horas".
- `docs/api/README.md`: ejemplos `curl` de crear, guardar, enviar y descargar. `docs/api/openapi.json` regenerado. `docs/CHANGELOG.md` (incluye las cifras de §3.2 antes/después). `CLAUDE.md`: tabla §2 con las filas de cotización (evento `entidad = 'ot'` con `datos.cotizacion_id`; descargas → `exportacion`), §1.2 orden ticket → OT → cotización, §3 limpieza por `DELETE` y `ingresarComo` directo. `README.md` si cambia algún script.
- `docs/decisiones/0025-precisiones-de-la-fase-4.md` con lo de §18–§20 y `README.md` de decisiones actualizado; `preguntas-abiertas.md` no se edita.

## 16. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea | Bloque | Crea/edita | Criterio de aceptación |
|---|---|---|---|
| **F4-T1 Suite rápida** | 4A | `test/bd.ts`, `test/setup.ts`, `test/fabricas.ts`, `database/fabricas.test.ts` (o `bd.test.ts`), ajustes puntuales en tests de auth/auditoría | §3.3 completo; `npm run test -w @zydesk/api` verde con **≥ 447 tests y ninguno saltado nuevo**; `Duration` local **≤ 6 min** y paso "Tests" de CI **≤ 3 min**, cifras anotadas en el mensaje del commit; `contrasena.ts` sin cambios. |
| **F4-T2 Paralelismo (condicional)** | 4A | `vitest.config.ts`, `setup-global.ts`, `setup.ts`, `bd-test.ts`, `cli.ts`, `ci.yml` | Solo si T1 no alcanza §3.2; §3.4; `≤ 4 min` local; sin tests que dependan del orden entre archivos. Si no se ejecuta, se deja constancia en el CHANGELOG. |
| **F4-T3 Contratos compartidos y cálculo** | 4B | `shared/src/{enums/cotizacion,cotizacion/calcular,esquemas/cotizacion}.ts`, cambios en `enums/tarifa`, `formato/moneda`, `esquemas/{configuracion,ot}`, `estados/ot`, `errores`, `eventos`, índices | `calcular.test.ts` con la tabla de §4.2 verde (caso del diseño **475 000 / 565 250**, half-up, `.005` UF, por línea); `esquemas.test.ts` cubre §4.2; `npm run typecheck` verde en api y web (las formas nuevas en `OtResumen`/`OtSalida` solo rompen donde haya `neto: null` literal: `ots.consulta.ts`, `cierre.service`, tests; se corrigen en T5). |
| **F4-T4 Migración, entidades, fábricas** | 4B | migración 11, 4 entidades, `entidades.ts`, `fabricas.ts`, `fabricas-fase4.test.ts`, `semillas/base.ts` (claves `tarifas`/`cotizacion`) | `db:migrar` desde cero aplica 11; `db:revertir` deja 10; fábricas de §4.3 verdes; `base.test.ts` cuenta la clave `tarifas`. |
| **F4-T5 Cotizaciones: crear, consultar, editar, listar; OT neto/cotización/costo interno** | 4C | `modulos/cotizaciones/{cotizacion.entity… ya en T4, cotizaciones.service,cotizaciones.consulta,cotizaciones.routes,cotizaciones.tipos}.ts`, `ots.consulta.ts`, `ots.cierre.service.ts`, `app.ts`, `cotizaciones.test.ts` | §5.1–5.4, §6.1; pruebas 3, 4, 5 (editar), 6, 7 (contacto), 15, 21; cierre con neto (§6.1). |
| **F4-T6 Cotizaciones: importar, plantilla, enviar, duplicar, eliminar; etapas y aprobación** | 4C | `cotizaciones.service.ts` (+`cotizaciones.estados.ts`), `ots.etapas.service.ts`, `ots.service.ts` (bolsa §6.3), `etapas.test.ts` (quita la marca manual), `cotizaciones-flujo.test.ts` | §5.5–5.9, §6.2–6.3; pruebas 8–14, 20; los tests de la Fase 3 que marcaban `cotizada` a mano pasan a crear y enviar una cotización (fábrica `crearCotizacion({ estado: 'enviada' })` + `crearOt({ etapa: 'cotizada' })` donde solo importa la etapa). |
| **F4-T7 Documentos .xlsx y PDF** | 4C | `integraciones/xlsx/cotizacion.xlsx.ts`, `integraciones/pdf/cotizacion.pdf.ts`, `core/http/descarga.ts`, rutas de descarga, `archivos.routes.ts` (usa `descarga.ts`), tests de §10.17 | §7 completo; pruebas 16, 17, 18; `package.json` con exceljs/pdfmake/@types/pdfmake. |
| **F4-T8 Configuración: tarifas y plantillas** | 4D | `configuracion.service.ts` (`leerTarifas`, `guardarTarifas`), `plantillas.service.ts`, `configuracion.routes.ts`, `tarifas.test.ts`, `plantillas.test.ts` | §8; prueba 2 (parte configuración), 6 (IVA snapshot), 14; auditoría `config_cambiada` sin montos. |
| **F4-T9 Seguridad y cobertura de eventos** | 4C | `cotizaciones/seguridad.test.ts`, `cotizaciones/eventos.test.ts` | Las 22 pruebas de §10 y la cobertura de §9 verdes. |
| **F4-T10 Web: api, `Monto`, `PillEstadoCotizacion`, `descargar`, eventos** | 4E | `features/cotizador/api.ts`, `components/dominio/{Monto,PillEstadoCotizacion}.tsx`, `lib/api.ts`, `features/ots/eventos.ts` | Tests jsdom: `Monto` formatea CLP y UF; `descargar` toma el nombre de `Content-Disposition`; `describirEventoOt` 8 casos nuevos. |
| **F4-T11 Pantalla 7 Cotizador** | 4E | `features/cotizador/pages/CotizadorPage.tsx`, `components/{DatosCotizacion,TablaLineas,TotalesCotizacion,VersionesCotizacion,AccionesCotizacion,DialogoImportarHoras,DialogoPlantilla}.tsx`, `router.tsx` | §11.4 con sus tests. En el navegador (1440 y 390 px): abrir COT-0218 v1 reproduce el diseño; "Duplicar como v2" → editar una línea → totales en vivo → Guardar → `.xlsx` abre con fórmulas → "Marcar como enviada" deja v1 reemplazada; en 390 px líneas como tarjetas y totales fijos al pie. |
| **F4-T12 Lista `/cotizaciones` e integración OT** | 4E | `features/cotizador/pages/CotizacionesPage.tsx`, `features/ots/components/{PanelOt,AccionesOt,DialogoAprobacionCliente}.tsx`, `features/ots/lista/TablaOts.tsx`, tests | §11.3 y §12 con tests; en el navegador: OT-0219 (interna) muestra costo interno; una OT facturable nueva en Borrador muestra "Crear cotización" → crea y navega; OT-0214 muestra "Registrar aprobación del cliente…" habilitado y, tras "Volver a borrador", la cotización queda rechazada; `/ots` muestra `$475.000` en OT-0218. |
| **F4-T13 Pestañas Tarifas y Plantillas** | 4F | `features/configuracion/{TarifasTab,PlantillasTab,DialogoPlantilla}.tsx`, `pages/ConfiguracionPage.tsx`, `api.ts`, tests | §13 con tests; en el navegador con `hikki` (admin): cambiar hora normal a 40 000 y ver que "Importar horas" en una cotización nueva usa 40 000; `sdiaz` no ve Configuración. |
| **F4-T14 Semillas** | 4G | `semillas/desarrollo-cotizaciones.ts`, `desarrollo.ts`, `desarrollo-ots.ts` (evento con `cotizacion_id`), `desarrollo.test.ts` | §14; `npm run db:reiniciar` deja 4 cotizaciones y `/ots` con los netos del diseño. |
| **F4-T15 Revisión de seguridad de la fase** | — | correcciones con test | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo; hallazgos confirmados corregidos con test; nada se mergea con hallazgos abiertos. |
| **F4-T16 Documentación y cierre** | 4G | §15, `docs/decisiones/0025-precisiones-de-la-fase-4.md`, `docs/decisiones/README.md`, `docs/api/openapi.json`, `CLAUDE.md`, `docs/CHANGELOG.md` | Criterios de §17 desde un clon limpio; PR a `main` con CI verde. |

## 17. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 11 migraciones aplicadas
npm test                                                                                    → verde (shared: cotizacion/calcular, estados/ot, esquemas; api: todos; web)
                                                                                              Duration de la API ≤ 6 min local (anotar la cifra)
npm run db:reiniciar                                                                        → 18 tickets, 6 OT, 4 cotizaciones, 3 plantillas; COT-0218 v1 neto 475.000 / total 565.250
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (3 colas, sin cambios)
curl -b cookie(técnico) -H "X-Requested-With: Zydesk" -X POST localhost:3010/api/ots/<id OT-0218>/cotizaciones → 409 COTIZACION_NO_EDITABLE (ya hay una enviada)
curl -b cookie(técnico) … -X POST /api/cotizaciones/<id COT-0218 v1>/duplicar              → 201 { codigo: "COT-0218", version: 2, estado: "borrador", totales: { total: 565250 } }
curl -b cookie(técnico) … -X PUT -d '{…5 líneas del diseño…, "total": 1, "iva_pct": 0}' /api/cotizaciones/<v2> → 200 { iva_pct: 19, totales: { neto: 475000, total: 565250 } }
curl -b cookie(técnico) … -X POST /api/cotizaciones/<v2>/enviar                              → 200 { estado: "enviada" }; GET /api/cotizaciones/<v1> → estado "reemplazada"; OT-0218 sigue "cotizada"
curl -b cookie(coordinación) … -X PUT -d '{contacto, fecha, forma, archivo_id}' /api/ots/<OT-0218>/aprobacion → 200 { etapa: "aprobada", cotizacion: { version: 2, estado: "aprobada" } }
curl -b cookie(técnico) … -X POST /api/cotizaciones/<v2>/duplicar                            → 409 COTIZACION_APROBADA
curl -b cookie(lectura) -o cot.xlsx -D - … /api/cotizaciones/<v2>/descargar.xlsx             → 200, Content-Disposition attachment "COT-0218_v2.xlsx"; auditoria.accion = 'exportacion'
curl -b cookie(técnico) … -d '{"etapa":"cotizada"}' /api/ots/<id>/cambiar-etapa              → 400 VALIDACION
curl -b cookie(técnico) … -X PUT -d '{"hora_normal":1}' /api/config/tarifas                  → 403 SIN_PERMISO
GitHub Actions: workflow CI verde en la rama y en el PR a main; paso "Tests" ≤ 3 min
```

En el navegador (1440 px y 390 px): `/cotizaciones/<COT-0218 v1>` reproduce el diseño "Cotizador COT-0218" ($484.000 / −$9.000 / $475.000 / $90.250 / $565.250) en solo lectura por estar enviada; `/ots/<OT-0218>` muestra la tarjeta Cotización con "COT-0218 v1 · Enviada · $565.250" y ya no ofrece "Marcar como cotizada"; `/ots` muestra `$475.000` y `$1.240.000`; `/configuracion/tarifas` y `/configuracion/plantillas` funcionan con `hikki`; con `nvega` (lectura) se ve y descarga todo, nada se edita; con `sdiaz` (técnico) se cotiza pero no se configura ni aprueba. Detener el `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

## 18. Decisiones tomadas en esta spec (con justificación)

1. **Desaparece la marca manual "Cotizada"** (ADR 0023.1 lo dejaba a esta fase): la OT pasa a `cotizada` solo al marcar una cotización como enviada, y la aprobación del cliente exige una cotización `enviada`. Una sola fuente de verdad para el neto, la pantalla 10 y los reportes. No hay datos en producción que migrar; las semillas se corrigen.
2. **Estados de versión** `borrador → enviada → aprobada | rechazada | reemplazada` y **vigente = mayor versión**; un solo borrador y una sola aprobada por OT (índices parciales). "Rechazada" la fija "Volver a borrador" (ADR 0004: rechazo del cliente); "reemplazada" la fija el envío de la versión siguiente. Las versiones no se borran salvo el borrador vigente.
3. **"Enviar" = "Marcar como enviada"**: sin correo saliente (ADR 0013) la app registra el hecho; el documento se descarga y se envía fuera. Permiso `tickets.editar`, el mismo que tenía la marca manual de la Fase 3 (pregunta §19.2).
4. **Edición por `PUT` completo** (encabezado + todas las líneas) en vez de endpoints por línea: el cálculo es en vivo en el cliente y se guarda de una vez; la API recalcula y descarta totales (ADR 0007). Totales **materializados** en `cotizacion` y `linea_cotizacion.total` para que el listado de OT, el cierre y los documentos no recalculen; `iva_pct` es snapshot y nunca se toma del cuerpo.
5. **Las descargas no se guardan como `archivo`**: una cotización enviada es inmutable y se regenera idéntica; se registra `evento` `cotizacion_descargada` (ADR 0003) y `auditoria` `exportacion` (ADR 0017). La galería del diseño mostraba `COT-0218_v1.xlsx`; se omite (pregunta §19.3).
6. **Importar horas** crea una línea por tarea con horas > 0 del origen elegido (estimadas por defecto, como el diseño), siempre a `hora_normal` (cliente > global, B12); el horario extendido se ajusta a mano (la app no sabe qué horas fueron extendidas hasta la Fase 5).
7. **Plantillas con precio opcional**: `null` = tarifa vigente al aplicar (`h → hora_normal`, `km → traslado_km`); así cambiar tarifas no obliga a editar plantillas.
8. **Costo interno con horas registradas** (`registro_horas`), no con `tarea.horas_reales`: es lo que la gente trabajó de verdad y lo que la Fase 5 consolida; ADR 0007 decía "horas_reales" en sentido genérico (pregunta §19.4). Se calcula al vuelo en `cargarOt`, sin IVA.
9. **PDF con Roboto** (fuente incluida en pdfmake, Apache 2.0) en lugar de IBM Plex: `@fontsource` solo trae WOFF/WOFF2, que pdfkit no acepta; embeber TTF de IBM Plex exigiría versionar binarios. ADR 0001 lo anotaba como riesgo, no como requisito (pregunta §19.5).
10. **Eventos de cotización bajo `entidad = 'ot'`** con `datos.cotizacion_id` (criterio de ADR 0021.2 para tareas): la actividad de la OT sigue siendo una consulta y el cotizador no necesita su propia pestaña de historial. El ticket **no** recibe eventos de cotización (el diseño mostraba "creó la cotización" en TK-1048; pregunta §19.7).
11. **Prefijo `COT-` fijo** y número con los dígitos del código de la OT (`OT-0218 → COT-0218`, `OT-000201 → COT-000201`); sin fila en `contador` (ADR 0014). Hacerlo configurable es una entrada más en Numeración; se posterga.
12. **Regla mínima de bolsa**: `descuenta_bolsa: true` con contrato ya fijado no re-resuelve el contrato en ninguna etapa; cambiar de contrato exige `false` → `true` (y `ots.aprobar` fuera de Borrador/Cotizada por ADR 0024.3). Cierra la nota pendiente de seguridad sin añadir campos.
13. **Lista mínima `/cotizaciones`** como vista (ADR 0022): el menú ya tiene "Cotizador" y sin lista una cotización solo se alcanza desde su OT.
14. **Tarifas e IVA en `configuracion` (jsonb)**, no en tabla propia: cinco montos y tres parámetros; `GET` abierto a cualquier sesión porque el cotizador los necesita y B10 permite ver montos; `PUT` solo `config.editar`.
15. **Descripción siempre como texto en el `.xlsx`** (nunca fórmula) y nota interna fuera de ambos documentos: son las dos fugas típicas de un exportador.
16. **Suite de tests**: limpieza por `DELETE` selectivo + `RESTART` de secuencias (medido 56 ms vs 750) y sesiones directas en BD sin tocar los parámetros de argon2 de producción; paralelismo solo si hace falta (§3.4).
17. **Dependencias entre módulos**: `cotizaciones → ots` (acceso, etapas, consulta) y `ots.etapas → cotizaciones.estados` (archivo sin dependencias hacia `ots.service`/`ots.etapas`), para que la aprobación y el rechazo cambien la cotización en la misma transacción sin ciclo.

## 19. Preguntas para el usuario

1. **[Bloquea F4-T6, F4-T12 y las semillas]** ¿Aceptas **eliminar la marca manual "Cotizada"** y exigir una cotización enviada para registrar la aprobación del cliente (decisión 1)? Alternativa: conservar "Marcar como cotizada" para cotizaciones hechas fuera de la app (la OT podría aprobarse sin cotización y `neto` quedaría nulo). **Recomendación: eliminar**; todo lo cotizado pasa por la app y el neto siempre existe.
2. ¿Quién puede **marcar como enviada**: cualquiera con `tickets.editar` (técnico incluido, decisión 3) o solo `ots.aprobar` (Coordinación/Administración)? No bloquea (es el permiso de una ruta). **Recomendación: `tickets.editar`**, como la marca manual de la Fase 3; la aprobación sigue siendo de Coordinación.
3. ¿Guardar también el `.xlsx`/PDF **como archivo de la OT** al marcar como enviada, para que aparezca en la galería como en el diseño (decisión 5)? No bloquea. **Recomendación: no**; se regenera igual y evita duplicar disco y auditoría.
4. **Costo interno** con horas registradas (decisión 8) o con horas reales de las tareas. No bloquea. **Recomendación: registradas.**
5. **Fuente del PDF**: Roboto incluida (decisión 9) o IBM Plex embebida como TTF versionado. No bloquea. **Recomendación: Roboto.**
6. **Paralelismo de tests** (§3.4): ¿solo si T1 no llega a 6 min, o lo hacemos de todas formas? No bloquea. **Recomendación: condicional**; menos piezas si no hace falta.
7. ¿Registrar `cotizacion_creada`/`cotizacion_enviada` también en el **historial del ticket** como muestra el diseño (decisión 10)? No bloquea. **Recomendación: no**; el ticket ya muestra la OT vinculada y su etapa.
8. ¿Vale la **lista mínima `/cotizaciones`** (decisión 13) o prefieres que el menú "Cotizador" lleve a `/ots` filtrado por facturables? No bloquea. **Recomendación: lista mínima.**
9. ¿Aceptas la **regla de bolsa** de la decisión 12? No bloquea. **Recomendación: sí.**
10. ¿**Prefijo `COT-` fijo** en esta fase (decisión 11)? No bloquea. **Recomendación: fijo**; se configura cuando alguien lo pida.
11. ¿**Validez** solo 15 o 30 días (spec 4.7) o número libre de días? No bloquea. **Recomendación: 15/30** como dice la spec; el campo es `integer` y ampliar es relajar un `CHECK`.

### Respuestas del usuario (2026-10-01)

1. Aceptado: se elimina la marca manual "Cotizada"; la OT pasa a `cotizada` solo al marcar una cotización como enviada, y la aprobación del cliente exige una cotización `enviada`, que queda congelada.
2–11. Aceptadas todas las recomendaciones de esta sección tal como están escritas.

### Estado de avance (2026-10-01)

- **F4-T1 (bloque 4A) hecho**: suite de la API de 708 s a 334 s en local (492 tests + 2 omitidos); F4-T2 no fue necesaria.
- **F4-T3 y F4-T4 (bloque 4B) hechos** (API: 498 tests + 2 omitidos; shared 259; web 162). Desviaciones anotadas:
  - `CambioEtapaOt` sigue aceptando `cotizada`: quitarlo rompe 7 tests de la Fase 3 (`etapas`, `eventos`, `seguridad`). Pasa a F4-T6 junto con `ots.etapas.service.ts` y el botón de `AccionesOt.tsx`.
  - La clave `cotizacion` de `configuracion` no se siembra: IVA, validez y condiciones viven en `tarifas` (§8.1).
  - `test/bd.ts` ya no reinicia `migracion_id_seq`: rompía las migraciones nuevas sobre una base de test ya usada.
  - Los 4 códigos de error nuevos se declaran en `shared/errores.ts` solo con su status; el mensaje va donde se lanzan (4C).
  - `crearCotizacion`: `descuento_pct` por línea es opcional (0 por defecto).
  - `OtSalida.cotizacion`, `costo_interno`, `puede_cotizar` y `OtResumen.neto` llevan valores provisionales (`// F4-T5`) en `ots.consulta.ts`.
- **F4-T8 (bloque 4D) hecho**: tarifas y plantillas; 404 en PUT/PATCH de una plantilla inexistente; el PATCH de `activo` sin cambio no audita.
- **F4-T5, T6, T7 y T9 (bloque 4C) hechos** (API: 597 tests + 2 omitidos; shared 260; web 162). Desviaciones anotadas (para ADR 0025):
  - La marca manual "Cotizada" se quitó aquí (pendiente de 4B). Se adaptaron 11 tests de la Fase 3, no 7: también las aprobaciones del cliente, que ahora exigen una cotización enviada. Ningún `expect` se relajó.
  - Al enviar se bloquea primero el ticket, porque §5.7 llama a `registrarActividadEnTicket`. Así se respeta el orden ticket → OT → cotización de §1.2.
  - Importar horas, o aplicar una plantilla con líneas que toman precio de la tarifa, sobre una cotización en UF → 400 `VALIDACION { moneda }`: las tarifas están en pesos.
  - Importar horas o aplicar una plantilla que deje más de 100 líneas → 400 `VALIDACION { lineas }`.
  - La aprobación del cliente responde 409 `COTIZACION_REQUERIDA` antes que los 400 de contacto y archivo.
  - `registrarCambios` acepta `datos` opcional (para `cotizacion_id`); `contentDisposition` se movió a `core/http/descarga.ts`.
  - El neto en el cierre (§6.1) se prueba con `netoVigenteClp` + `efectosCierreOt`, no con un test de `cierre.test.ts`.
- **Siguiente**: bloques 4E y 4F en paralelo, y luego 4G, en el orden de §16.

## 20. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0025 "Precisiones de la Fase 4" al cerrar)

- **ADR 0004**: `cotizada` se alcanza solo al marcar una cotización como enviada (la marca manual de ADR 0023.1 desaparece); `cotizada → borrador` marca la cotización vigente como `rechazada`; `aprobada` en facturable exige, además de `AprobacionCliente`, una cotización vigente `enviada`, que queda `aprobada` e inmutable; estados de versión de la cotización (`borrador`, `enviada`, `aprobada`, `rechazada`, `reemplazada`).
- **ADR 0003**: eventos de cotización bajo `entidad = 'ot'` con `datos.cotizacion_id`; nombres `cotizacion_creada`, `cotizacion_enviada`, `cotizacion_aprobada`, `cotizacion_rechazada`, `cotizacion_lineas_agregadas`, `cotizacion_descargada`, `cotizacion_eliminada`; la edición usa `registrarCambios` por campo (incluye `neto` y `total`).
- **ADR 0007**: totales materializados en `cotizacion` y `linea_cotizacion.total` (recalculados siempre por la API); `redondear` con `Number.EPSILON`; `enClp` y `OtResumen.neto` en CLP para UF; `costo_interno` con horas **registradas**; `iva_pct` nunca viene del cliente; `validez_dias ∈ {15, 30}`.
- **ADR 0017 / 0021**: las descargas de cotización registran `auditoria.exportacion { tipo, entidad: 'cotizacion', entidad_id, ot_id }` (no `descarga_archivo`, porque no hay `archivo`) y un `evento` en la OT; siguen siendo `attachment`.
- **ADR 0006 / 0014**: `cotizacion.codigo` = `COT-` + número de la OT con los dígitos de su código, materializado sin la versión; prefijo fijo en esta fase.
- **ADR 0015 / 0024**: `descuenta_bolsa: true` con `contrato_id` ya fijado no cambia el contrato (ninguna etapa); el cambio de contrato exige `false` → `true`.
- **ADR 0001**: exceljs `^4.4` y pdfmake `^0.2` entran en esta fase; el PDF usa Roboto (no IBM Plex).
- **ADR 0010 / 0011 / 0022**: rutas nuevas `GET /api/cotizaciones`, `POST /api/ots/:id/cotizaciones`, `PUT /api/cotizaciones/:id`, `/importar-horas`, `/aplicar-plantilla`, `/enviar`, `/duplicar`, `DELETE`, `/descargar.xlsx|pdf`, `GET/PUT /api/config/tarifas`, `/api/config/plantillas-cotizacion`; `/cotizaciones` como vista mínima además de `/cotizaciones/:id`; `cambiar-etapa` sin `cotizada`.
- **ADR 0020**: la suite limpia con `DELETE` selectivo y `RESTART` de secuencias (owner), `ingresarComo` crea la sesión en BD salvo cuando prueba una contraseña; si se ejecuta §3.4, `fileParallelism: true` con una base por worker en local y CI.
- **ADR 0013**: "enviar cotización" no envía correo; es un registro.
- **Spec funcional §4.7 / §6 / PLAN §4**: `Cotizacion` gana `estado`, `valor_uf`, `iva_pct`, totales materializados, `enviada_*`, `aprobada_en`, `rechazada_en`; `LineaCotizacion.total`; `PlantillaLinea.precio_unitario` opcional; la aprobación del cliente (PLAN Fase 4) ya existía desde la Fase 3 y aquí solo exige cotización; el costo interno de OT internas se entrega en esta fase; la pantalla 10 completa sigue en Fase 6.
