# Fase 7 — Reportes · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §1 (revisión de seguridad al cierre) y §4 Fase 7 («Indicadores, gráficos (horas por semana, carga vs capacidad, resolución por prioridad vs objetivo), tabla por cliente, exportación .xlsx. Pantalla 14 Reportes. Verificación: cifras cuadran con las semillas; Solo lectura puede ver reportes y montos»); ADR **0002** (matriz: `reportes.ver` = «reportes, montos, horas de cualquier persona»), 0003, **0005** (motor de horas hábiles: `horasHabilesEntre` «para reportes y % dentro de plazo»; «resolución promedio en días hábiles»), 0007, 0010, **0011** (Recharts, `#2F47C4` facturables / `#D98A1C` internas, etiquetas de texto en cada barra), **0015** (separar «horas de bolsa» de «horas a cotizar» con `contrato_id`), **0017** (`exportacion`), 0019, 0022, 0023 (punto 8), 0025 (puntos 3, 17, 18), **0026** (consecuencias: «las Fases 6 y 7 la exportación de horas y los reportes (horas por semana, % facturables, carga vs capacidad)»), **0027** (puntos 6, 7, 18, 25, 26, 37); `preguntas-abiertas.md` **B10** (Solo lectura ve reportes y montos), B3, B13; spec funcional §2 (permisos), **§4.8** («el horario se usa para … calcular la carga y capacidad de cada persona»; «% de la jornada disponible para tickets (capacidad)»), §5 pantalla **14 Reportes** («Período y departamento. Indicadores: tickets cerrados (resueltos vs descartados/duplicados), resolución promedio (días hábiles), % cerrados dentro de plazo, % horas facturables. Gráficos: horas por semana (facturables vs internas), carga por persona vs capacidad, resolución por prioridad vs objetivo. Tabla por cliente: abiertos, cerrados, horas, facturado, por facturar. Exportar (.xlsx)»), §6 (`Departamento.capacidad_tickets_pct`, `Ticket.horas_estimadas`, `Ticket.cerrado_en`, `OT.estado_facturacion`); diseño «Reportes» (`pantallas-logica.txt`: cuatro semanas «1–5 sep … 22–26 sep» con barras apiladas facturables/internas y total por semana; carga «Camila Rojas · 2 · 14/33 h» = «2 tickets abiertos, 14 h estimadas de 33 h disponibles» con barra sobre la capacidad; resolución «Urgente 0,6 d · obj. 1», «Alta 1,4 d · obj. 1 · sobre plazo» en rojo; tabla por cliente con «Interno» como una sola fila y «—» en sus montos; «por facturar» destacado en ámbar).
>
> Rama `feat/fase-7-reportes` desde `main` (Fases 0–6 integradas); PR a `main` al cerrar con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1. Entorno: el de la Fase 6 (13 migraciones, 6 colas de pg-boss, bot opcional). Todo lo construido en las Fases 0–6 (`ruta()`, `actorRequerido`, `enTransaccion`, `registrarAuditoria`, `cargarCalendario`, motor de horas hábiles de `shared` con `horasHabilesEntre`, `horasJornada`, `jornadaSemanalHoras`, `bloquesDelDia`, `lunesDe`; `indicadoresOts` y la subconsulta `cv.neto_clp` de `ots.consulta.ts`; `generarXlsxOts` como modelo de exceljs; `contentDisposition`; `hoyEnSantiago`; `descargar` y `conQuery` de `lib/api.ts`; `IndicadoresOts`/`Tarjeta`, `MontoOculto`, `usePermiso`, `RequierePermiso`; fábricas; `ingresarComo` directo; BD de test por bloque) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, SQL a mano en migraciones y consultas (`m.query` con parámetros `$n`, nunca interpolación), servicios como único punto de escritura, `logger` solo con ids, procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: módulo nuevo `modulos/reportes/` de **solo lectura** con un endpoint agregado `GET /api/reportes` (indicadores, horas por semana, carga vs capacidad, resolución por prioridad vs objetivo, tabla por cliente) y su exportación `GET /api/reportes/exportar.xlsx`, ambos con permiso `reportes.ver` (Administración, Coordinación y **Solo lectura**; Técnico no); filtros **período** (`desde`/`hasta`, por defecto el mes calendario actual en America/Santiago), **departamento**, **cliente** y **persona**; `shared`: esquemas `esquemas/reportes.ts` y funciones puras `diasHabilesEntre` y `jornadaDiariaPromedio` en `horas-habiles/` (tests de tabla); migración 14 con **cuatro índices** (sin tablas ni columnas nuevas); exportación `.xlsx` con exceljs (cinco hojas) auditada como `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros }` sin ids ni montos; pantalla **14 Reportes** (`/reportes`, con `RequierePermiso` y `permiso` en el menú), Recharts para el gráfico de horas por semana y barras HTML accesibles para carga y resolución, tabla por cliente, botón «Exportar (.xlsx)», estado en la URL; **cierre del pendiente de ADR 0027.7**: la columna Neto de `/ots` (y `OtResumen.neto`) pasa a `null` / «—» sin `reportes.ver`, como ya hacen los indicadores; semillas: `horas_estimadas` en los tickets abiertos del diseño y una OT **facturada** (OT-0213 sobre TK-1012) para que «Facturado» no sea siempre $0; tests «las cifras cuadran» con fábricas en fechas fijas (valores exactos) y con las semillas (valores relativos a hoy, §10); manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0028; revisión de seguridad de cierre (PLAN §1).

**No entra**: reportes al cliente (PDF o correo con seguimientos; la spec §4.3 solo dice que un seguimiento «puede incluirse» en ellos); cierre de mes o bloqueo de horas (B3); «reporte de bolsa» por cliente más allá de la columna de horas (ADR 0015 lo deja como consecuencia posible; se anota en §15); indicador de **tiempo de primera respuesta** (`primera_respuesta_en` existe, pero la pantalla 14 no lo pide; §15); comparación «vs mes anterior»; gráficos en el bot o en el resumen diario; programar envíos; cache de reportes (las consultas son agregadas y la escala es de 10 personas); exportación de la planilla de horas en bruto (la hoja «Horas por semana» de este `.xlsx` es agregada; §15); edición de `capacidad_tickets_pct` (ya existe en Configuración → Departamentos); mobile-first (ADR 0011: Reportes es «usable, no optimizada»; §8.4 fija el mínimo); Playwright; CD.

## 1. Bloques y paralelismo

| Bloque                             | Contenido                                                                                                                                                                                            | Depende de                                         | Archivos que toca (exclusivos)                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7A** Contratos y BD              | `shared` (`esquemas/reportes.ts`, `horas-habiles/dias-habiles.ts`, cambio en `esquemas/ot.ts`), migración 14 (índices), fábricas                                                                     | —                                                  | `packages/shared/src/**`, `apps/api/src/database/migraciones/**`, `apps/api/test/fabricas.ts`, `apps/api/src/database/fabricas-fase7.test.ts`                                             |
| **7B** API reportes                | `modulos/reportes/**` (consulta, servicio, rutas, tipos), `integraciones/xlsx/reportes.xlsx.ts`, `app.ts`                                                                                            | 7A                                                 | `apps/api/src/modulos/reportes/**`, `apps/api/src/integraciones/xlsx/reportes.xlsx.ts`, `apps/api/src/app.ts`                                                                             |
| **7C** Web reportes                | `features/reportes/**`, `router.tsx` (`RequierePermiso`), `menu.ts` (`permiso`), `package.json` de web (Recharts)                                                                                    | 7B (API); componentes puros contra los esquemas 7A | `apps/web/src/features/reportes/**`, `apps/web/src/app/router.tsx`, `apps/web/src/app/layout/menu.ts`, `apps/web/src/app/layout/*.test.tsx`, `apps/web/package.json`, `package-lock.json` |
| **7D** Neto de `/ots` (ADR 0027.7) | `ots.consulta.ts` / `ots.service.ts` (`neto: null` sin permiso), `features/ots/lista/TablaOts.tsx`                                                                                                   | 7A (esquema `OtResumen.neto` nullable)             | `apps/api/src/modulos/ots/**`, `apps/web/src/features/ots/**`                                                                                                                             |
| **7E** Semillas y docs             | `semillas/desarrollo-tickets.ts` (`horas_estimadas`), `desarrollo-ots.ts` y `desarrollo-cotizaciones.ts` (OT-0213), `desarrollo.test.ts`, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0028 | todo                                               | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md`                                                                                                                  |

**En paralelo sin conflicto**: 7C con 7D (tras 7A; 7C puede empezar los componentes puros y la tabla contra los esquemas de 7A antes de que 7B termine); 7D no depende de 7B. 7A va primero. Orden general en §12.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en las Fases 2–6: `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 7A usa `zydesk_test` (sin variable); 7B `7b`; 7D `7d`; 7E `7e`. 7C no usa BD. CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas

Esta fase **no escribe** en ticket, OT, cotización, tarea ni `registro_horas`: todas sus consultas son `SELECT` sin `FOR UPDATE` y fuera de `enTransaccion`, salvo la fila `auditoria` de la exportación, que va en su propio `enTransaccion` corto **después** de generar el archivo (igual que `exportarOts`, ADR 0027.18). No hay nada que bloquear; la regla de `CLAUDE.md` §2 se mantiene intacta.

## 2. Versiones nuevas

- **`recharts` `^3`** (MIT) en `apps/web` (previsto en ADR 0001 y 0011; hasta hoy no estaba instalado). Se instala la última `3.x` disponible y se anota la versión exacta en el estado de avance. Solo lo usa `GraficoHorasSemana` (§8.4); los otros dos gráficos son HTML (§14.9). Si Recharts 3 no renderiza en jsdom con el tamaño fijo que fija §8.4, los tests se apoyan en la tabla oculta que acompaña a cada gráfico, nunca en espiar el SVG.
- Sin paquetes nuevos en `api` ni `shared` (exceljs y date-fns ya están). Sin componentes shadcn nuevos (filtros con `select`, `input`, `button`, `tooltip`, `table` existentes). Si al implementar hace falta otro paquete, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 7A)

### 3.1 Migración `1791000000014-reportes` (SQL a mano; `down` inverso; no inserta datos)

Sin tablas ni columnas nuevas: los reportes se calculan sobre `ticket`, `ticket_responsable`, `ot`, `cotizacion`, `registro_horas`, `categoria`, `usuario`, `departamento`, `horario_dia`, `feriado` y `cliente` tal como están. Se agregan los índices que faltan para las consultas de §5 (hoy no hay ninguno que empiece por `ticket.cerrado_en`, `registro_horas.fecha`, `ot.facturada_en` ni `ticket_responsable.usuario_id`):

```sql
CREATE INDEX ticket_cerrado_en_idx ON ticket (cerrado_en) WHERE cerrado_en IS NOT NULL;
CREATE INDEX registro_horas_fecha_idx ON registro_horas (fecha);
CREATE INDEX ot_facturada_en_idx ON ot (facturada_en) WHERE facturada_en IS NOT NULL;
CREATE INDEX ticket_responsable_usuario_idx ON ticket_responsable (usuario_id);
```

`down`: los cuatro `DROP INDEX`. `evento`, `auditoria` y el resto del esquema no cambian. `AccionAuditoria` ya contiene `exportacion`; no se agrega ninguna acción.

### 3.2 `packages/shared`

```ts
// horas-habiles/dias-habiles.ts (puro; se exporta desde horas-habiles/index.ts)
export function diasHabilesEntre(a: Date, b: Date, cal: Calendario): number
  // Σ, para cada día calendario d de [a, b] (en America/Santiago): horasHabilesEntre(max(a, inicio de d), min(b, fin de d), cal) / horasJornada(d, cal).
  // Un día con jornada 0 (inactivo o feriado) aporta 0. Redondeo a 2 decimales. b < a → 0. Cada día aporta como máximo 1.
  // Es la "resolución en días hábiles" de ADR 0005: un ticket abierto y cerrado a la misma hora en dos días hábiles consecutivos da 1,0 exacto,
  // y uno cerrado el mismo día aporta la fracción de la jornada de ese día (no una fracción de 24 h).
export function jornadaDiariaPromedio(horario: HorarioDia[]): number
  // jornadaSemanalHoras(horario) / cantidad de días activos; 0 si ninguno. Convierte plazos en horas a días (§4.6).

// esquemas/reportes.ts
export const RANGO_MAX_DIAS = 366
export const ReportesQuery = z.object({
  desde: fechaIso.optional(),                 // sin él: primer día del mes actual (Santiago)
  hasta: fechaIso.optional(),                 // sin él: hoy (Santiago). Puede ser futuro: no hay nada que contar
  departamento_id: idQuery.optional(),
  cliente_id: idQuery.optional(),
  usuario_id: idQuery.optional(),
})
  .refine(v => !v.desde || !v.hasta || v.desde <= v.hasta, { path: ['hasta'], message: 'El fin del período es anterior al inicio' })
  .refine(v => !v.desde || !v.hasta || diasEntre(v.desde, v.hasta) < RANGO_MAX_DIAS, { path: ['hasta'], message: 'El período no puede superar un año' })
  // diasEntre: diferencia en días calendario sobre AAAA-MM-DD (como lunesDe), sin zona; el período tiene a lo sumo 366 días contando ambos extremos
  // (2025-01-01 → 2026-01-01 vale; → 2026-01-02 no). El servicio vuelve a comprobar el tope tras aplicar los defectos.
export const FiltrosReporte = z.object({
  desde: fechaIso, hasta: fechaIso,           // ya resueltos
  departamento: referencia.nullable(), cliente: ClienteBreve.nullable(), usuario: UsuarioBreve.nullable(),
})
export const IndicadoresReporte = z.object({
  cerrados: z.object({ total: z.number().int(), resueltos: z.number().int(), descartados: z.number().int(), duplicados: z.number().int() }),
  resolucion: z.object({ promedio_dias: z.number().nullable(), n: z.number().int(), sin_calendario: z.number().int() }),
  dentro_de_plazo: z.object({ pct: z.number().int().nullable(), dentro: z.number().int(), n: z.number().int() }),
  horas: z.object({ total: z.number(), facturables: z.number(), internas: z.number(), fuera_de_horario: z.number(), pct_facturables: z.number().int().nullable() }),
})
export const SemanaHoras = z.object({ semana: fechaIso /* lunes */, facturables: z.number(), internas: z.number() })
export const CargaPersona = z.object({
  usuario: UsuarioBreve, departamento: referencia.nullable(),
  tickets_abiertos: z.number().int(), horas_estimadas: z.number(),
  capacidad_semanal: z.number().nullable(),   // jornadaSemanalHoras × capacidad_tickets_pct / 100; null sin departamento
  pct: z.number().int().nullable(),           // round(horas_estimadas / capacidad_semanal × 100), sin tope; null si capacidad null o 0
})
export const ResolucionPrioridad = z.object({
  prioridad: z.enum(PRIORIDADES), n: z.number().int(),
  promedio_dias: z.number().nullable(), objetivo_dias: z.number().nullable(),
  sobre_plazo: z.boolean(),                   // promedio_dias > objetivo_dias (false si alguno es null)
})
export const FilaCliente = z.object({
  cliente: ClienteBreve.nullable(),           // null en "Interno" y "Sin cliente"
  nombre: z.string(),                         // nombre del cliente, 'Interno' o 'Sin cliente'
  interno: z.boolean(),
  abiertos: z.number().int(), cerrados: z.number().int(), horas: z.number(),
  facturado: z.number().nullable(),           // CLP; null en "Interno" y "Sin cliente" (la web muestra «—»)
  por_facturar: z.number().nullable(),
})
export const ReporteSalida = z.object({
  filtros: FiltrosReporte,
  indicadores: IndicadoresReporte,
  horas_por_semana: z.array(SemanaHoras),     // una entrada por semana ISO que intersecta el período, en orden, con ceros
  carga: z.array(CargaPersona),
  resolucion_por_prioridad: z.array(ResolucionPrioridad).length(4),   // urgente, alta, media, baja, siempre las cuatro
  por_cliente: z.array(FilaCliente),
})

// esquemas/ot.ts (cambio, bloque 7D)
OtResumen.neto: z.number().nullable()         // ya era nullable para internas y OT sin cotización; ahora también null sin reportes.ver (§7)
```

Códigos nuevos en `shared/errores.ts`: ninguno. Se reutilizan `VALIDACION` (400), `SIN_PERMISO` (403), `NO_AUTENTICADO` (401). `permisos.ts` no cambia (`reportes.ver` ya existe con la fila 8 de la matriz). `shared/eventos.ts` no cambia (los reportes no publican eventos de dominio).

Tests `dias-habiles.test.ts` (**tabla**, `it.each`, con el horario de Soporte TI de las semillas: L–J 08:30–18:00 con colación 13:00/60, V 08:30–16:30, S–D inactivos; feriado `2026-10-12`; instantes en hora de Santiago):

| Caso                       | `a` → `b`                                                                                          | Esperado                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Dos días a la misma hora   | lun 2026-09-28 10:00 → mié 2026-09-30 10:00                                                        | `2` (7/8,5 + 1 + 1,5/8,5)            |
| Jornada completa           | lun 2026-09-28 08:30 → lun 2026-09-28 18:00                                                        | `1`                                  |
| Jueves y viernes completos | jue 2026-10-01 08:30 → vie 2026-10-02 16:30                                                        | `2`                                  |
| Media jornada de viernes   | vie 2026-10-02 08:30 → vie 2026-10-02 12:00                                                        | `0.5` (3,5/7)                        |
| Fuera de jornada           | lun 2026-09-28 20:00 → mar 2026-09-29 20:00                                                        | `1` (solo el martes aporta)          |
| Fin de semana              | sáb 2026-10-03 10:00 → dom 2026-10-04 10:00                                                        | `0`                                  |
| Cruce de feriado           | vie 2026-10-09 10:00 → mar 2026-10-13 10:00                                                        | `0.96` (5,5/7 + 0 + 0 + 0 + 1,5/8,5) |
| Orden invertido            | b anterior a a                                                                                     | `0`                                  |
| `jornadaDiariaPromedio`    | Soporte TI → `8.2`; Terreno (8 h × 5) → `8`; Coordinación (8 × 4 + 7) → `7.8`; todo inactivo → `0` |

Tests `esquemas.test.ts`: `ReportesQuery` acepta `{}`, `{ desde: '2026-09-01', hasta: '2026-09-30' }`, `{ departamento_id: '3' }` (coerción); rechaza `hasta < desde`, `desde: '2025-01-01', hasta: '2026-01-02'` (367 días), `desde: '2026-9-1'`, `cliente_id: 'x'`; `ReporteSalida` acepta la salida de §10.2 y rechaza `resolucion_por_prioridad` con 3 filas; `OtResumen` acepta `neto: null`.

### 3.3 Fábricas (`test/fabricas.ts`)

- `crearTicket` gana `horas_estimadas?: number` (se inserta tal cual; por defecto `NULL`). `creado_en`, `cerrado_en`, `fecha_limite`, `estado`, `prioridad`, `categoria_id`, `principal_id`, `otros_ids` ya existen y se usan en §10.2.
- `crearCategoria` gana `plazo_resolucion?: Record<Prioridad, Plazo>` (por defecto el actual de la fábrica; §10.2 fija `urgente 1 d, alta 1 d, media 2 d, baja 3 d`).
- `crearOt` gana `facturada_en?: Date` y `n_factura?: string` (ambos obligatorios si `estado_facturacion: 'facturada'`, por el `CHECK`), `cerrada_en?: Date`.
- `crearCotizacion` ya acepta `estado: 'aprobada'` y `lineas`; §10.2 la usa con una línea para fijar el neto.
- `crearDepartamento` ya acepta `capacidad_tickets_pct` y `horario`.
- Test `fabricas-fase7.test.ts`: `crearTicket({ horas_estimadas: 6 })` deja `6.00`; `crearOt` con `estado_facturacion: 'facturada'` sin `n_factura` viola el `CHECK`; con `facturada_en` y `n_factura` se inserta; `db:migrar` deja los cuatro índices de §3.1 (`pg_indexes`).

## 4. Definiciones (valen para API, exportación y web)

Toda fecha se interpreta en **America/Santiago**. Un **período** es `[desde, hasta]` en días calendario, ambos incluidos: un instante `x` «cae en el período» si `x >= desde 00:00 Santiago` y `x < (hasta + 1 día) 00:00 Santiago`; en SQL se escribe con los dos límites como parámetros (`cerrado_en >= $desde::date::timestamp AT TIME ZONE 'America/Santiago' AND cerrado_en < ($hasta::date + 1)::timestamp AT TIME ZONE 'America/Santiago'`), nunca con `AT TIME ZONE` sobre la columna (así los índices de §3.1 sirven). `registro_horas.fecha` es `date` y se compara directo (`BETWEEN $desde AND $hasta`).

1. **Defectos**: `desde` = primer día del mes actual; `hasta` = hoy. Sin filtro de departamento, cliente ni persona.
2. **Atribución de un ticket**: su **responsable principal** (B13). Su **departamento** es `COALESCE(departamento del principal, departamento del responsable por defecto de su categoría)` (misma cadena que `tickets.service.ts` al calcular plazos, ADR 0005); puede ser `NULL`. El filtro `departamento_id` compara con ese departamento; el filtro `usuario_id` exige que la persona sea el principal. Excepción: la **carga** (§4.7) cuenta tickets donde la persona es responsable **principal o no**, porque mide a quién le cae trabajo encima (el diseño cuenta así: Camila Rojas tiene 2 con TK-1042 como principal y TK-1048 como corresponsable).
3. **Atribución de una fila de horas**: la **persona que registró** (`registro_horas.usuario_id`) y su departamento (`usuario.departamento_id`); su **cliente** es `ot.cliente_id` si la fila es de OT, `ticket.cliente_id` si es de ticket y ninguno en «Sin ticket». Con filtro `cliente_id`, las filas «Sin ticket» quedan fuera; sin él, cuentan en los totales de horas pero en ninguna fila de la tabla por cliente.
4. **Cerrados en el período**: tickets con `cerrado_en` en el período, incluidos los **archivados** (siguen siendo tickets cerrados; `archivado_en` es solo de las vistas). `resueltos` / `descartados` / `duplicados` por `estado`. Un ticket reabierto tiene `cerrado_en = NULL` y no cuenta.
5. **Resolución en días hábiles**: solo tickets **`resuelto`** cerrados en el período; por ticket, `diasHabilesEntre(creado_en, cerrado_en, calendario del departamento del ticket)` (§4.2). Un ticket sin departamento resoluble no entra en el promedio y se cuenta en `sin_calendario`. `promedio_dias` = media aritmética redondeada a 2 decimales; `null` si `n = 0`. Los calendarios se cargan una vez por departamento con `cargarCalendario(m, departamento_id, años del período ampliados con los años de `creado_en`)`.
6. **Objetivo por prioridad**: para cada ticket `resuelto` del grupo, `plazo_resolucion[prioridad]` de su categoría convertido a días hábiles: `unidad = 'dias'` → `valor`; `unidad = 'horas'` → `valor / jornadaDiariaPromedio(horario del departamento del ticket)` (sin departamento → el ticket no aporta al objetivo). `objetivo_dias` = promedio redondeado a 2 decimales; `null` si nadie aporta. Las cuatro prioridades aparecen siempre, con `n: 0` y nulos si no hay tickets.
7. **Dentro de plazo**: tickets `resuelto` cerrados en el período **con `fecha_limite`**; `dentro` = `cerrado_en <= fecha_limite`; `pct = round(dentro / n × 100)`; `null` si `n = 0`. Los descartados y duplicados no se miden contra un plazo (decisión §14.4).
8. **Horas**: Σ `registro_horas.horas` con `fecha` en el período (filtros de §4.3). **Facturables** = filas con `ot_id` de una OT `tipo = 'facturable'`; **internas** = el resto (ticket, OT interna, Sin ticket); **fuera de horario** = Σ filas con la marca (corte transversal, como en la planilla); `pct_facturables = round(facturables / total × 100)`, `null` si `total = 0`. Misma clasificación que la planilla (spec Fase 5 §4.3).
9. **Horas por semana**: `date_trunc('week', fecha)::date` (lunes ISO, igual que `lunesDe`), facturables e internas por semana; se completan con ceros las semanas del período sin filas, desde `lunesDe(desde)` hasta `lunesDe(hasta)`. Con el tope de 366 días son a lo sumo 54 entradas.
10. **Carga vs capacidad** (instantánea de **hoy**, no del período): una fila por **usuario activo** (filtrado por `departamento_id` y `usuario_id`); `tickets_abiertos` = tickets con `cerrado_en IS NULL` donde la persona es responsable (principal o no), filtrados por `cliente_id`; `horas_estimadas` = Σ `ticket.horas_estimadas` de los tickets abiertos donde es **principal** (evita contar dos veces el mismo ticket) + Σ `tarea.horas_estimadas` de tareas **no hechas** asignadas a la persona (`tarea.responsable_id`) en OT con etapa no final (las tareas de ticket no tienen horas, spec §4.4), ambos filtrados por `cliente_id` (`ticket.cliente_id` / `ot.cliente_id`); `capacidad_semanal` = `jornadaSemanalHoras(horario del departamento) × capacidad_tickets_pct / 100` redondeado a 1 decimal (sin departamento → `null`); `pct` sin tope (la web recorta la barra al 100 % y deja el número). Orden: `pct` descendente con nulos al final, luego nombre.
11. **Tabla por cliente**: una fila por **cliente externo** con algún valor distinto de cero, ordenadas por nombre; después una fila **«Interno»** que agrupa todas las áreas internas (`es_interno`), y una fila **«Sin cliente»** si hay tickets sin cliente con valores; ambas con `facturado` y `por_facturar` en `null` (el diseño muestra «—»). Columnas: `abiertos` = tickets del cliente con `cerrado_en IS NULL` (instantánea, filtros de departamento y persona por §4.2); `cerrados` = §4.4; `horas` = §4.8 atribuidas por §4.3; **`facturado`** = Σ neto en CLP de las OT `estado_facturacion = 'facturada'` del cliente con `facturada_en` en el período; **`por_facturar`** = Σ neto en CLP de las OT `estado_facturacion = 'por_facturar'` del cliente (instantánea, sin período: es lo que hoy falta cobrar, igual que el indicador de la pantalla 10). El neto es el de la **cotización vigente** (`cv.neto_clp`, misma subconsulta `LATERAL` que `indicadoresOts`: `CLP` tal cual, `UF` × `valor_uf` redondeado); una OT facturable sin cotización aporta 0. Con filtro `cliente_id`, solo esa fila. Con filtro `departamento_id` o `usuario_id`, los montos se filtran por el **responsable técnico de la OT** (`ot.responsable_tecnico_id` y su departamento), que es quien «hizo» el trabajo.
12. **Montos solo con `reportes.ver`**: como toda la pantalla exige el permiso, la respuesta trae siempre los montos en CLP enteros. Técnico recibe 403 en ambas rutas.
13. **Redondeos**: horas a 2 decimales (`::float8` sobre `numeric(5,2)` ya es exacto), días a 2 decimales, porcentajes enteros, montos enteros (CLP). La web muestra días con 1 decimal (`1,5 d`), horas con `formatearHoras`, montos con `Monto`.
14. **Topes**: período ≤ 366 días (400 `VALIDACION { hasta }`); la consulta de tickets resueltos del período (la única que trae filas a memoria, porque necesita el calendario) se corta en **5 001** filas y responde 400 `VALIDACION { hasta: ['Acorta el período'] }` si las supera (criterio de ADR 0027.25). Todo lo demás es `GROUP BY` en SQL: la cantidad de filas devueltas está acotada por semanas (≤ 54), usuarios activos y clientes.
15. **Filtros inexistentes o inactivos**: `departamento_id`, `cliente_id` o `usuario_id` que no existe → 400 `VALIDACION { <campo>: ['… no encontrado'] }` (mismo criterio que los destinos de la planilla); un usuario **inactivo** o un cliente inactivo sí se aceptan (historial).

## 5. API de reportes (bloque 7B, `modulos/reportes/`)

### 5.1 Endpoints

| Método y ruta                     | Permiso        | Entrada         | Salida                                                 | Notas                                                                                                                                       |
| --------------------------------- | -------------- | --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/reportes`               | `reportes.ver` | `ReportesQuery` | `ReporteSalida`                                        | §5.2–§5.4; 400 por §4.14–§4.15                                                                                                              |
| `GET /api/reportes/exportar.xlsx` | `reportes.ver` | `ReportesQuery` | `attachment; filename="reportes-<desde>_<hasta>.xlsx"` | `respuesta: z.unknown()`, `res.set(...)` + `res.end(buffer)` como `exportar.xlsx` de OT; auditoría §5.5; cabecera `Cache-Control: no-store` |

`reportes.routes.ts` declara ambas con `ruta()` (etiqueta `Reportes`); `app.ts` monta `crearRutasReportes()` tras `crearRutasMiDia()`. `npm run api:openapi` y versionar `docs/api/openapi.json`.

### 5.2 Servicio (`reportes.service.ts`)

- `resolverFiltros(m, q): Promise<FiltrosReporte & { departamento_id?, cliente_id?, usuario_id? }>`: aplica los defectos con `hoyEnSantiago()` (se mueve a `core/fechas.ts` como única copia y `horas.tipos.ts` / `ots.comun.ts` la reexportan, sin tocar a sus consumidores), vuelve a comprobar el tope de 366 días (los defectos pueden combinarse con un `desde` lejano: `desde=2024-01-01` sin `hasta`), y resuelve `referencia` / `ClienteBreve` / `UsuarioBreve` con tres `SELECT` (400 si falta alguno).
- `calcularReporte(m, filtros): Promise<ReporteSalidaDatos>`: llama a las consultas de §5.3 en secuencia (seis `SELECT` agregados + una de tickets resueltos + los calendarios); no abre transacción. Es la **única** fuente para el JSON y para el `.xlsx`.
- `obtenerReporte(actor, q)`: `resolverFiltros` + `calcularReporte` con `dataSource.manager`. `logger.debug` solo con `{ usuario_id: actor.id, desde, hasta, departamento_id, cliente_id, usuario_id }`.
- `exportarReporte(actor, q, filtros: string[])`: `obtenerReporte` → `generarXlsxReportes(reporte, nombre_app)` → `enTransaccion` con `registrarAuditoria(tx, { accion: 'exportacion', usuario_id: actor.id, detalle: { tipo: 'xlsx', entidad: 'reportes', filtros } })` → `{ buffer, nombre: `reportes-${desde}_${hasta}.xlsx`, tipo_mime }`. `filtros` son las **claves** presentes en la query que existen en `ReportesQuery.shape` (`Object.hasOwn`, ADR 0027.37), ordenadas; nunca valores, ids ni montos.

### 5.3 Consultas (`reportes.consulta.ts`, `type Consulta = Pick<EntityManager, 'query'>`)

Fragmento común para la atribución de un ticket (§4.2), usado en todas las consultas de tickets:

```sql
FROM ticket t
LEFT JOIN LATERAL (SELECT u.id AS usuario_id, u.departamento_id
                     FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
                    WHERE r.ticket_id = t.id AND r.principal LIMIT 1) rp ON true
LEFT JOIN categoria cat ON cat.id = t.categoria_id
LEFT JOIN usuario ud ON ud.id = cat.responsable_defecto_id
-- departamento del ticket: COALESCE(rp.departamento_id, ud.departamento_id)
-- filtros: ($dep IS NULL OR COALESCE(rp.departamento_id, ud.departamento_id) = $dep)
--          AND ($usr IS NULL OR rp.usuario_id = $usr) AND ($cli IS NULL OR t.cliente_id = $cli)
```

1. **`cerrados(m, f)`**: `SELECT count(*) FILTER (WHERE t.estado = 'resuelto')::int AS resueltos, … descartados, … duplicados` con `cerrado_en` en el período y los filtros.
2. **`resueltosDelPeriodo(m, f)`**: `SELECT t.id, t.creado_en, t.cerrado_en, t.prioridad, t.fecha_limite, cat.plazo_resolucion, COALESCE(rp.departamento_id, ud.departamento_id) AS departamento_id … WHERE t.estado = 'resuelto' AND cerrado_en en el período … LIMIT 5001`; más de 5 000 → 400 (§4.14). Con estas filas y los calendarios (`cargarCalendario` una vez por `departamento_id` distinto, años = años de `min(creado_en)` a `hasta`), el servicio calcula en memoria `resolucion`, `dentro_de_plazo` y `resolucion_por_prioridad` (§4.5–§4.7) con `diasHabilesEntre` y `jornadaDiariaPromedio` de `shared`.
3. **`horas(m, f)`**: una consulta con `LEFT JOIN ot o ON o.id = rh.ot_id LEFT JOIN ticket t ON t.id = rh.ticket_id JOIN usuario u ON u.id = rh.usuario_id`, `WHERE rh.fecha BETWEEN $desde AND $hasta AND ($dep IS NULL OR u.departamento_id = $dep) AND ($usr IS NULL OR rh.usuario_id = $usr) AND ($cli IS NULL OR COALESCE(o.cliente_id, t.cliente_id) = $cli)`, que devuelve `date_trunc('week', rh.fecha)::date AS semana, sum(horas) FILTER (WHERE o.tipo = 'facturable') AS facturables, sum(horas) FILTER (WHERE o.tipo IS DISTINCT FROM 'facturable') AS internas, sum(horas) FILTER (WHERE rh.fuera_de_horario) AS fuera_de_horario GROUP BY 1 ORDER BY 1`. Los totales del indicador son la suma de las semanas; el arreglo `horas_por_semana` se completa con ceros en memoria (§4.9).
4. **`carga(m, f)`**: tres consultas agregadas por `usuario_id` sobre los usuarios activos (`WHERE u.activo AND ($dep IS NULL OR u.departamento_id = $dep) AND ($usr IS NULL OR u.id = $usr)`): tickets abiertos por responsable (cualquier rol; `count(DISTINCT t.id)`), Σ `t.horas_estimadas` por principal, Σ `ta.horas_estimadas` por `ta.responsable_id` con `NOT ta.hecha AND ta.ot_id IS NOT NULL AND o.etapa NOT IN ('cerrada','cancelada')`; más `horario_dia` y `capacidad_tickets_pct` de los departamentos involucrados para `capacidad_semanal` con `jornadaSemanalHoras` (en memoria; ≤ número de departamentos).
5. **`porCliente(m, f)`**: cuatro consultas agrupadas por `cliente_id` (abiertos, cerrados en el período, horas por `COALESCE(o.cliente_id, t.cliente_id)`, montos por `o.cliente_id` con `cv.neto_clp` y los dos estados de facturación) y una de `cliente (id, nombre, es_interno)`; el servicio arma las filas de §4.11 en memoria (externos con algún valor ≠ 0, «Interno», «Sin cliente»).

Toda consulta usa parámetros `$n`; los filtros opcionales van como `$n::int IS NULL OR …` (nunca concatenando SQL). Sin consultas por fila: el total son ≤ 11 `SELECT` por petición más una por departamento para el calendario.

### 5.4 Exportación (`integraciones/xlsx/reportes.xlsx.ts`, `generarXlsxReportes(reporte, nombreApp)`)

exceljs como `ots.xlsx.ts` (`wb.creator = nombreApp`, cabeceras en negrita, primera fila fija). Cinco hojas, en este orden:

| Hoja                       | Contenido                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Resumen»                  | Fila 1 «Período», `desde` y `hasta` (fechas `dd-mm-yyyy`); fila 2 «Departamento», «Cliente», «Persona» con el nombre o «Todos»; luego pares etiqueta / valor: Tickets cerrados, Resueltos, Descartados, Duplicados, Resolución promedio (días hábiles), Tickets sin calendario, Resueltos dentro de plazo (%), Horas totales, Horas facturables, Horas internas, Horas fuera de horario, % horas facturables |
| «Horas por semana»         | Semana (lunes, fecha) · Facturables · Internas · Total; totales al pie con `SUM`                                                                                                                                                                                                                                                                                                                             |
| «Carga vs capacidad»       | Persona · Departamento · Tickets abiertos · Horas estimadas · Capacidad semanal · % de la capacidad                                                                                                                                                                                                                                                                                                          |
| «Resolución por prioridad» | Prioridad (etiqueta) · Tickets · Promedio (días hábiles) · Objetivo (días hábiles) · Sobre plazo («Sí»/«No»)                                                                                                                                                                                                                                                                                                 |
| «Por cliente»              | Cliente · Abiertos · Cerrados · Horas · Facturado CLP · Por facturar CLP; totales al pie con `SUM` (horas y montos; las celdas `null` quedan vacías)                                                                                                                                                                                                                                                         |

Números como números (`'#,##0'` montos, `'0.00'` horas y días, `'0'` porcentajes); fechas con `new Date(`${f}T12:00:00Z`)` y formato `dd-mm-yyyy`; **todo texto se escribe como texto** (nombres de clientes y personas nunca como fórmula: ADR 0025.18); las únicas fórmulas son los `SUM` de los pies. Sin nota interna, sin descripciones de horas, sin ids.

### 5.5 Auditoría y logs

Exactamente **una** fila `auditoria` por exportación: `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros: ['cliente_id', 'desde', …] }` (solo nombres de filtros presentes; sin valores). `GET /api/reportes` no deja `auditoria` ni `evento`; la exportación tampoco deja `evento` ni `archivo` (no es una entidad, ADR 0027.18). Logs: `logger.debug` con ids y fechas del filtro; nunca nombres de clientes ni montos.

## 6. Eventos y auditoría generados en esta fase

| Acción                              | `evento` | `auditoria`                                                  | evento de dominio |
| ----------------------------------- | -------- | ------------------------------------------------------------ | ----------------- |
| Ver reportes (`GET /api/reportes`)  | —        | —                                                            | —                 |
| Exportar reportes (`exportar.xlsx`) | —        | `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros }` | —                 |
| Lista de OT con `neto: null` (7D)   | —        | —                                                            | —                 |

Cobertura (ADR 0003): `reportes/eventos.test.ts` afirma que `GET /api/reportes` deja `count(*)` de `evento` y `auditoria` igual, y que `exportar.xlsx` deja exactamente una `auditoria` con `entidad: 'reportes'` y ningún `evento`. La tabla de `CLAUDE.md` §2 gana la fila «Ver reportes / exportar reportes (`GET /api/reportes`, `exportar.xlsx`)» con `—` / `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros }`.

## 7. Neto de `/ots` sin `reportes.ver` (bloque 7D, cierra ADR 0027.7)

- **API**: `listarOts` (y `listarOtsParaExportar`, que ya exige `ots.facturar` y por tanto no cambia de comportamiento) reciben `verMontos = actor.permisos.includes('reportes.ver')`; sin él, `OtResumen.neto` se devuelve `null` para **toda** OT (también `cot_codigo`/`cot_version` siguen visibles: el código de la cotización no es un monto). `GET /api/ots/:id` **no cambia**: el detalle y el cotizador los usa el técnico para trabajar (ADR 0025.2 y 0025.17: «marcar como enviada» y `GET /api/config/tarifas` son de `tickets.editar`); ocultarlos ahí rompería el flujo sin proteger nada. Decisión §14.11, pregunta §15.3.
- **Web**: `TablaOts` muestra «—» con el mismo `MontoOculto` (tooltip «Los montos requieren el permiso Ver reportes y montos») cuando `neto === null` y la OT es facturable; las internas siguen mostrando horas. `OtsPage.test.tsx`: con `yoDePrueba({ rol: 'tecnico' })` y `neto: null` la celda muestra «—»; con `lectura` y `neto: 475000` muestra `$475.000`.
- Tests API (`ots.test.ts`): `GET /api/ots` como técnico → todas las filas con `neto: null`; como lectura → `neto` numérico; `GET /api/ots/:id` como técnico → la cotización vigente sigue trayendo `neto` (sin cambios).

## 8. Web reportes (bloque 7C, `features/reportes/`)

### 8.1 API del front (`features/reportes/api.ts`)

`reporte(consulta: ConsultaReportes)` → `obtener<ReporteSalidaDatos>(conQuery('/api/reportes', consulta))`; `urlExportarReportes(consulta)` → `conQuery('/api/reportes/exportar.xlsx', consulta)`; `clavesReportes.reporte(consulta)` = `['reportes', consulta]`; `STALE_REPORTES = 60_000`, sin `refetchInterval` (un reporte no es un tablero). Reutiliza `departamentos()`, `clientes()` y `usuarios()` de las features existentes para los selectores (solo activos en los selectores; la URL puede traer un id inactivo y se respeta).

### 8.2 Filtros y estado (`features/reportes/filtros.ts`)

Estado en la URL (ADR 0011): `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&departamento=<id>&cliente=<id>&usuario=<id>`; sin `desde`/`hasta` la pantalla manda la query sin ellos y muestra los que la API devuelve en `filtros`. Presets del selector «Período»: **Este mes** (sin `desde`/`hasta` en la URL), **Mes anterior**, **Últimos 30 días**, **Últimos 90 días**, **Personalizado** (dos `Input type="date"`, `max` = hoy + 1 año, con el mensaje de la API si el rango es inválido). `presetDeParams(params, hoy)` devuelve el preset que coincide o `'personalizado'`. Cambiar un filtro usa `setParams(…, { replace: true })` como `OtsPage`.

### 8.3 Rutas, menú y permiso

`router.tsx`: `/reportes` pasa a estar envuelta en `<RequierePermiso permiso="reportes.ver" />` (como `/configuracion`); `menu.ts`: la entrada «Reportes» gana `permiso: 'reportes.ver'`. Consecuencia: el técnico deja de ver «Reportes» en el menú lateral y en el panel «Más». **Actualizar** `MenuLateral.test.tsx` y `BarraInferior.test.tsx` (caso c de ADR 0019): admin, coordinación y lectura ven Reportes; técnico no. `TituloPagina` «Reportes».

### 8.4 Pantalla 14 — Reportes (`features/reportes/pages/ReportesPage.tsx`)

Diseño «Reportes». Escritorio (≥ 1024 px): barra de filtros, cuatro indicadores en una fila, dos gráficos lado a lado (horas por semana · carga vs capacidad), resolución por prioridad y la tabla por cliente a todo el ancho. Bajo 1024 px todo en una columna; la tabla con scroll horizontal (`overflow-x-auto`); el gráfico de semanas se recorta a las últimas 8 semanas con un aviso «Mostrando las últimas 8 semanas; exporta para ver todas» (solo bajo 1024 px). «Usable, no optimizada» (ADR 0011).

1. **`FiltrosReportes`**: `Select` «Período» con los presets de §8.2 (+ los dos `Input type="date"` en Personalizado), `Select` «Departamento» (Todos + activos), `Select` «Cliente» (Todos + clientes y áreas internas activos, las áreas con sufijo «· interno»), `Select` «Persona» (Todas + usuarios activos). Botón **«Exportar (.xlsx)»** (ícono `Download`): `toast.info('Exportando…')` + `descargar(urlExportarReportes(consulta))`, error → `toast.error` con el mensaje de la API. Un texto `tinta-3` bajo los filtros: «Período del 1 al 4 de octubre de 2026 · Soporte TI» con los filtros activos resueltos (`filtros` de la respuesta).
2. **`IndicadoresReportes`**: cuatro `Tarjeta` (se **extrae** `Tarjeta` de `features/ots/lista/IndicadoresOts.tsx` a `components/dominio/TarjetaIndicador.tsx` con las mismas clases y `to` opcional; `IndicadoresOts` pasa a usarla, sin cambio visual): **Tickets cerrados** («6» y debajo «4 resueltos · 1 descartado · 1 duplicado»), **Resolución promedio** («1,5 días hábiles», `—` si null; «n sin calendario» en `tinta-3` si > 0), **Dentro de plazo** («75 %» y «3 de 4 resueltos con plazo»; `—` si null), **Horas facturables** («50 %» y «5 de 10 h»; `—` si null). `aria-label` completo en cada tarjeta.
3. **`GraficoHorasSemana`** (Recharts `BarChart` apilado, `width`/`height` fijos por prop con `ResponsiveContainer` solo en la página): barras `facturables` con `fill="var(--color-grafico-facturable)"` y `internas` con `var(--color-grafico-interna)`, `LabelList` con el valor en cada segmento (`horasCorto`) y el total sobre la pila, eje X «28 sep – 4 oct», tooltip «28 sep – 4 oct: 5 h facturables, 5 h internas», leyenda con texto. Debajo, el resumen «7 de 12 h facturables (58 %)». Cada gráfico es un `<figure>` con `<figcaption>` y una **tabla oculta** (`sr-only`) con las mismas filas (semana, facturables, internas, total): es la fuente de los tests y del lector de pantalla. Vacío (`total 0`) → `EstadoVacio` «Sin horas en el período».
4. **`GraficoCarga`** (HTML, sin Recharts): una fila por persona: `Avatar` + nombre, etiqueta «2 · 14/32,8 h» (tickets abiertos · estimadas/capacidad), barra `bg-grafico-facturable` de ancho `min(100, pct)` % con `role="img"` y `aria-label="Camila Rojas: 2 tickets abiertos, 14 h estimadas de 32,8 h disponibles"`; `pct > 100` → número en `text-urgente font-semibold`; sin capacidad → «Sin jornada» y barra ausente. Tabla oculta con las columnas de la hoja «Carga vs capacidad».
5. **`GraficoPrioridad`** (HTML): cuatro filas Urgente · Alta · Media · Baja (`PillPrioridad` + texto); barra de ancho `promedio / escala` con `escala = max(6, máximo de promedios y objetivos)`, marca vertical en el objetivo (`bg-tinta`, 2 px), etiqueta «1,4 d · obj. 1» y «· sobre plazo» en `text-urgente font-semibold` cuando `sobre_plazo`; «Sin tickets resueltos» en `tinta-3` si `n = 0`. Tabla oculta.
6. **`TablaPorCliente`**: `Table` con Cliente (enlace a `/clientes/:id` salvo «Interno» y «Sin cliente», en cursiva) · Abiertos · Cerrados · Horas · Facturado · Por facturar; montos con `Monto`, `null` → «—»; «Por facturar» > 0 en `text-alta font-semibold` (ámbar del diseño); fila de totales al pie (horas y montos). Vacío → `EstadoVacio` «Nada que mostrar con estos filtros».
7. `Cargando`, `EstadoError` (con `reintentar`); 400 de la API (período inválido) se muestra en línea bajo los filtros, no como error de página.

Tests (jsdom, `ConSesion` + `simularFetch`): con el `ReporteSalida` de §10.2 la pantalla muestra «6» cerrados, «1,5 días hábiles», «75 %», «50 %»; la tabla oculta de horas por semana tiene la fila «2026-09-28 · 5 · 5 · 10»; la carga muestra «2 · 10/32,8 h» para la primera persona y recorta la barra al 100 % cuando `pct = 120`; «sobre plazo» aparece solo en Alta; la tabla por cliente muestra `$250.000` facturado en Clínica y «—» en Interno; `?departamento=3` se envía como `departamento_id=3`; elegir «Mes anterior» escribe `desde`/`hasta` en la URL; `desde > hasta` muestra el mensaje de la API en línea; pulsar «Exportar (.xlsx)» llama a `descargar` con `/api/reportes/exportar.xlsx?desde=…`; con `yoDePrueba({ rol: 'tecnico' })` la ruta `/reportes` renderiza `SinPermiso` y el menú no lista Reportes; con `lectura` todo se ve, montos incluidos.

## 9. Pruebas de seguridad obligatorias (`reportes/seguridad.test.ts`, bloque 7B; `ots/seguridad.test.ts` ampliado, bloque 7D)

1. Test genérico de permisos (Fase 1) verde con las dos rutas nuevas: sin sesión → 401 en ambas.
2. **Roles**: `tecnico` → **403** `SIN_PERMISO` en `GET /api/reportes` y en `exportar.xlsx` (y nada en `auditoria`); `lectura`, `coordinacion`, `admin` → 200 en ambas, con `por_cliente[].facturado` y `por_facturar` **numéricos** (B10: Solo lectura ve montos); sesión **Bearer de bot** de un técnico → 403, de una coordinadora → 200 (misma matriz, PLAN §4 Fase 6).
3. **Filtros manipulados**: `departamento_id=0`, `=-1`, `=abc`, `=1e3` → 400 `VALIDACION`; `usuario_id` inexistente → 400 `VALIDACION { usuario_id }` (no 500); `desde=2026-13-01` → 400; `hasta < desde` → 400 `VALIDACION { hasta }`; `desde=2025-01-01&hasta=2026-01-02` (367 días) → 400; `desde=2024-01-01` sin `hasta` → 400 (defecto `hasta = hoy` supera el tope); `hasta` futura → 200 con ceros; claves desconocidas (`sql=1`, `__proto__=1`) se ignoran y **no** aparecen en `auditoria.filtros`.
4. **Inyección**: `cliente_id=1;DROP TABLE ticket` → 400 (coerción falla); un cliente con nombre `'); DROP TABLE ticket; --` y otro con nombre `=1+1` → `GET /api/reportes` los devuelve literales en `por_cliente[].nombre`, la tabla `ticket` sigue existiendo y la celda del `.xlsx` releído con exceljs es **texto** (`type` `String`, no fórmula); un usuario con nombre `<img src=x onerror=alert(1)>` llega literal en `carga[].usuario.nombre`.
5. **Tope de filas**: fábrica que inserta 5 001 tickets `resuelto` cerrados en el período (inserción masiva por SQL en el test) → 400 `VALIDACION { hasta }`; con 5 000 → 200.
6. **Aislamiento de filtros**: con `departamento_id` de Terreno no aparecen en `carga` personas de Soporte TI ni horas registradas por ellas; con `usuario_id` de A, `cerrados` no cuenta tickets cuyo principal es B aunque A sea corresponsable; con `cliente_id` las filas «Sin ticket» quedan fuera de `horas.total` y `por_cliente` tiene una sola fila.
7. **Exportación auditada**: `exportar.xlsx?cliente_id=…&desde=…&zz=1` → exactamente una `auditoria` `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros: ['cliente_id', 'desde'] }` sin valores (`JSON.stringify(detalle)` no contiene el id del cliente ni «250000»), `usuario_id` = actor, `req_id` no nulo; `Content-Disposition` `attachment` con `reportes-<desde>_<hasta>.xlsx`; el `.xlsx` releído tiene las cinco hojas y los números de §10.2 como números.
8. **Sin fuga por la exportación**: el `.xlsx` no contiene descripciones de filas «Sin ticket», notas internas, nombres de archivo ni `n_factura`; la hoja «Por cliente» de un técnico no existe (403 antes de generar: `count(*)` de `auditoria` sin cambio).
9. **Permiso antes de validar**: `ruta()` ejecuta `requiere(permiso)` antes de `validar` (orden de middlewares de `ruta.ts`), así que un técnico con `desde` inválido recibe **403**, no 400 (no revela el esquema); la exportación de un técnico no genera el archivo ni toca `auditoria`.
10. **7D**: `GET /api/ots` como técnico → `neto: null` en todas las filas; como lectura → números; `GET /api/ots/exportar.xlsx` sigue 403 para técnico y lectura; `GET /api/ots/:id` como técnico → cotización con `neto` (sin cambio).
11. **Logs**: `GET /api/reportes` y la exportación no dejan en el logger de test nombres de clientes ni montos; solo ids y fechas.
12. `X-Request-Id` presente en 400 y 403.

## 10. Semillas y cifras esperadas (bloque 7E; tests de 7B)

### 10.1 Cambios en las semillas (`desarrollo-tickets.ts`, `desarrollo-ots.ts`, `desarrollo-cotizaciones.ts`)

- **`horas_estimadas`** en los tickets abiertos (los que tienen OT con tareas no la llevan: la estimación vive en las tareas): TK-1028 `6`, TK-1030 `2`, TK-1033 `3`, TK-1035 `4`, TK-1040 `4`, TK-1049 `1`, TK-1051 `3`. Los demás siguen `NULL`.
- **OT-0213** (nueva, facturable, **facturada**) sobre **TK-1012** (Transportes Austral, resuelto hace 20 días, archivado): responsable `treyes`, creador `crojas`, creada hoy−27 10:02, `inicio` hoy−26, `termino` hoy−20, aprobación del cliente por `orden_de_compra` (`OC-3920`, archivo `oc-3920.txt`, `crojas`, día 26), tarea «Cableado de 14 puntos» (`treyes`, est 12, real 12, hecha), cierre día 20 («Cableado terminado y certificado en los 14 puntos.», `treyes`, `resolvio_ticket: true`), **facturada** día 15 por `crojas` con `n_factura 'F-1187'` (`estado_facturacion = 'facturada'`, `facturada_en`, `facturada_por`; `evento` `cambio` de `estado_facturacion` como `POST /api/ots/:id/facturar`). Cotización **COT-0213 v1** `aprobada`: una línea «Cableado estructurado 14 puntos» `1 un × 380.000` → neto **380.000**, IVA 72.200, total 452.200; enviada día 27, aprobada día 26. Sin horas registradas (para no mover los totales de §10.3). Se inserta antes de OT-0214 y sigue el patrón de OT-0216. El contador de OT no cambia (219).
- Idempotencia: como el resto de `desarrollo-*.ts` (solo inserta lo que falta).

### 10.2 Escenario de fábricas con fechas fijas (`reportes.test.ts`; valores exactos)

Departamento **Soporte TI** (`crearDepartamento` con el horario por defecto L–J 08:30–18:00 colación 60; **viernes 08:30–16:30**; `capacidad_tickets_pct: 80`) y **Coordinación** (L–J 09:00–18:00, V 09:00–17:00, `capacidad_tickets_pct: 50`); sin feriados en el rango (`reiniciarBd` siembra los de Chile: ninguno entre el 21 sep y el 4 oct de 2026). Usuarios: `tecA`, `tecB` (técnicos, Soporte TI), `coord` (coordinación, Coordinación), `lect` (lectura, Soporte TI). Categoría `cat` con `plazo_resolucion` `urgente 1 d, alta 1 d, media 2 d, baja 3 d`. Clientes `Viña`, `Clínica`, `Transportes` (externos) y `Operaciones` (interno). Instantes en hora de Santiago (`-03:00` en esas fechas).

| Ticket | Prioridad | Cliente     | Principal (+otros) | `creado_en`      | `estado` / `cerrado_en`            | `fecha_limite`   | Otros                   |
| ------ | --------- | ----------- | ------------------ | ---------------- | ---------------------------------- | ---------------- | ----------------------- |
| T1     | alta      | Viña        | tecA               | lun 28 sep 10:00 | resuelto · mié 30 sep 10:00        | mar 29 sep 23:00 | fuera de plazo; 2,0 d   |
| T2     | media     | Viña        | tecA               | lun 28 sep 08:30 | resuelto · lun 28 sep 18:00        | mié 30 sep 23:00 | 1,0 d                   |
| T3     | baja      | Clínica     | tecB               | jue 1 oct 08:30  | resuelto · vie 2 oct 16:30         | mar 6 oct 23:00  | 2,0 d                   |
| T4     | media     | Clínica     | tecB               | jue 1 oct 09:00  | descartado · jue 1 oct 12:00       | —                | motivo                  |
| T5     | urgente   | Transportes | tecA               | vie 2 oct 08:30  | resuelto · vie 2 oct 16:30         | vie 2 oct 23:00  | 1,0 d                   |
| T6     | alta      | Viña        | tecA               | lun 28 sep 09:00 | en_curso                           | —                | `horas_estimadas 6`     |
| T7     | media     | Clínica     | tecB (+tecA)       | mar 29 sep 09:00 | nuevo                              | —                | `horas_estimadas 4`     |
| T8     | media     | Viña        | tecA               | lun 14 sep 09:00 | resuelto · mar 15 sep 09:00        | —                | fuera del período       |
| T9     | media     | Transportes | tecB               | mar 29 sep 09:00 | duplicado de T6 · mié 30 sep 11:00 | —                |                         |
| T10    | media     | Operaciones | tecB               | mar 29 sep 09:00 | en_curso                           | —                | interno; sin estimación |

OT: **O1** facturable, Viña, sobre T6, `en_ejecucion`, responsable tecA, con una tarea no hecha asignada a tecA de `4 h` estimadas; **O2** interna, Operaciones, sobre T10, `en_ejecucion`, responsable tecB; **O3** facturable, Viña, sobre T2, `cerrada`, `por_facturar`, cotización `aprobada` de una línea `1 × 680000`; **O4** facturable, Clínica, sobre T3, `cerrada`, `facturada` (`n_factura 'F-1'`, `facturada_en` jue 1 oct 12:00), cotización `aprobada` `1 × 250000`. Horas (`crearRegistroHoras`): tecA en O1 lun 28 sep `3`, mar 29 sep `2`, y **mié 23 sep `2`**; tecA en T6 mié 30 sep `1.5`; tecA «Sin ticket» jue 1 oct `1`; tecB en O2 jue 1 oct `2` (`fuera_de_horario: true`); tecB en T3 vie 2 oct `0.5`.

Esperado para `GET /api/reportes?desde=2026-09-28&hasta=2026-10-04` (como `lect`):

```
indicadores.cerrados              = { total: 6, resueltos: 4, descartados: 1, duplicados: 1 }
indicadores.resolucion            = { promedio_dias: 1.5, n: 4, sin_calendario: 0 }        // (2 + 1 + 2 + 1) / 4
indicadores.dentro_de_plazo       = { pct: 75, dentro: 3, n: 4 }                            // T1 fuera
indicadores.horas                 = { total: 10, facturables: 5, internas: 5, fuera_de_horario: 2, pct_facturables: 50 }
horas_por_semana                  = [ { semana: '2026-09-28', facturables: 5, internas: 5 } ]
resolucion_por_prioridad          = [ urgente { n: 1, promedio_dias: 1, objetivo_dias: 1, sobre_plazo: false },
                                      alta    { n: 1, promedio_dias: 2, objetivo_dias: 1, sobre_plazo: true },
                                      media   { n: 1, promedio_dias: 1, objetivo_dias: 2, sobre_plazo: false },
                                      baja    { n: 1, promedio_dias: 2, objetivo_dias: 3, sobre_plazo: false } ]
carga (orden por pct desc)        = [ tecA { tickets_abiertos: 2, horas_estimadas: 10, capacidad_semanal: 32.8, pct: 30 },   // T6 principal + T7 corresponsable; 6 + 4 (tarea O1)
                                      tecB { tickets_abiertos: 2, horas_estimadas: 4, capacidad_semanal: 32.8, pct: 12 },   // T7 principal + T10 principal
                                      y después lect { 0, 0, 32.8, 0 } y coord { 0, 0, 19.5, 0 }, en orden alfabético de nombre ]
por_cliente                       = [ Clínica     { abiertos: 1, cerrados: 2, horas: 0.5, facturado: 250000, por_facturar: 0 },
                                      Transportes { abiertos: 0, cerrados: 2, horas: 0, facturado: 0, por_facturar: 0 },
                                      Viña        { abiertos: 1, cerrados: 2, horas: 6.5, facturado: 0, por_facturar: 680000 },
                                      Interno     { abiertos: 1, cerrados: 0, horas: 2, facturado: null, por_facturar: null } ]   // T10 y las 2 h de O2
```

Variantes del mismo escenario: `desde=2026-09-21&hasta=2026-10-04` → `horas_por_semana = [ { '2026-09-21', 2, 0 }, { '2026-09-28', 5, 5 } ]`, `horas.total 12`, `pct_facturables 58`; `departamento_id=<Coordinación>` → `cerrados.total 0`, `carga = [ coord ]`, `horas.total 0`; `usuario_id=<tecB>` → `cerrados = { 3, 1, 1, 1 }` (T3, T4, T9), `horas.total 2.5`, `carga = [ tecB ]`; `cliente_id=<Viña>` → `por_cliente` una fila, `horas.total 6.5` (sin «Sin ticket»); `desde=2026-09-14&hasta=2026-09-20` → `cerrados.total 1` (T8), `resolucion.promedio_dias 1`; un ticket resuelto cuyo principal no tiene departamento y cuya categoría no tiene responsable por defecto → `sin_calendario 1` y no altera `promedio_dias`; `hasta` futura (`2027-01-01` con `desde=2026-12-01`) → todo en cero, 200. La exportación con la query base releída con exceljs: hoja «Resumen» celda «Tickets cerrados» = 6; «Por cliente» fila Clínica, Facturado = 250000 (número); «Horas por semana» una fila y `SUM` en el pie.

### 10.3 Cifras con las semillas (`desarrollo.test.ts`, bloque 7E)

Las semillas son relativas a «hoy» (día de la siembra), así que el test consulta **`desde = hoy − 30`, `hasta = hoy`** (no el defecto del mes) como `hikki`, antes de cualquier mutación del propio test. Con `h = true` si la semilla insertó el martes de la semana actual (hoy no es lunes; igual que el test actual de la planilla):

| Métrica                    | Esperado                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cerrados`                 | `{ total: 6, resueltos: 4, descartados: 1, duplicados: 1 }` (TK-1019, 1012, 1024, 1026 · 1047 · 1044)                                                                                                                                                                          |
| `dentro_de_plazo`          | `{ pct: 75, dentro: 3, n: 4 }` (TK-1026 se cerró un día después de su límite)                                                                                                                                                                                                  |
| `resolucion`               | `n: 4`, `sin_calendario: 0`, `promedio_dias` número `> 0` y `≤ 10` (depende del día de la semana en que se sembró)                                                                                                                                                             |
| `horas`                    | `total` 18 (h) o 13,5; `facturables` 8,5 o 5; `fuera_de_horario` 0,5 o 0; `pct_facturables` 47 o 37                                                                                                                                                                            |
| `horas_por_semana`         | la semana del lunes anterior: `{ facturables: 0, internas: 4 }` (TK-1048); la semana actual: `{ 8.5, 5.5 }` o `{ 5, 4.5 }`                                                                                                                                                     |
| `resolucion_por_prioridad` | `media.n 3` con `objetivo_dias 4.67` ((6 + 2 + 6) / 3: Hardware, Redes, Hardware), `alta.n 1` con `objetivo_dias 1`, `urgente.n 0`, `baja.n 0`                                                                                                                                 |
| `carga` (11 filas)         | crojas `{ 2, 1, 32.8 }`, dmunoz `{ 2, 7, 36 }`, treyes `{ 2, 6, 36 }`, vsoto `{ 2, 14, 36 }`, sdiaz `{ 1, 6, 32.8 }`, mfuentes `{ 1, 10, 32.8 }`, imorales `{ 1, 4, 32.8 }`, fcastro `{ 1, 3, 19.5 }`, nvega `{ 1, 2, 32.8 }`, jperez `{ 1, 1, 32.8 }`, hikki `{ 0, 0, 19.5 }` |
| `por_cliente`              | Viña `{ 2, 0, 8 o 7, 0, 0 }`; Constructora Andes `{ 2, 0, 4.5 o 2, 0, 0 }`; Clínica `{ 2, 2, 0, 0, 680000 }`; Transportes Austral `{ 2, 2, 0, 380000, 0 }`; Interno `{ 4, 1, 4 o 3.5, null, null }`; Sin cliente `{ 0, 1, 0, null, null }`                                     |
| `GET /api/ots/indicadores` | sin cambios: `por_facturar.n 1` (OT-0213 está facturada)                                                                                                                                                                                                                       |
| Conteos                    | 7 OT, 5 cotizaciones (3 aprobadas), 3 `aprobacion_cliente`; `GET /api/ots?estado_facturacion=facturada` → OT-0213 con `neto 380000` (como coordinación)                                                                                                                        |

`npm run db:reiniciar` deja `/reportes` con estas cifras para `crojas`, `hikki` y `nvega`; `sdiaz` ve «Sin permiso».

## 11. Documentación (bloque 7E)

- `docs/manuales/usuario/02-coordinacion.md`: sección **«Reportes»** (qué mide cada indicador con sus definiciones en lenguaje llano: «cerrados dentro de plazo» compara la fecha de cierre con la fecha límite; «resolución promedio» cuenta días hábiles del departamento del responsable; «carga» suma horas estimadas de tickets y tareas abiertas contra el % de la jornada disponible para tickets; «por facturar» es lo que falta cobrar hoy; cómo exportar). Quitar «Reportes» de «Lo que todavía no está».
- `docs/manuales/usuario/00-primeros-pasos.md`: párrafo para Solo lectura: ve Reportes con montos; el técnico no.
- `docs/manuales/administracion.md`: en «Departamentos y horarios», que el **% de la jornada disponible para tickets** alimenta la capacidad del reporte de carga; en «Equipo y permisos», que «Ver reportes y montos» ahora también decide la columna Neto de la lista de OT.
- `docs/api/README.md`: ejemplos `curl` de `GET /api/reportes?desde=&hasta=&departamento_id=` y de la exportación. `docs/api/openapi.json` regenerado. `docs/CHANGELOG.md` (Fase 7 en «Añadido»; «Cambiado»: Neto de `/ots` oculto sin permiso; semillas con OT-0213). `CLAUDE.md`: fila nueva en la tabla §2 (§6), mención de `modulos/reportes` como módulo de solo lectura y de `core/fechas.ts` (`hoyEnSantiago`). `README.md` si cambia algún script (no se espera).
- `docs/decisiones/0028-precisiones-de-la-fase-7.md` con lo de §14–§16 y `README.md` de decisiones actualizado; `preguntas-abiertas.md` no se edita (B10 queda aplicada).

## 12. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea                                          | Bloque | Crea/edita                                                                                                                                                                                                                                | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F7-T1 Contratos compartidos y días hábiles** | 7A     | `shared/src/{esquemas/reportes,horas-habiles/dias-habiles}.ts`, `esquemas/ot.ts`, índices                                                                                                                                                 | `dias-habiles.test.ts` con la tabla de §3.2 verde; `esquemas.test.ts` cubre §3.2; `typecheck` verde en api y web.                                                                                                                                                                                                                                                                                                                                                                                  |
| **F7-T2 Migración y fábricas**                 | 7A     | migración 14, `fabricas.ts`, `fabricas-fase7.test.ts`                                                                                                                                                                                     | `db:migrar` desde cero aplica 14; `db:revertir` deja 13; §3.3 verde; las semillas actuales siguen cargando.                                                                                                                                                                                                                                                                                                                                                                                        |
| **F7-T3 Consultas agregadas**                  | 7B     | `modulos/reportes/{reportes.consulta,reportes.tipos}.ts`, `core/fechas.ts`, `reportes.test.ts` (parte)                                                                                                                                    | §5.3 puntos 1, 3, 4, 5 con el escenario de §10.2: `cerrados`, `horas`, `horas_por_semana`, `carga`, `por_cliente` exactos, incluidas las variantes por filtro; parámetros `$n` en todo el SQL.                                                                                                                                                                                                                                                                                                     |
| **F7-T4 Resolución y plazo**                   | 7B     | `reportes.consulta.ts` (punto 2), `reportes.service.ts`, `reportes.test.ts`                                                                                                                                                               | §4.5–§4.7 y §5.2: `resolucion`, `dentro_de_plazo`, `resolucion_por_prioridad` exactos; `sin_calendario`; tope de 5 001 → 400; defectos de período y 400 de §4.14–§4.15.                                                                                                                                                                                                                                                                                                                            |
| **F7-T5 Rutas y exportación**                  | 7B     | `reportes.routes.ts`, `app.ts`, `integraciones/xlsx/reportes.xlsx.ts`, `reportes.exportar.test.ts`                                                                                                                                        | §5.1, §5.4, §5.5; el `.xlsx` releído tiene cinco hojas con las cifras de §10.2; una `auditoria` por exportación; `openapi.json` regenerado.                                                                                                                                                                                                                                                                                                                                                        |
| **F7-T6 Seguridad y cobertura**                | 7B     | `reportes/seguridad.test.ts`, `reportes/eventos.test.ts`                                                                                                                                                                                  | Las 12 pruebas de §9 (salvo la 10, de 7D) y la cobertura de §6 verdes.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **F7-T7 Neto de `/ots` sin permiso**           | 7D     | `ots.consulta.ts`, `ots.service.ts`, `ots.routes.ts`, `TablaOts.tsx`, `ots.test.ts`, `ots/seguridad.test.ts`, `OtsPage.test.tsx`                                                                                                          | §7 y prueba 10 de §9; `IndicadoresOts` sin cambios.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **F7-T8 Web: api, filtros, componentes puros** | 7C     | `features/reportes/{api,filtros}.ts`, `components/{IndicadoresReportes,GraficoHorasSemana,GraficoCarga,GraficoPrioridad,TablaPorCliente}.tsx`, `components/dominio/TarjetaIndicador.tsx`, `IndicadoresOts.tsx`, `package.json` (Recharts) | Tests jsdom de §8.4 sobre los componentes con el `ReporteSalida` de §10.2; `IndicadoresOts.test.tsx` sigue verde; `npm run build` de web verde con Recharts.                                                                                                                                                                                                                                                                                                                                       |
| **F7-T9 Pantalla 14 Reportes**                 | 7C     | `pages/ReportesPage.tsx`, `components/FiltrosReportes.tsx`, `router.tsx`, `menu.ts`, `MenuLateral.test.tsx`, `BarraInferior.test.tsx`                                                                                                     | §8.1–§8.4 con sus tests. En el navegador (1440 y 390 px) con `crojas`: la pantalla muestra las cifras de §10.3 para «Últimos 30 días», filtrar por Terreno deja 3 personas en carga, exportar descarga un `.xlsx` abrible con cinco hojas; con `nvega` (lectura) idéntico, montos incluidos; con `sdiaz` el menú no muestra Reportes y `/reportes` dice «Sin permiso».                                                                                                                             |
| **F7-T10 Semillas**                            | 7E     | `semillas/desarrollo-{tickets,ots,cotizaciones}.ts`, `desarrollo.test.ts`                                                                                                                                                                 | §10.1 y §10.3; `npm run db:reiniciar` dos veces deja 7 OT y 5 cotizaciones; `/ots?estado_facturacion=facturada` muestra OT-0213.                                                                                                                                                                                                                                                                                                                                                                   |
| **F7-T11 Revisión de seguridad de la fase**    | —      | correcciones con test                                                                                                                                                                                                                     | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo; cada hallazgo confirmado se corrige con un test que lo demuestre; nada se mergea con hallazgos abiertos. Puntos a mirar: SQL solo con parámetros y filtros opcionales por `$n IS NULL`; 403 antes de validar; `filtros` de la auditoría solo claves del esquema; textos como texto en el `.xlsx`; montos nunca en logs; topes de período y filas; `neto: null` en toda vía de lista sin permiso. |
| **F7-T12 Documentación y cierre**              | 7E     | §11, `docs/decisiones/0028-precisiones-de-la-fase-7.md`, `docs/decisiones/README.md`, `docs/api/openapi.json`, `CLAUDE.md`, `docs/CHANGELOG.md`                                                                                           | Criterios de §13 desde un clon limpio; PR a `main` con CI verde, con confirmación del usuario.                                                                                                                                                                                                                                                                                                                                                                                                     |

## 13. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 14 migraciones aplicadas
npm test                                                                                    → verde (shared: dias-habiles, esquemas; api: todos; web; bot)
                                                                                              Duration de la API ≤ 7 min local (anotar la cifra)
npm run db:reiniciar                                                                        → 18 tickets, 7 OT, 5 cotizaciones; OT-0213 facturada
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (6 colas, sin cambios)
curl -b cookie(crojas) "localhost:3010/api/reportes?desde=<hoy-30>&hasta=<hoy>"              → 200 { indicadores: { cerrados: { total: 6, resueltos: 4, … }, dentro_de_plazo: { pct: 75 } }, carga: 11 filas, por_cliente: 6 filas }
curl -b cookie(nvega)  "localhost:3010/api/reportes?desde=<hoy-30>&hasta=<hoy>"              → 200 con por_cliente[Clínica].por_facturar = 680000 y [Transportes Austral].facturado = 380000
curl -b cookie(sdiaz)  "localhost:3010/api/reportes"                                         → 403 SIN_PERMISO
curl -b cookie(crojas) "localhost:3010/api/reportes?desde=2026-10-10&hasta=2026-10-01"       → 400 VALIDACION { hasta }
curl -b cookie(crojas) "localhost:3010/api/reportes?departamento_id=999"                     → 400 VALIDACION { departamento_id }
curl -b cookie(crojas) -OJ "localhost:3010/api/reportes/exportar.xlsx?desde=<hoy-30>&hasta=<hoy>&cliente_id=<Clínica>" → reportes-<desde>_<hasta>.xlsx; auditoria.exportacion { entidad: 'reportes', filtros: ['cliente_id','desde','hasta'] }
curl -b cookie(sdiaz)  -OJ "localhost:3010/api/reportes/exportar.xlsx"                       → 403; count(auditoria) sin cambio
curl -b cookie(sdiaz)  "localhost:3010/api/ots"                                              → 200 con neto: null en todas las filas
curl -b cookie(nvega)  "localhost:3010/api/ots?estado_facturacion=facturada"                 → 200 { datos: [ { codigo: 'OT-0213', neto: 380000 } ] }
GitHub Actions: workflow CI verde en la rama y en el PR a main; paso "Tests" ≤ 4 min
```

En el navegador (1440 px y 390 px): `/reportes` con `crojas` y «Últimos 30 días» muestra 6 cerrados (4 · 1 · 1), 75 % dentro de plazo, el gráfico de semanas con la semana actual (8,5 h facturables / 5,5 internas) y la anterior (4 h internas), la carga con Valentina Soto arriba (14/36 h) y la tabla por cliente con $680.000 por facturar en Clínica Los Robles y $380.000 facturado en Transportes Austral; cambiar a Terreno deja 3 personas; exportar abre un `.xlsx` con cinco hojas; `/ots` con `sdiaz` muestra «—» en Neto; con `nvega` `/reportes` se ve completa y `/ots` muestra los netos; `sdiaz` no ve Reportes en el menú ni en «Más» y `/reportes` responde «Sin permiso». Detener `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

## 14. Decisiones tomadas en esta spec (con justificación)

1. **Un solo endpoint agregado `GET /api/reportes` y su exportación**, no uno por gráfico: todos comparten filtros, la pantalla los pide juntos y el `.xlsx` debe cuadrar al peso con lo que se ve; una sola función `calcularReporte` es la única fuente y lo garantiza. El costo (≤ 11 `SELECT` agregados por petición) es despreciable a esta escala.
2. **Permiso `reportes.ver` en toda la fase**, sin permiso nuevo: ADR 0002 lo define como «reportes, montos, horas de cualquier persona» y B10 lo da a Solo lectura; por eso el reporte de carga lista a todas las personas con sus horas **agregadas** aunque Solo lectura no tenga `horas.ver_todas` (ADR 0026.2 protege la planilla detallada, no los agregados). Pregunta §15.2.
3. **Días hábiles por fracción de jornada** (`diasHabilesEntre`): dividir `horasHabilesEntre` por una jornada promedio daba fracciones raras (17 h / 8,2 = 2,07 días para dos jornadas completas); sumar la fracción de cada día da 2,0 exactos y respeta viernes cortos y feriados del mismo motor de ADR 0005.
4. **«Dentro de plazo» solo para resueltos con fecha límite y comparando `cerrado_en` con `fecha_limite`**: es la única definición que no requiere calendario (el plazo ya se calculó en horas hábiles al crear el ticket) y coincide con `vencido` de la Tabla y el job de vencimientos (B2); descartados y duplicados no «se resuelven», así que no se miden. Pregunta §15.4.
5. **La resolución se mide desde `creado_en`** (no desde `inicio_planificado`, que las semillas ni la mayoría de los tickets fijan): es lo que el cliente percibe.
6. **Calendario del ticket = departamento del principal, si no el del responsable por defecto de la categoría** (B13 y la misma cadena de `tickets.service.ts`); sin ninguno, el ticket cuenta en cerrados pero no en el promedio (`sin_calendario`), antes que inventar una jornada.
7. **Objetivo por prioridad = promedio de los plazos de las categorías de los tickets del grupo** (A5: el plazo es por categoría y prioridad; el diseño muestra un solo objetivo por prioridad). Horas → días con la jornada diaria promedio del departamento.
8. **Carga = tickets abiertos (cualquier rol de responsable) · horas estimadas (tickets como principal + tareas de OT no hechas asignadas) / capacidad semanal × %**: reproduce la etiqueta del diseño («2 · 14/33 h»), cuenta los tickets como el Tablero (Camila con 2) y toma las estimaciones de donde hoy se escriben (tareas de OT; `ticket.horas_estimadas` para lo que no tiene OT). La capacidad usa `capacidad_tickets_pct`, que existía desde la Fase 1 sin consumidor (spec §4.8). Pregunta §15.5.
9. **Carga, «abiertos» y «por facturar» son instantáneas de hoy; cerrados, horas, resolución y facturado son del período**: lo abierto y lo pendiente de cobro solo tienen sentido «ahora» (igual que los indicadores de la pantalla 10); lo demás es historia y se filtra. La web lo explica en los subtítulos.
10. **«Interno» como una sola fila y «Sin cliente» aparte**, con montos `null`: es lo que dibuja el diseño; las áreas internas nunca facturan. Pregunta §15.6.
11. **Neto de `/ots` oculto sin `reportes.ver`, detalle y cotizador intactos** (cierra ADR 0027.7): la lista y sus indicadores son vistas de reporte y ya ocultaban los indicadores; el detalle y el cotizador son herramientas de trabajo del técnico (ADR 0025.2 y 0025.17), y ocultar ahí el neto rompería «marcar como enviada» e «importar horas» sin proteger nada que el técnico no haya escrito él mismo. Pregunta §15.3.
12. **Período máximo de un año y tope de 5 001 tickets resueltos en memoria**: la única consulta no agregada es la de resolución (necesita el calendario); con un año y 10 personas son cientos de filas, y el tope es la red por si algún día no. Mismo criterio y mismo mensaje que la línea de tiempo (ADR 0027.25).
13. **Límites de fecha como parámetros, nunca `AT TIME ZONE` sobre la columna**: deja usar los índices nuevos; `registro_horas.fecha` es `date` y se compara directo.
14. **Recharts solo para las barras apiladas; carga y resolución en HTML**: el diseño las dibuja como barras simples con texto, el HTML es accesible sin esfuerzo y evita acoplar tres gráficos a una librería que entra hoy; ADR 0011 pide Recharts «para reportes» y se cumple donde aporta (apilado, tooltip, ejes). Cada gráfico lleva una tabla oculta: lector de pantalla y tests leen lo mismo.
15. **Sin cache ni job**: con 10 personas y consultas agregadas, calcular al pedir es más simple y siempre cuadra con lo recién registrado; `staleTime` de 60 s en el front basta.
16. **Semillas con `horas_estimadas` y OT-0213 facturada**: sin ellas la carga sería 0 para la mitad del equipo y «Facturado» siempre $0, y PLAN exige que «las cifras cuadren con las semillas». Se agrega una OT anterior a las existentes (OT-0213 sobre el ticket ya archivado TK-1012) para no alterar la historia del diseño. Pregunta §15.7.
17. **`hoyEnSantiago` a `core/fechas.ts`**: tercera copia evitada; las dos existentes reexportan para no tocar consumidores (cambio surgical).

## 15. Preguntas para el usuario

1. **[No bloquea · recomendación: aceptar tal cual]** ¿Confirmas las **definiciones** de §4 (cerrados por `cerrado_en`, resolución en días hábiles por fracción de jornada desde `creado_en`, dentro de plazo = `cerrado_en ≤ fecha_limite` solo en resueltos, horas por `fecha`, carga como §4.10, «por facturar» como instantánea)? Son las que cuadran con el diseño y con las pantallas 2, 8 y 10; cambiarlas después es tocar una función y sus tests.
2. **[No bloquea · recomendación: sí]** ¿Solo lectura puede ver el gráfico de **carga por persona** (horas estimadas y capacidad de cada uno)? ADR 0002 incluye «horas de cualquier persona» en `reportes.ver`. Alternativa: ocultar la sección a `lectura` (un `if` en API y web).
3. **[No bloquea · recomendación: ocultar solo en la lista]** Pendiente de ADR 0027.7: ¿la columna **Neto de `/ots`** pasa a «—» para el técnico (decisión §14.11), se deja como está, o se oculta también en el detalle de la OT y el cotizador (rompería el flujo del técnico)? Si eliges «dejar como está», F7-T7 no se ejecuta y se anota en la ADR.
4. **[No bloquea · recomendación: solo resueltos]** ¿«% cerrados dentro de plazo» cuenta solo **resueltos** (decisión §14.4) o también descartados y duplicados cerrados antes de su límite?
5. **[No bloquea · recomendación: incluir las tareas]** ¿Las **horas estimadas** de la carga suman tareas de OT no hechas asignadas a la persona además de `ticket.horas_estimadas` (decisión §14.8), o solo los tickets? Sin las tareas, la carga de las semillas es casi toda 0 (los tickets con OT no llevan estimación).
6. **[No bloquea · recomendación: agrupar]** ¿Las **áreas internas** van agrupadas en una fila «Interno» (diseño) o una fila por área?
7. **[No bloquea · recomendación: sí]** ¿Agregar a las semillas **OT-0213 facturada** sobre TK-1012 (y `horas_estimadas` en 7 tickets) para que «Facturado» y «Carga» tengan cifras? Cambia los conteos de `desarrollo.test.ts` (7 OT, 5 cotizaciones).
8. **[No bloquea · recomendación: no en esta fase]** ¿Quieres además un indicador de **tiempo de primera respuesta** (`primera_respuesta_en` ya se guarda) o la columna **horas de bolsa / a cotizar** por cliente (ADR 0015)? Ambos son una tarjeta o columna más; propongo anotarlos en ADR 0028 como mejoras y hacerlos solo si los pides.
9. **[No bloquea · recomendación: mes actual]** ¿Período por defecto el **mes actual** o los **últimos 30 días**? El diseño muestra un mes.

No hay preguntas bloqueantes: todo lo anterior se implementa con la recomendación si no hay respuesta, y cada alternativa es un cambio local.

### Respuestas (2026-10-04)

Ninguna pregunta bloquea, así que, según la regla acordada con el usuario, las nueve se resuelven con la recomendación: 1 definiciones de §4 tal cual; 2 Solo lectura ve la carga por persona; 3 Neto de `/ots` oculto solo en la lista (F7-T7 se ejecuta); 4 solo resueltos; 5 se incluyen las tareas de OT; 6 áreas internas agrupadas en «Interno»; 7 se agregan OT-0213 facturada y `horas_estimadas` a las semillas; 8 primera respuesta y bolsa / a cotizar quedan fuera, anotadas en ADR 0028; 9 período por defecto el mes actual. El usuario puede cambiar cualquiera antes del PR.

## 16. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0028 «Precisiones de la Fase 7» al cerrar)

- **ADR 0002 / B10**: `reportes.ver` protege `GET /api/reportes`, su exportación y, desde esta fase, la columna Neto de la lista de OT (`OtResumen.neto` null sin el permiso); Solo lectura ve reportes, montos y la carga agregada por persona; Técnico no entra a Reportes (menú y ruta con `RequierePermiso`). `GET /api/ots/:id` y el cotizador no cambian (ADR 0025.2 y 0025.17).
- **ADR 0005**: `diasHabilesEntre(a, b, cal)` (suma de fracciones de jornada por día) y `jornadaDiariaPromedio(horario)` en `shared/horas-habiles`; la «resolución promedio en días hábiles» de los reportes usa el calendario del departamento del responsable principal (si no, el del responsable por defecto de la categoría); «dentro de plazo» compara `cerrado_en` con `fecha_limite` sin recalcular.
- **ADR 0010**: rutas nuevas `GET /api/reportes` y `GET /api/reportes/exportar.xlsx` (`reportes.ver`); filtros opcionales inexistentes → 400 `VALIDACION { campo }`; período ≤ 366 días y tope de 5 001 tickets resueltos → 400 `VALIDACION { hasta }`; sin códigos nuevos.
- **ADR 0011 / 0019**: Recharts `^3` entra en `apps/web` solo para el gráfico apilado de horas por semana; carga y resolución son barras HTML con texto; cada gráfico lleva una tabla `sr-only`; `TarjetaIndicador` compartida por las pantallas 10 y 14; estado en la URL (`desde`, `hasta`, `departamento`, `cliente`, `usuario`); Reportes deja de aparecer en el menú del técnico.
- **ADR 0015**: la tabla por cliente separa `facturado` (OT facturadas en el período) de `por_facturar` (instantánea) con el neto de la cotización vigente; la separación bolsa / a cotizar queda como mejora anotada.
- **ADR 0017**: `exportacion { tipo: 'xlsx', entidad: 'reportes', filtros }` con solo las claves presentes del esquema (`Object.hasOwn`); ver reportes no deja `auditoria` ni `evento`; logs de reportes solo con ids y fechas.
- **ADR 0023.8 / 0027.7**: pendiente cerrado: Neto de `/ots` visible solo con `reportes.ver`.
- **ADR 0025.18**: la regla «texto siempre como texto, fórmulas solo en los `SUM` del pie» rige también para `reportes.xlsx.ts`.
- **ADR 0025.33 / 0026.28 / 0027.23 (semillas)**: `horas_estimadas` en siete tickets abiertos y OT-0213 facturable facturada (COT-0213 v1 aprobada, neto 380.000) sobre TK-1012; 7 OT y 5 cotizaciones.
- **ADR 0027.25**: el criterio «tope con 400 `VALIDACION`» se aplica al período (366 días) y a la consulta de resolución (5 001 filas).
- **Spec funcional §4.8 / §5 pantalla 14 / PLAN §4**: «capacidad» = `jornadaSemanalHoras × capacidad_tickets_pct / 100`; «carga» = horas estimadas de tickets (principal) y tareas de OT abiertas asignadas; indicadores, gráficos, tabla por cliente y exportación según §4; sin comparación con el mes anterior ni reportes al cliente en v1.
- **Infraestructura**: `hoyEnSantiago` vive en `core/fechas.ts`; `horas.tipos.ts` y `ots.comun.ts` la reexportan.
