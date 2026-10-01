# Fase 5 — Horas · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §1 (revisión de seguridad al cierre) y §4 Fase 5; ADR 0003, **0005**, 0007, 0010, 0011, **0015**, 0017, 0021 (punto 10), 0023 (punto 18), **0024** (punto 2), **0025** (puntos 4, 16 y consecuencias); `preguntas-abiertas.md` **B3, B4, B5**, B6, B10; spec funcional **§4.8 Horas y horarios**, §4.4 (tareas con horas), §4.5 (OT interna: horas y costo interno), §5 pantalla **13 Horas**, §6 (`RegistroHoras(id, usuario_id, fecha, ticket_id?, ot_id?, horas, fuera_de_horario, descripcion)`); diseño "Registro de horas" (`pantallas-logica.txt`: filas OT-0218 · OT-0217 · TK-1026 · TK-1049 · "Sin ticket · Reunión de equipo y coordinación"; columnas Lun 28 … Vie 2 con jornada 8,5 / 8,5 / 8,5 / 8,5 / 7; totales por fila, por día comparados con la jornada, total semanal con barra sobre 41 h; resumen facturables / internas / fuera de horario) y "Orden de trabajo OT-0218" (historial "registró 3 h en «Diagnóstico»", tareas con horas estimadas y reales).
>
> Rama `feat/fase-5-horas`; PR a `main` al cerrar con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1. Entorno: el de la Fase 4. Todo lo construido en las Fases 0–4 (`ruta()`, `enTransaccion`, `registrarCambios`, `registrarEvento`, `bloquearTicket` → `bloquearOt`, `ots.acceso.ts`, `cargarCalendario`, motor de horas hábiles de `shared`, `registrarHorasDesdeMensaje`, `insertarMensaje`, `OtSalida.horas`, `costo_interno`, `bolsa.usadas_mes`, fábricas, `ingresarComo` directo, BD de test por bloque, limpieza por `DELETE` selectivo) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, `type` explícito en `@Column`, SQL a mano en migraciones, servicios como único punto de escritura, un módulo escribe en tablas de otro solo a través del servicio de ese módulo con el mismo `tx`, `logger` sin contenido (ni descripciones de filas: solo ids), procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: la tabla `registro_horas` existente gana `tarea_id` (ADR 0025, consecuencias), la regla "Sin ticket" (ambos destinos nulos con `descripcion` obligatoria) y un índice único para la fila manual de cada celda; módulo `modulos/horas/` con la **planilla semanal por persona** (`GET /api/horas`: filas ticket / OT (opcionalmente por tarea) / "Sin ticket", columnas lunes a domingo, totales por fila, por día **frente a la jornada del departamento** de esa persona —horario y feriados con el motor de ADR 0005— y por semana; separación **facturables** (OT facturables) / **internas** / **fuera de horario**) y las mutaciones de filas (`POST`, `PATCH`, `DELETE /api/horas/:id`) con marca manual "fuera de horario" por celda (B4); las filas creadas desde el redactor de seguimiento (B5, ADR 0021.10) aparecen en la planilla, se **corrigen** desde ella (fecha, horas, fuera de horario) y mantienen `mensaje.horas` sincronizado; sin bloqueo de mes (B3); una OT cerrada o cancelada no recibe horas (ADR 0024.2) tampoco desde la planilla; **Coordinación y Administración ven la planilla de cualquier persona** (permiso nuevo `horas.ver_todas`, solo lectura); `TareaSalida.horas_registradas` (las horas de una OT "se suman a sus tareas", spec §4.8) y desvinculación de `tarea_id` cuando una tarea se mueve a otra OT; `ContratoBolsaSalida.horas_usadas_mes` calculado (ADR 0023.18); el costo interno y `bolsa.usadas_mes` ya leen `registro_horas` y no cambian; pantalla **13 Horas** (`/horas`, mobile-first) con selector de semana, selector de persona para quien puede ver a otros, "Agregar fila" (ticket, OT con tarea opcional, Sin ticket), celdas editables, detalle de celda con las filas que la componen, resumen semanal; horas registradas por tarea en la OT y horas usadas de la bolsa en la ficha de cliente; semillas (planilla del diseño para Sebastián Díaz en la semana actual); manuales, CHANGELOG, ADR 0026; revisión de seguridad de cierre (PLAN §1).

**No entra**: exportación de horas a `.xlsx` ni "informe de facturación" (Fase 6: pantalla 10 y exportación; Fase 7: reportes "horas por semana", "% horas facturables", carga vs capacidad); botón "Cerrar mes" o bloqueo de edición por período (B3: sin bloqueo en v1); alertas de bolsa (ADR 0015); detección automática de "fuera de horario" con `esHoraExtendida` (las filas no tienen hora de inicio: ADR 0005, consecuencias; la marca es manual, B4); tarifa extendida en el cálculo del costo interno (ADR 0007 lo define como horas × tarifa de costo interno, sin distinguir); selector de fecha en el redactor de seguimiento (ADR 0021.10: la fecha se corrige en la planilla); edición de horas de otra persona (la spec dice **ver**: §15.3); horas en tareas de ticket (solo las tareas de OT tienen horas, spec §4.4); avisos y despachador (Fase 6); `origen: 'registradas'` en "Importar horas" del cotizador (condicional a §15.10); Playwright; CD.

## 1. Bloques y paralelismo

| Bloque | Contenido | Depende de | Archivos que toca (exclusivos) |
|---|---|---|---|
| **5A** Contratos y BD | `shared` (`esquemas/horas.ts`, `permisos.ts`, `horas-habiles/jornada.ts` con tests de tabla, cambios en `esquemas/{tarea,cliente}.ts`, `errores.ts`), migración 12, entidad `RegistroHoras`, fábricas | — | `packages/shared/src/**`, `apps/api/src/database/**` (salvo semillas), `apps/api/src/modulos/horas/registro-horas.entity.ts`, `apps/api/test/fabricas.ts`, `apps/api/src/database/fabricas-fase5.test.ts` |
| **5B** API horas e integraciones | `modulos/horas/**` (servicio, consulta, rutas), `mensajes/mensajes.acceso.ts` (nuevo), `tareas/tareas.service.ts` (`horas_registradas`), `ots/ots.cierre.service.ts` o donde viva `moverTareasAbiertas` (desvincular), `clientes/clientes.service.ts` (`horas_usadas_mes`), `app.ts` | 5A | `apps/api/src/modulos/horas/**` (salvo entity), `apps/api/src/modulos/mensajes/mensajes.acceso.ts`, `apps/api/src/modulos/tareas/**`, `apps/api/src/modulos/ots/**`, `apps/api/src/modulos/clientes/**`, `apps/api/src/app.ts` |
| **5C** Web planilla | `features/horas/**`, `router.tsx` (sin cambio de ruta: `/horas` ya existe), `lib/formato` si hace falta `formatearHoras` | 5B (API); componentes puros contra los esquemas de 5A | `apps/web/src/features/horas/**`, `apps/web/src/lib/**` |
| **5D** Web integraciones | tareas de OT con "registradas", ficha de cliente con horas usadas, fila nueva en la matriz de permisos de Configuración | 5B (API) | `apps/web/src/components/dominio/ListaTareas.tsx`, `apps/web/src/features/ots/**`, `apps/web/src/features/clientes/**`, `apps/web/src/features/configuracion/**` |
| **5E** Semillas y docs | `semillas/desarrollo-horas.ts`, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0026 | todo | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md` |

**En paralelo sin conflicto**: 5C con 5D (tras 5B); 5C puede empezar `CeldaHoras`, `ResumenSemana`, `SelectorSemana` y el cálculo de totales contra los esquemas de 5A. 5A va primero. Orden general en §16.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en las Fases 2–4: `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 5A usa `zydesk_test` (sin variable); 5B `5b`; 5E `5e`. 5C y 5D no usan BD. CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas (obligatorio)

Se mantiene el de las Fases 3 y 4: **ticket → OT → cotización → tarea/mensaje**. Una mutación de `registro_horas` con `ticket_id` bloquea el ticket (`bloquearTicket`); con `ot_id` bloquea **solo la OT** (`bloquearOt`, igual que tareas y mensajes de OT: `CLAUDE.md` §2) y comprueba `final` **después** del `FOR UPDATE` (ADR 0024.2); "Sin ticket" no bloquea nada. Mover una fila de un destino a otro no existe (§5.3): una fila nace y muere con su destino. La fila `registro_horas` se bloquea (`SELECT … FOR UPDATE`) después del destino.

## 2. Versiones nuevas

Ninguna. Sin paquetes nuevos en `api`, `web` ni `shared`; sin componentes shadcn nuevos (la planilla usa `table`, `input`, `select`, `switch`, `popover`, `dialog`, `alert-dialog`, `tooltip`, `sheet` existentes; la búsqueda de ticket/OT reutiliza el combobox ya generado). Si al implementar hace falta otro paquete, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 5A)

### 3.1 Migración `1791000000012-horas` (SQL a mano; `down` inverso; no inserta datos)

```sql
ALTER TABLE registro_horas
  ADD COLUMN tarea_id integer NULL REFERENCES tarea(id) ON DELETE SET NULL,
  -- una tarea solo con su OT (las tareas de ticket no tienen horas, spec §4.4); que la tarea sea de ESA OT lo valida el servicio
  ADD CONSTRAINT registro_horas_tarea_chk CHECK (tarea_id IS NULL OR ot_id IS NOT NULL),
  -- "Sin ticket" exige descripción
  ADD CONSTRAINT registro_horas_sin_ticket_chk CHECK (ticket_id IS NOT NULL OR ot_id IS NOT NULL OR descripcion IS NOT NULL);
CREATE INDEX registro_horas_tarea_idx ON registro_horas (tarea_id);
-- Una sola fila MANUAL (sin mensaje) por celda: persona + día + destino (+ tarea) (+ descripción en "Sin ticket").
CREATE UNIQUE INDEX registro_horas_celda_manual_uq
  ON registro_horas (usuario_id, fecha, COALESCE(ticket_id, 0), COALESCE(ot_id, 0), COALESCE(tarea_id, 0), COALESCE(descripcion, ''))
  WHERE mensaje_id IS NULL;
```

Se conservan tal cual: `horas numeric(5,2) CHECK (horas > 0 AND horas <= 24)`, `registro_horas_destino_chk CHECK (ticket_id IS NULL OR ot_id IS NULL)`, `fuera_de_horario`, `descripcion`, `mensaje_id ON DELETE SET NULL`, los índices por usuario/fecha, ticket y OT. Las filas existentes cumplen los `CHECK` nuevos (todas tienen ticket u OT). `down`: elimina el índice único, el índice de tarea, los dos `CHECK` y la columna. `evento`, `auditoria` y `mensaje` no cambian de esquema. La entidad `RegistroHoras` gana `tarea_id: number | null` (`type: 'integer', nullable: true`); el comentario "Fase 5 permite ambos NULL" se cumple ahora.

### 3.2 `packages/shared`

```ts
// permisos.ts
export const PERMISOS = [...los 6 actuales, 'horas.ver_todas'] as const
PERMISOS_POR_ROL.admin  = [...PERMISOS];  coordinacion gana 'horas.ver_todas'; tecnico y lectura no (decisión §14.2; pregunta §15.2)
MATRIZ_VISIBLE gana la fila 10: { etiqueta: 'Ver horas de todo el equipo', permiso: 'horas.ver_todas' }

// horas-habiles/jornada.ts (puro; se exporta desde horas-habiles/index.ts)
export function horasJornada(fecha: string /* AAAA-MM-DD */, cal: Calendario): number
  // 0 si el día está inactivo o es feriado; si no, Σ duración de los dos bloques del día en horas, redondeado a 2 decimales
  // (reutiliza bloquesDelDia de calendario.ts: la misma definición de jornada que usan los plazos)
export function lunesDe(fecha: string): string            // AAAA-MM-DD del lunes de la semana ISO de `fecha` (aritmética de calendario sobre la fecha, sin zona)
export function diasDeSemana(lunes: string): string[]     // 7 fechas AAAA-MM-DD, lunes a domingo

// esquemas/horas.ts
const horas = z.number().min(0.25).max(24).multipleOf(0.25)          // mismo rango que MensajeEntrada.horas
export const RegistroHorasEntrada = z.object({
  fecha: fechaIso,
  ticket_id: id.nullable().default(null),
  ot_id: id.nullable().default(null),
  tarea_id: id.nullable().default(null),
  descripcion: texto(200).nullable().default(null),                  // obligatoria en "Sin ticket"; ignorada (se guarda null) con ticket u OT
  horas,
  fuera_de_horario: z.boolean().default(false),
})
  .refine(v => v.ticket_id === null || v.ot_id === null, { path: ['ot_id'], message: 'Indica un ticket o una OT, no ambos' })
  .refine(v => v.tarea_id === null || v.ot_id !== null, { path: ['tarea_id'], message: 'La tarea requiere una OT' })
  .refine(v => v.ticket_id !== null || v.ot_id !== null || v.descripcion !== null, { path: ['descripcion'], message: 'Describe el trabajo sin ticket' })
// Objeto explícito con todo opcional (ADR 0023.19: sin .partial()). No admite cambiar ticket_id / ot_id (una fila no cambia de destino).
export const RegistroHorasEditar = z.object({
  fecha: fechaIso.optional(),
  tarea_id: id.nullable().optional(),
  descripcion: texto(200).nullable().optional(),                     // solo tiene efecto en "Sin ticket"
  horas: horas.optional(),
  fuera_de_horario: z.boolean().optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'Nada que cambiar' })
export const HorasQuery = z.object({
  usuario_id: idQuery.optional(),                                    // sin él: la persona de la sesión
  semana: fechaIso.optional(),                                       // cualquier día; la API normaliza al lunes. Sin él: la semana de hoy (Santiago)
})
export const RegistroHorasSalida = z.object({
  id, usuario_id: id, fecha: fechaIso, ticket_id: id.nullable(), ot_id: id.nullable(), tarea_id: id.nullable(),
  mensaje_id: id.nullable(), descripcion: z.string().nullable(), horas: z.number(), fuera_de_horario: z.boolean(),
  creado_en: instante, actualizado_en: instante,
})
export const DestinoFila = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('ticket'), id, codigo: z.string(), titulo: z.string() /* asunto */, cliente: ClienteBreve.nullable(), cerrado: z.boolean() }),
  z.object({ tipo: z.literal('ot'), id, codigo: z.string(), titulo: z.string(), tipo_ot: z.enum(TIPOS_OT), etapa: z.enum(ETAPAS_OT), cliente: ClienteBreve.nullable(), final: z.boolean() }),
  z.object({ tipo: z.literal('sin_ticket'), descripcion: z.string() }),
])
export const CeldaHoras = z.object({
  fecha: fechaIso,
  total: z.number(),                                                 // Σ registros
  fuera_de_horario: z.boolean(),                                     // alguno de los registros lo tiene
  registros: z.array(RegistroHorasSalida.extend({ mensaje: z.object({ id, tipo: z.enum(TIPOS_MENSAJE) }).nullable() })),
})
export const FilaHoras = z.object({
  clave: z.string(),                                                 // 'ticket:12' | 'ot:7' | 'ot:7:tarea:31' | 'sin_ticket:<descripcion>'
  destino: DestinoFila,
  tarea: z.object({ id, titulo: z.string(), hecha: z.boolean() }).nullable(),
  facturable: z.boolean(),                                           // destino.tipo === 'ot' && tipo_ot === 'facturable'
  celdas: z.array(CeldaHoras).length(7),
  total: z.number(),
})
export const DiaPlanilla = z.object({
  fecha: fechaIso, dia_semana: z.number().int().min(0).max(6),
  jornada: z.number().nullable(),                                    // horasJornada; null si la persona no tiene departamento
  feriado: z.string().nullable(),                                    // nombre del feriado (general o del departamento) o null
  hoy: z.boolean(), futuro: z.boolean(),
  total: z.number(),                                                 // Σ de la columna
})
export const PlanillaSemanal = z.object({
  usuario: UsuarioBreve.extend({ departamento: referencia.nullable(), activo: z.boolean() }),
  semana: z.object({ desde: fechaIso /* lunes */, hasta: fechaIso /* domingo */, anterior: fechaIso, siguiente: fechaIso, actual: z.boolean() }),
  dias: z.array(DiaPlanilla).length(7),
  filas: z.array(FilaHoras),
  totales: z.object({ semana: z.number(), facturables: z.number(), internas: z.number(), fuera_de_horario: z.number(), jornada_semanal: z.number().nullable() /* Σ dias.jornada */ }),
  editable: z.boolean(),                                             // la planilla es de la sesión y tiene tickets.editar
})

// esquemas/tarea.ts (cambio)
TareaSalida.horas_registradas: z.number()                            // Σ registro_horas.horas con tarea_id = tarea.id (0 en tareas de ticket)

// esquemas/cliente.ts (cambio)
ContratoBolsaSalida.horas_usadas_mes: z.number().nullable()          // deja de ser z.null(): número en el contrato vigente, null en el historial
```

Códigos nuevos en `shared/errores.ts`: ninguno. Se reutilizan `VALIDACION` (400), `SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409, celda manual duplicada: §5.2), `OT_CERRADA` (409, ADR 0024.2). `shared/eventos.ts` no cambia (la planilla no publica eventos de dominio: §14.6).

Tests `jornada.test.ts` (**tabla**, `it.each`, con el horario de Soporte TI de las semillas: L–J 08:30–18:00 con colación 13:00/60, V 08:30–16:30, S–D inactivos; feriado `2026-10-12`):

| Caso | Entrada | Esperado |
|---|---|---|
| Día normal | `2026-09-28` (lunes) | `8.5` |
| Viernes corto | `2026-10-02` | `7` |
| Sábado inactivo | `2026-10-03` | `0` |
| Feriado | `2026-10-12` (lunes) | `0` |
| Sin colación | horario con `colacion_min: 0`, 09:00–17:00 | `8` |
| `lunesDe` | `2026-10-01` (jueves) → `2026-09-28`; `2026-09-28` → sí mismo; `2026-10-04` (domingo) → `2026-09-28` |
| `diasDeSemana` | `2026-09-28` → 7 fechas, la última `2026-10-04` |
| Cruce de año | `lunesDe('2027-01-01')` → `2026-12-28` |

Tests `esquemas.test.ts`: `RegistroHorasEntrada` rechaza ticket y OT a la vez, tarea sin OT, "Sin ticket" sin descripción, `horas` 0 / 0,1 / 24,25 / 25; acepta `{ fecha, ot_id, tarea_id, horas: 1.5 }` y `{ fecha, descripcion: 'Reunión', horas: 1 }`; `RegistroHorasEditar` rechaza `{}` y `{ ot_id: 3 }` (clave desconocida se descarta → objeto vacío → rechazado); `HorasQuery` acepta `semana=2026-10-01`; `tienePermiso('coordinacion', 'horas.ver_todas')` es `true` y `tecnico`/`lectura` `false`; `MATRIZ_VISIBLE` tiene 10 filas.

### 3.3 Fábricas (`test/fabricas.ts`)

- `crearRegistroHoras(usuario_id, { fecha?, ticket_id?, ot_id?, tarea_id?, mensaje_id?, descripcion?, horas?, fuera_de_horario? })`: inserta directo; `fecha` por defecto hoy (Santiago); `horas` 1; sin destino exige `descripcion` (si falta, pone `'Sin ticket de prueba'`).
- `crearDepartamento` gana `horario?: HorarioDia[]` opcional (hoy inserta el horario por defecto; se conserva) para probar jornadas distintas.
- Test `fabricas-fase5.test.ts`: dos filas manuales iguales en la misma celda violan `registro_horas_celda_manual_uq`; dos filas con `mensaje_id` distinto en la misma celda **se aceptan**; `tarea_id` sin `ot_id` viola `registro_horas_tarea_chk`; sin destino ni descripción viola `registro_horas_sin_ticket_chk`.

## 4. Reglas de la planilla (vale para API y web)

1. **Celda** = persona + fecha + destino (+ tarea en OT) (+ descripción en "Sin ticket"). Una celda contiene **a lo sumo una fila manual** (`mensaje_id IS NULL`) y **cero o más filas de seguimiento** (`mensaje_id` no nulo, creadas por `registrarHorasDesdeMensaje`). El valor visible de la celda es la **suma**.
2. **Fila de la planilla** = celda extendida a los 7 días. Existe si algún día de la semana tiene registros. Una fila que la persona agrega en la pantalla sin horas todavía es estado del navegador, no se persiste.
3. **Facturable** = destino OT con `tipo = 'facturable'`. **Interna** = todo lo demás (ticket, OT interna, Sin ticket). **Fuera de horario** = Σ `horas` con `fuera_de_horario = true` (se cuentan además dentro de facturables/internas: es un corte transversal, como en el diseño).
4. **Jornada** del día = `horasJornada(fecha, cargarCalendario(departamento de la persona, años de la semana))`; sin departamento → `null` ("Sin jornada para comparar"). La comparación es **solo visual** (B3: sin bloqueos): día con `total > jornada` → `urgente`; día pasado o hoy con `total < jornada` → `alta`; nada impide guardar.
5. **Fechas futuras** (posteriores a hoy en Santiago) no se registran ni se editan hacia ellas: 400 `VALIDACION { fecha: ['No se registran horas a futuro'] }`; en la web las columnas futuras quedan deshabilitadas (el diseño las atenúa). Decisión §14.5, pregunta §15.5.
6. **OT final** (`cerrada`/`cancelada`): ninguna mutación con `ot_id` (crear, editar horas o fecha, borrar): 409 `OT_CERRADA { horas: ['No se registran horas en una OT cerrada'] }` (ADR 0024.2, mismo texto que el redactor). Un **ticket cerrado** sí admite horas (ADR 0021.5 admite mensajes en tickets cerrados; nada en la spec los excluye).
7. **Tarea**: `tarea_id` debe ser una tarea **de esa OT** (hecha o no): 400 `VALIDACION { tarea_id: ['La tarea no pertenece a la OT'] }`. Las horas por tarea se exponen como `TareaSalida.horas_registradas`; **no** escriben `tarea.horas_reales` (decisión §14.1, pregunta §15.1).
8. **Sincronía con el mensaje**: editar `horas` de una fila con `mensaje_id` actualiza `mensaje.horas` al mismo valor; borrarla deja `mensaje.horas = NULL`; cambiar `fecha` o `fuera_de_horario` **no** toca el mensaje (no tiene esos campos). El texto del mensaje nunca cambia. Decisión §14.4, pregunta §15.4.
9. **Permisos**: la planilla propia se lee con sesión y se escribe con `tickets.editar` (B10: Solo lectura no registra horas); la de otra persona se lee con `horas.ver_todas` y **no se escribe** (403 `SIN_PERMISO` aunque se tenga el permiso de ver). Decisiones §14.2–14.3.
10. **Sin `evento`, sin `auditoria`, sin `actualizado_en` del destino**: `registro_horas` es el registro (como el `mensaje` lo es para las horas del redactor, tabla de `CLAUDE.md` §2). Decisión §14.6.

## 5. API de horas (bloque 5B, `modulos/horas/`)

### 5.1 Endpoints

| Método y ruta | Permiso | Entrada | Salida | Errores / notas |
|---|---|---|---|---|
| `GET /api/horas` | sesion | `HorasQuery` | `PlanillaSemanal` | `usuario_id` ≠ sesión sin `horas.ver_todas` → 403 `SIN_PERMISO`; usuario inexistente → 404; §5.4 |
| `POST /api/horas` | tickets.editar | `RegistroHorasEntrada` | 201 `RegistroHorasSalida` | fila manual de la sesión; §5.2; celda manual ya existe → 409 `CONFLICTO { registro_id }` |
| `PATCH /api/horas/:id` | tickets.editar | `RegistroHorasEditar` | `RegistroHorasSalida` | solo filas propias (si no, 403); §5.3 |
| `DELETE /api/horas/:id` | tickets.editar | — | 204 | solo filas propias; §5.3 |

Todas las mutaciones: `enTransaccion`; bloqueo según §1.2; `usuario_id` **siempre** el de la sesión (no se acepta en el cuerpo: Zod descarta claves desconocidas; test §10.3). La planilla no tiene "guardar": cada celda se persiste al salir del campo (§11.4), por eso las mutaciones son por fila.

### 5.2 Crear (`crearRegistro(actor, e)`)

1. Normalizar: con `ticket_id` u `ot_id`, `descripcion = null`; con "Sin ticket", `descripcion` recortada (`trim`).
2. `fecha > hoy (Santiago)` → 400 (§4.5).
3. Destino: `ticket_id` → `bloquearTicket(tx, id)` (404 → 400 `VALIDACION { ticket_id: ['Ticket no encontrado'] }`); `ot_id` → `bloquearOt(tx, id)` (idem con `ot_id`), `final` → 409 `OT_CERRADA` (§4.6); `tarea_id` → `SELECT 1 FROM tarea WHERE id = $1 AND ot_id = $2` o 400 (§4.7).
4. `INSERT` con `usuario_id = actor.id`, `mensaje_id = NULL`. Violación de `registro_horas_celda_manual_uq` (`23505`) → 409 `CONFLICTO { registro_id }` ("Ya hay horas en esa celda: edítalas") con el id de la fila existente (`SELECT` tras el error, fuera de la transacción fallida; o comprobar antes del `INSERT` dentro del `FOR UPDATE` del destino: **se comprueba antes** y se deja el índice como red).
5. Devuelve la fila. `logger.debug` solo con `{ registro_id, usuario_id, ticket_id, ot_id, tarea_id }` (nunca `descripcion`).

### 5.3 Editar y eliminar (`editarRegistro(actor, id, e)`, `eliminarRegistro(actor, id)`)

1. `SELECT … FROM registro_horas WHERE id = $1` (sin bloquear aún); no existe → 404; `usuario_id !== actor.id` → 403 `SIN_PERMISO` (§4.9).
2. Bloquear el destino actual (ticket u OT, §1.2); OT `final` → 409 `OT_CERRADA` **en cualquier edición o borrado** (ADR 0024.2: ni sumar ni restar horas de una OT cerrada; test §10.6). Luego `SELECT … FOR UPDATE` de la fila.
3. Editar: `fecha` futura → 400; `tarea_id` de otra OT → 400; `tarea_id` en fila de ticket o "Sin ticket" → 400 `VALIDACION { tarea_id }`; `descripcion` solo cambia en "Sin ticket" (en ticket/OT se ignora). Si cambian `fecha`, `tarea_id` o `descripcion` y la fila es manual, puede chocar con otra fila manual de la celda destino → 409 `CONFLICTO { registro_id }`. `UPDATE … SET …, actualizado_en = now()`. Si la fila tiene `mensaje_id` y cambia `horas` → `fijarHorasDeMensaje(tx, mensaje_id, horas)` (§5.5).
4. Eliminar: `DELETE`; si tenía `mensaje_id` → `fijarHorasDeMensaje(tx, mensaje_id, null)`.

### 5.4 Consulta (`horas.consulta.ts`, `cargarPlanilla(m, usuario_id, lunes)`)

- `usuario` con `departamento_id`; `dias = diasDeSemana(lunes)`; `cal = departamento_id ? cargarCalendario(m, departamento_id, años distintos de los 7 días) : null`; `jornada = cal ? horasJornada(fecha, cal) : null`; `feriado` = nombre desde `feriado` (general o del departamento) para esa fecha; `hoy`, `futuro` con la fecha de Santiago.
- Registros: una consulta `SELECT rh.*, m.tipo AS mensaje_tipo, t.codigo, t.asunto, t.estado, o.codigo, o.titulo, o.tipo, o.etapa, ta.titulo, ta.hecha, cliente…` con `LEFT JOIN` por `ticket`, `ot`, `tarea`, `mensaje`, `cliente`, `WHERE rh.usuario_id = $1 AND rh.fecha BETWEEN $2 AND $3 ORDER BY rh.fecha, rh.id`. Se agrupan en memoria por `clave` (§3.2) y luego por fecha; celdas sin registros van con `total 0` y `registros []` (siempre 7 por fila).
- Orden de filas: OT (por `codigo` descendente), tickets (por `codigo` descendente), "Sin ticket" (por `descripcion`). Dentro de una OT, la fila sin tarea antes que las filas por tarea (por `tarea.orden`).
- `totales`: `semana` = Σ; `facturables` = Σ filas `facturable`; `internas = semana − facturables`; `fuera_de_horario` = Σ registros marcados; `jornada_semanal` = Σ `dias.jornada` (o `null`).
- `editable = usuario_id === actor.id && actor.permisos.includes('tickets.editar')`.
- `semana.actual` = el lunes coincide con `lunesDe(hoy)`.

### 5.5 Escritura en tablas de otros módulos

- **Mensajes**: `mensajes/mensajes.acceso.ts` (nuevo, sin dependencias hacia `horas`) exporta `fijarHorasDeMensaje(tx, mensaje_id, horas: number | null)` → `UPDATE mensaje SET horas = $2 WHERE id = $1`. `horas.service.ts` lo importa; `mensajes.service.ts` sigue importando `registrarHorasDesdeMensaje` de `horas.service.ts`. Sin ciclo: `horas.service → mensajes.acceso`; `mensajes.service → horas.service` (misma técnica que `ots.acceso.ts`, ADR 0025.20).
- **Tareas**: `tareas.service.ts` agrega a sus consultas de salida `COALESCE((SELECT sum(rh.horas) FROM registro_horas rh WHERE rh.tarea_id = t.id), 0)::float8 AS horas_registradas` (lee `registro_horas`, permitido). Al **mover tareas abiertas** a otra OT (`moverTareasAbiertas`, cierre con `nueva_ot`), las filas de `registro_horas` con esas tareas pierden `tarea_id` pero conservan `ot_id` (las horas se trabajaron en la OT original): `horas.service.ts` exporta `desvincularTareas(tx, tarea_ids)` → `UPDATE registro_horas SET tarea_id = NULL, actualizado_en = now() WHERE tarea_id = ANY($1)`, y el módulo que mueve las tareas la llama con el mismo `tx`. Test en `cierre.test.ts` o `tareas.test.ts`.
- **Clientes**: `clientes.service.ts` reemplaza `horas_usadas_mes: null` por la misma consulta de `ots.consulta.ts` (Σ `registro_horas.horas` de OT con `contrato_id` del contrato vigente en el mes calendario actual, Santiago); los contratos del historial siguen `null`. Se extrae la consulta a una función `usadasMesDeContrato(m, contrato_id)` en `clientes` (donde vive `contrato_bolsa`) y `ots.consulta.ts` la importa (lectura, permitido).

### 5.6 Rutas

`horas.routes.ts` declara las cuatro rutas con `ruta()` (etiqueta `Horas`); `app.ts` monta `crearRutasHoras()` tras `crearRutasTareas()`. `npm run api:openapi` y versionar `docs/api/openapi.json`.

## 6. Eventos y auditoría generados en esta fase

| Acción | `evento` | `auditoria` | evento de dominio |
|---|---|---|---|
| Crear, editar o borrar una fila de horas desde la planilla | — (`registro_horas` es el registro; §14.6) | — | — |
| Editar horas de una fila nacida de un seguimiento | — (`mensaje.horas` se sincroniza, el mensaje sigue siendo el registro) | — | — |
| Mover tareas abiertas a otra OT (ya existente) | `tareas_traspasadas` (sin cambios) | — | — |

Cobertura (ADR 0003): `horas/eventos.test.ts` afirma que `POST`, `PATCH`, `DELETE` y `GET /api/horas` **no** crean filas en `evento` ni `auditoria` (`count(*)` igual antes y después). Es la primera fase sin eventos nuevos; la fila "Planilla de horas" se agrega a la tabla de `CLAUDE.md` §2 con `—` / `—`.

## 7. Pruebas de seguridad obligatorias (`horas/seguridad.test.ts`, bloque 5B)

1. Test genérico de permisos (Fase 1) verde con las rutas nuevas: sin sesión → 401 en las cuatro.
2. **Roles**: `lectura` → 200 en `GET /api/horas` (planilla propia vacía, `editable: false`), **403** en `POST`/`PATCH`/`DELETE` y **403** en `GET /api/horas?usuario_id=<otro>`. `tecnico` → 201/200/204 en las mutaciones propias, **403** en `GET ?usuario_id=<otro>`. `coordinacion` → 200 en `GET ?usuario_id=<técnico>` con `editable: false`; **403** al hacer `PATCH`/`DELETE` sobre una fila del técnico y al `POST` (el `POST` siempre registra para la sesión: no hay forma de registrar para otro). `admin` → igual que coordinación (ver sí, escribir ajeno no).
3. **`usuario_id` manipulado**: `POST` con `usuario_id: <otro>` en el cuerpo → 201 con `usuario_id` de la sesión (Zod descarta la clave); `PATCH` con `usuario_id` → sin efecto.
4. **IDOR**: `PATCH`/`DELETE /api/horas/:id` de otra persona → 403 `SIN_PERMISO` y la fila no cambia; id inexistente → 404.
5. **Destinos**: `ticket_id` inexistente → 400 `VALIDACION { ticket_id }`; `ot_id` inexistente → 400; `ticket_id` y `ot_id` → 400 (Zod); `tarea_id` de otra OT → 400 `VALIDACION { tarea_id }`; `tarea_id` con `ticket_id` → 400 (Zod); "Sin ticket" sin `descripcion` → 400; `descripcion` con ticket → se guarda `null`.
6. **OT final** (ADR 0024.2): `POST` con `ot_id` de una OT `cerrada` o `cancelada` → 409 `OT_CERRADA` con `detalles.horas` y `count(*)` sin cambio; `PATCH { horas }`, `PATCH { fecha }` y `DELETE` sobre una fila cuya OT se cerró después → 409 y nada cambia (ni `mensaje.horas`); un ticket `resuelto` → 201.
7. **Rangos**: `horas` 0 / 0,1 / 24,25 → 400; 24 → 201; 0,25 → 201; `fecha` mañana (Santiago) → 400 `VALIDACION { fecha }`; `fecha` hoy → 201; `descripcion` de 201 caracteres → 400.
8. **Celda manual única**: segundo `POST` en la misma celda → 409 `CONFLICTO` con `detalles.registro_id` = id de la primera; mismo destino con `tarea_id` distinto → 201 (otra celda); mismo "Sin ticket" con otra `descripcion` → 201; `PATCH { fecha }` que choca con otra fila manual → 409.
9. **Sincronía con el mensaje**: fila creada por `POST /api/ots/:id/mensajes` con `horas: 3` → `PATCH /api/horas/:id { horas: 2.5 }` deja `mensaje.horas = 2.5`; `DELETE` deja `mensaje.horas = NULL` y el mensaje sigue existiendo con su texto; `PATCH { fecha: ayer }` no toca `mensaje`; en la planilla la celda muestra `registros[0].mensaje = { id, tipo: 'seguimiento' }`.
10. **Suma y clasificación**: técnico con OT facturable (2 + 1,5 h, una `fuera_de_horario`), OT interna (1 h), ticket (0,5 h) y "Sin ticket" (1 h) en la semana → `totales = { semana: 6, facturables: 3.5, internas: 2.5, fuera_de_horario: 1.5 }`; la fila de la OT facturable tiene `facturable: true`; `dias[i].total` cuadra con las celdas.
11. **Jornada**: persona de un departamento L–J 08:30–18:00 (colación 60), V 08:30–16:30, S–D inactivos → `dias.jornada = [8.5, 8.5, 8.5, 8.5, 7, 0, 0]`, `jornada_semanal = 41`; con un feriado el jueves (`crearFeriado` o `INSERT`) → `dias[3] = { jornada: 0, feriado: 'Nombre' }` y `jornada_semanal = 32.5`; persona sin departamento → `jornada: null` y `jornada_semanal: null`.
12. **Semana**: `?semana=2026-10-01` → `desde = 2026-09-28`, `hasta = 2026-10-04`, `anterior = 2026-09-21`, `siguiente = 2026-10-05`; sin `semana` → la de hoy con `actual: true`; una fila con fecha fuera de la semana no aparece.
13. **Integraciones**: tras 3 h registradas con `tarea_id`, `GET /api/ots/:id` muestra `tareas[].horas_registradas = 3` y `horas.registradas` incluye esas 3; una tarea de ticket devuelve `horas_registradas: 0`; cerrar la OT con `nueva_ot` mueve la tarea abierta y deja la fila con `tarea_id = NULL` y el mismo `ot_id`; OT facturable con `contrato_id` → `GET /api/clientes/:id` muestra `bolsa.vigente.horas_usadas_mes` igual a `GET /api/ots/:id` `bolsa.usadas_mes`; OT interna con tarifa de costo interno → `costo_interno.horas` incluye las horas de la planilla.
14. **Usuario desactivado**: `GET ?usuario_id=<inactivo>` con `horas.ver_todas` → 200 (`usuario.activo: false`, historial visible); el inactivo no puede ingresar (ya cubierto en Fase 1).
15. **Texto**: `descripcion` `'<img src=x onerror=alert(1)>'` se guarda y devuelve literal; `GET /api/horas` la devuelve en `destino.descripcion` tal cual (la web la renderiza como texto).
16. **Logs**: `POST`, `PATCH` y `DELETE` no dejan en el logger de test la `descripcion` ni `horas` (solo ids).
17. `X-Request-Id` presente en 403 y 409.

## 8. Web planilla (bloque 5C, `features/horas/`)

### 8.1 API del front (`features/horas/api.ts`)

`planilla(query: { usuario_id?, semana? })`, `crearRegistro(entrada)`, `editarRegistro(id, cambios)`, `eliminarRegistro(id)`. Claves: `['horas', usuario_id ?? 'yo', lunes]`. Tras cada mutación se invalida la planilla de esa clave y, si la fila es de OT, `invalidarOt(queryClient, otId, ticketId)` (las horas registradas y el costo interno cambian). Reutiliza `tickets(query)` y `ots(query)` de `features/tickets/api.ts` y `features/ots/api.ts` para la búsqueda de "Agregar fila" (`q`, `por_pagina: 10`).

### 8.2 Formato

`lib/formato.ts` gana `formatearHoras(n: number): string` → `Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })` seguido de ` h` (`3,5 h`, `0 h`), y `horasCorto(n)` sin sufijo para las celdas (`3,5`; vacío si 0). Las celdas aceptan coma o punto como separador decimal al escribir y normalizan al salir del campo (`'2,5'` → `2.5`); el valor se valida con el mismo criterio del `Redactor` (múltiplo de 0,25 entre 0,25 y 24; vacío = borrar).

### 8.3 Rutas y estado

`/horas` ya existe en `router.tsx` y `menu.ts` ("Horas", grupo Trabajo). Estado en la URL: `?semana=AAAA-MM-DD&usuario=<id>` (ADR 0011); sin `usuario` → la propia. `TituloPagina` "Horas · semana del 28 sep". `usePermiso('horas.ver_todas')` muestra el selector de persona; `usePermiso('tickets.editar')` habilita la edición solo cuando la planilla es la propia (`planilla.editable`).

### 8.4 Pantalla 13 — Horas (`features/horas/pages/HorasPage.tsx`)

Diseño "Registro de horas". Mobile-first: a ≥ 1024 px la **cuadrícula completa** (columna de fila 320 px + 7 columnas de día + total); entre 768 y 1024 px la cuadrícula con scroll horizontal y la primera columna fija (como `/ots`); bajo 768 px **vista por día**: chips L · M · X · J · V · S · D (con el total del día bajo cada letra) seleccionan un día y la planilla se muestra como lista de tarjetas (una por fila) con el campo de horas, la marca "Fuera de horario" y el total del día frente a la jornada fijo al pie (`sticky bottom-0`).

1. **Encabezado**: `SelectorSemana` ("‹ Semana anterior", "Semana del 28 sep al 4 oct 2026", "Siguiente ›", botón "Hoy" si no es la actual; el botón "Siguiente" se deshabilita cuando la semana siguiente empieza después de hoy); `SelectorPersona` (solo con `horas.ver_todas`: `Select` con los usuarios activos de `GET /api/usuarios`, la propia primero; al elegir a otro aparece el aviso "Estás viendo la planilla de Camila Rojas · solo lectura"). Si la persona no tiene departamento: aviso "Sin departamento: no hay jornada para comparar".
2. **Cuadrícula** (`Planilla`): cabecera con "Lun 28" y debajo la jornada en `tinta-3` (`8,5 h`; `Feriado` con el nombre en tooltip; `—` sin jornada); la columna de hoy en `acento`; columnas futuras atenuadas y deshabilitadas. Cada **fila** (`FilaHoras`): `Codigo` (enlace al ticket u OT) + título recortado + `Pill` "Facturable" (acento) / "Interna" (alta, como el diseño) + chip de tarea ("· Diagnóstico") cuando aplica; "Sin ticket" muestra la descripción en cursiva; una OT final o ticket cerrado lleva `PillEtapaOt`/`PillEstado` y sus celdas quedan de solo lectura (OT final) con tooltip "La OT está cerrada: no se registran horas". Celda (`CeldaHoras`): `input` numérico (`inputMode="decimal"`, `aria-label` "OT-0218 · Lun 28", `font-mono`, alineado a la derecha) que al **perder el foco** o con Enter guarda: vacío → `DELETE` de la fila manual; valor en una celda sin fila manual → `POST`; con fila manual → `PATCH`; error → el valor vuelve al anterior, borde `urgente` y toast con el `mensaje` de la API. Si la celda tiene **registros de seguimiento**, en vez del `input` muestra el total como botón (ícono `MessageSquare` pequeño) que abre `DialogoCelda`. Un botón `Moon` (`aria-pressed`, "Fuera de horario") visible al enfocar/hover y siempre cuando está activo alterna `fuera_de_horario` de la fila manual (`PATCH`); con registros de seguimiento, abre `DialogoCelda`.
3. **Total por fila** (`font-mono`), **total por día** al pie con color según §4.4 y texto "8,5 de 8,5 h", y **total semanal**.
4. **Agregar fila** (`DialogoAgregarFila`): pestañas Ticket / OT / Sin ticket; Ticket y OT con búsqueda (`q`) en un combobox que lista código · título · cliente (OT: también tipo y etapa; las finales deshabilitadas con "cerrada"); en OT, `Select` opcional "Tarea" con las tareas de la OT (`GET /api/ots/:id` → `tareas`); Sin ticket: `Input` descripción (máx. 200). "Agregar" crea la fila **en el navegador** (sin horas); desaparece al cambiar de semana si sigue vacía. Si ya existe la misma clave, enfoca la fila existente.
5. **Detalle de celda** (`DialogoCelda`): título "OT-0218 · lunes 28 sep"; lista de registros: cada uno con horas (`input`, `PATCH`), `Switch` "Fuera de horario", origen ("Manual" o "Seguimiento" con enlace al ticket/OT `#mensaje-<id>`) y botón "Quitar" (`AlertDialog` cuando viene de un seguimiento: "El seguimiento se conserva, pero dejará de tener horas"); botón "Agregar horas" si no hay fila manual. Fecha editable (`input type=date`, máx. hoy) para corregir el día de un registro (`PATCH { fecha }`; ADR 0021.10).
6. **Resumen semanal** (`ResumenSemana`, panel derecho a ≥ 1024 px, tarjeta bajo la cuadrícula si no): "Total 15,5 h de 41 h" con barra (`min(100 %, total / jornada_semanal)`), y tres cifras: **Facturables** (acento), **Internas** (alta), **Fuera de horario**; texto "Las horas de OT facturables son las que se cobran" en `tinta-3`.
7. Vacío: `EstadoVacio` "Sin horas esta semana" con botón "Agregar fila" (si `editable`). `Cargando`, `EstadoError`. Solo lectura (`!editable`): sin inputs, celdas como texto; con rol `lectura` el texto "Tu rol no registra horas".

Tests (jsdom): con la planilla del diseño (cinco filas con horas `[3,1]`, `[2,2.5]`, `[1.5,0]`, `[0,0.5]`, `[1,0.5]` en lunes y martes; jornadas 8,5 / 8,5 / 8,5 / 8,5 / 7 / 0 / 0) el resumen muestra **total 12 h, facturables 8,5 h, internas 3,5 h**; el lunes `7,5 de 8,5 h` y el martes `4,5 de 8,5 h` (ambos en `alta` por ser pasados o hoy), un día con 9 h en `urgente`; escribir `2,5` en una celda vacía llama a `crearRegistro` con `horas: 2.5`; borrar una celda llama a `eliminarRegistro`; una celda con un registro de seguimiento no renderiza `input` y abre el diálogo; columnas futuras deshabilitadas; bajo 768 px se renderiza la vista por día (`data-vista="dia"`); sin `horas.ver_todas` no hay selector de persona; con `editable: false` no hay inputs.

## 9. Web integraciones (bloque 5D)

- **`ListaTareas`** (OT): columna "Horas" pasa a mostrar `est. / reales / reg.` con `aria-label` completo ("3 h estimadas, 2 h reales, 3 h registradas"); en tareas de ticket no cambia nada. Test: una tarea con `horas_registradas: 3` muestra `3`.
- **`PanelOt`**: "Horas registradas" gana enlace "Ver en la planilla" → `/horas?semana=<hoy>` (planilla propia; no se puede ir a la de otro sin permiso). Sin cambios en costo interno (ya lee registradas).
- **Ficha de cliente** (`features/clientes`): sección "Bolsa de horas" muestra `horas_usadas_mes` del contrato vigente como "12,5 / 20 h usadas este mes" (rojo si supera, ADR 0015) en lugar del guion actual. Test: con `horas_usadas_mes: 12.5` aparece el texto.
- **Configuración → Equipo y permisos**: la matriz muestra la fila 10 "Ver horas de todo el equipo" (viene de `MATRIZ_VISIBLE`; test de 10 filas).
- **`Redactor`**: sin cambios (ADR 0021.10); la ayuda del campo Horas dice "Se suman a tu planilla de hoy; corrígelas en Horas" (enlace a `/horas`).

## 10. Semillas de desarrollo (bloque 5E, `database/semillas/desarrollo-horas.ts`, llamada desde `desarrollo.ts` tras `sembrarOts`)

Idempotente: antes de insertar borra las filas manuales (`mensaje_id IS NULL`) de los usuarios sembrados en la semana actual y reinserta; las filas que ya crean `desarrollo-tickets.ts` y `desarrollo-ots.ts` desde mensajes **se conservan** y se completan: la fila de 3 h en OT-0218 de Sebastián (mensaje "registró 3 h") recibe `tarea_id` de la primera tarea de OT-0218 (la del diagnóstico) y `fecha` = lunes de la semana actual, para que el diseño cuadre. Planilla de **Sebastián Díaz (`sdiaz`)** en la semana actual (lunes = `lunesDe(hoy)`), con las cifras del diseño en lunes y martes (los días siguientes vacíos):

| Fila | Lun | Mar | Notas |
|---|---|---|---|
| OT-0218 (facturable) · tarea Diagnóstico | 3 (desde el mensaje) | 1 | — |
| OT-0217 (facturable) | 2 | 2,5 | — |
| TK-1026 (ticket resuelto) | 1,5 | — | demuestra horas en ticket cerrado |
| TK-1049 (ticket) | — | 0,5 | con `fuera_de_horario = true` (el diseño muestra 0 h fuera de horario; se desvía en esta fila para que el resumen tenga algo que mostrar) |
| Sin ticket · "Reunión de equipo y coordinación" | 1 | 0,5 | — |

Si hoy es lunes, las cifras del martes no se insertan (fechas futuras prohibidas, §4.5): la semilla comprueba `fecha <= hoy`. Además, 2 h de **Valentina Soto (`vsoto`)** en OT-0215 (interna) el lunes, para que el costo interno de OT-0215 deje de ser $0 (ADR 0025.33) y la planilla de Coordinación tenga a quién mirar.

Test `desarrollo.test.ts`: tras sembrar dos veces, Sebastián tiene en la semana actual `totales.semana` igual a la suma de las celdas con `fecha <= hoy` (12 si hoy es martes o posterior; 7,5 si es lunes), `facturables` 8,5 / 5, `fuera_de_horario` 0,5 / 0, y una fila con `tarea` no nula; `GET /api/ots/<OT-0215>` muestra `costo_interno.monto = 36000` (2 h × 18 000 de la tarifa de la semilla; la fila es del lunes, así que siempre está); `GET /api/clientes/<Viña Santa Clara>` muestra `bolsa.vigente.horas_usadas_mes` como número (mayor que 0 solo si la OT-0218 tiene `contrato_id` en la semilla; si no, `0`).

## 11. Documentación (bloque 5E)

- `docs/manuales/usuario/01-tecnico.md`: sección **"Registrar horas"** (planilla semanal, agregar fila, celdas, fuera de horario, horas desde el seguimiento y cómo corregirlas, por qué una OT cerrada no admite horas, qué significa el color de los totales).
- `docs/manuales/usuario/02-coordinacion.md`: **"Ver las horas del equipo"** (selector de persona, solo lectura, dónde se ven las horas usadas de la bolsa y el costo interno). Quitar de "Lo que todavía no está" lo que esta fase entrega.
- `docs/manuales/administracion.md`: nota en "Equipo y permisos" sobre la fila "Ver horas de todo el equipo" y en "Departamentos y horarios" sobre que la jornada de la planilla sale del horario y los feriados.
- `docs/api/README.md`: ejemplos `curl` de `GET /api/horas?semana=`, `POST`, `PATCH`, `DELETE`. `docs/api/openapi.json` regenerado. `docs/CHANGELOG.md` (Fase 5 en "Añadido"; quitar de "Pendientes de la Fase 2" la planilla sin pantalla). `CLAUDE.md`: fila "Planilla de horas" en la tabla §2 (— / —), permiso `horas.ver_todas` en la frase de permisos si corresponde. `README.md` si cambia algún script.
- `docs/decisiones/0026-precisiones-de-la-fase-5.md` con lo de §14–§16 y `README.md` de decisiones actualizado; `preguntas-abiertas.md` no se edita (B3, B4 y B5 quedan aplicadas).

## 12. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea | Bloque | Crea/edita | Criterio de aceptación |
|---|---|---|---|
| **F5-T1 Contratos compartidos y jornada** | 5A | `shared/src/{esquemas/horas,horas-habiles/jornada}.ts`, cambios en `permisos.ts`, `esquemas/{tarea,cliente}.ts`, índices | `jornada.test.ts` con la tabla de §3.2 verde; `esquemas.test.ts` cubre §3.2; `MATRIZ_VISIBLE` con 10 filas; `npm run typecheck` verde en api y web (el cambio de `horas_usadas_mes` a `number | null` y `horas_registradas` nuevo solo rompen en `clientes.service.ts`, `tareas.service.ts` y tests con objetos literales, que se corrigen en T4/T5 o aquí con valores provisionales `// F5-T4`). |
| **F5-T2 Migración, entidad, fábricas** | 5A | migración 12, `registro-horas.entity.ts`, `fabricas.ts`, `fabricas-fase5.test.ts` | `db:migrar` desde cero aplica 12; `db:revertir` deja 11; los cuatro casos de §3.3 verdes; las semillas actuales siguen cargando. |
| **F5-T3 Planilla: consulta** | 5B | `modulos/horas/{horas.consulta,horas.routes,horas.tipos}.ts`, `app.ts`, `horas.test.ts` | `GET /api/horas` según §5.4 con pruebas 10, 11, 12 y la parte de lectura de 2 y 14; `cargarCalendario` reutilizado; sin consultas N+1 por fila (una consulta de registros, una de calendario, una de feriados). |
| **F5-T4 Planilla: mutaciones y sincronía** | 5B | `horas.service.ts`, `mensajes/mensajes.acceso.ts`, `horas.test.ts` | §5.2, §5.3, §5.5 (mensajes); pruebas 3–9, 15, 16, 17; `registrarHorasDesdeMensaje` sin cambios de firma. |
| **F5-T5 Integraciones: tareas, cierre, clientes, OT** | 5B | `tareas.service.ts`, módulo que mueve tareas (`desvincularTareas`), `clientes/clientes.service.ts` (+ `usadasMesDeContrato`), `ots.consulta.ts` (usa la función extraída), tests existentes | §5.5 (tareas y clientes); prueba 13; `ots.test.ts` "bolsa.usadas_mes" sigue verde; `clientes.test.ts` espera un número en `horas_usadas_mes` del vigente. |
| **F5-T6 Seguridad y cobertura** | 5B | `horas/seguridad.test.ts`, `horas/eventos.test.ts` | Las 17 pruebas de §7 y la cobertura de §6 verdes. |
| **F5-T7 Web: api, formato, componentes puros** | 5C | `features/horas/api.ts`, `lib/formato.ts`, `components/{CeldaHoras,ResumenSemana,SelectorSemana}.tsx` | Tests jsdom: `formatearHoras(3.5) === '3,5 h'`; `CeldaHoras` acepta `2,5` y emite `2.5`; emite `null` al vaciar; no renderiza `input` con registros de seguimiento; `ResumenSemana` con los datos del diseño muestra `12 h`, `8,5 h`, `3,5 h`. |
| **F5-T8 Pantalla 13 Horas** | 5C | `pages/HorasPage.tsx`, `components/{Planilla,FilaHoras,DialogoAgregarFila,DialogoCelda,SelectorPersona}.tsx` | §8.4 con sus tests. En el navegador (1440 y 390 px) con `sdiaz`: la semana actual reproduce el diseño; escribir en una celda guarda al salir (`POST`), vaciarla borra (`DELETE`), marcar fuera de horario actualiza el resumen; agregar fila para una OT con tarea; el diálogo de celda corrige las horas de un seguimiento y el seguimiento en la OT muestra el nuevo valor; una OT cerrada queda de solo lectura; en 390 px la vista por día con totales fijos al pie. Con `crojas` (coordinación) se ve la planilla de `sdiaz` sin inputs; con `nvega` (lectura) la propia vacía y "Tu rol no registra horas". |
| **F5-T9 Web integraciones** | 5D | `ListaTareas.tsx`, `PanelOt.tsx`, ficha de cliente, `Redactor.tsx` (texto de ayuda), tests | §9 con tests; en el navegador: OT-0218 muestra `3` registradas en la tarea de diagnóstico; la ficha de Viña Santa Clara muestra las horas usadas; Configuración → Equipo muestra 10 filas. |
| **F5-T10 Semillas** | 5E | `semillas/desarrollo-horas.ts`, `desarrollo.ts`, `desarrollo-ots.ts` (tarea_id y fecha de la fila de 3 h), `desarrollo.test.ts` | §10; `npm run db:reiniciar` deja la planilla de Sebastián con las cifras del diseño en la semana actual y OT-0215 con costo interno $36.000. |
| **F5-T11 Revisión de seguridad de la fase** | — | correcciones con test | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo; cada hallazgo confirmado se corrige con un test que lo demuestre; nada se mergea con hallazgos abiertos. Puntos a mirar: `usuario_id` nunca del cuerpo, IDOR en `PATCH`/`DELETE`, `OT_CERRADA` en todas las vías, `descripcion` fuera de los logs, `horas.ver_todas` solo lectura. |
| **F5-T12 Documentación y cierre** | 5E | §11, `docs/decisiones/0026-precisiones-de-la-fase-5.md`, `docs/decisiones/README.md`, `docs/api/openapi.json`, `CLAUDE.md`, `docs/CHANGELOG.md` | Criterios de §13 desde un clon limpio; PR a `main` con CI verde. |

**F5-T13 (condicional a §15.10) Importar horas registradas en el cotizador**: si el usuario acepta, `ImportarHorasEntrada.origen` gana `'registradas'`: una línea `mano_de_obra` por tarea con horas registradas (`SUM` sin `fuera_de_horario`) a `hora_normal` y otra, si hay, con las `fuera_de_horario` a `hora_extendida` (cliente > global, B12; `TARIFA_FALTANTE { concepto: 'hora_extendida' }` si falta); las horas de la OT **sin tarea** van en una línea "Horas registradas sin tarea". Toca `shared/esquemas/cotizacion.ts`, `cotizaciones.service.ts`, `DialogoImportarHoras.tsx` y sus tests. Si no se acepta, no se ejecuta y se anota en el CHANGELOG.

## 13. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 12 migraciones aplicadas
npm test                                                                                    → verde (shared: horas-habiles/jornada, esquemas; api: todos; web)
                                                                                              Duration de la API ≤ 6 min local (anotar la cifra)
npm run db:reiniciar                                                                        → 18 tickets, 6 OT, 4 cotizaciones; planilla de sdiaz con las cifras del diseño
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (3 colas, sin cambios)
curl -b cookie(sdiaz) -H "X-Requested-With: Zydesk" "localhost:3010/api/horas"               → 200 { editable: true, totales: { facturables: 8.5, … }, dias[0].jornada: 8.5 }
curl -b cookie(sdiaz) … -X POST -d '{"fecha":"<hoy>","ot_id":<OT-0218>,"horas":1.25}' /api/horas → 201 { usuario_id: <sdiaz>, mensaje_id: null }
curl -b cookie(sdiaz) … -X POST -d '{…misma celda…}' /api/horas                             → 409 CONFLICTO { registro_id }
curl -b cookie(sdiaz) … -X PATCH -d '{"horas":2}' /api/horas/<id>                            → 200 { horas: 2 }
curl -b cookie(sdiaz) … -X POST -d '{"fecha":"<hoy>","ot_id":<OT-0216 cerrada>,"horas":1}' /api/horas → 409 OT_CERRADA
curl -b cookie(sdiaz) … -X POST -d '{"fecha":"<mañana>","descripcion":"Reunión","horas":1}' /api/horas → 400 VALIDACION { fecha }
curl -b cookie(sdiaz) … "/api/horas?usuario_id=<crojas>"                                    → 403 SIN_PERMISO
curl -b cookie(crojas) … "/api/horas?usuario_id=<sdiaz>"                                    → 200 { editable: false }
curl -b cookie(crojas) … -X DELETE /api/horas/<id de sdiaz>                                  → 403 SIN_PERMISO
curl -b cookie(nvega) … -X POST -d '{…}' /api/horas                                          → 403 SIN_PERMISO
curl -b cookie(sdiaz) … /api/ots/<OT-0218>                                                   → 200 { tareas[0].horas_registradas: 3, horas.registradas: ≥ 4 }
GitHub Actions: workflow CI verde en la rama y en el PR a main; paso "Tests" ≤ 3 min
```

En el navegador (1440 px y 390 px): `/horas` con `sdiaz` reproduce el diseño "Registro de horas" (filas OT-0218, OT-0217, TK-1026, TK-1049, Sin ticket; totales por día frente a 8,5 / 7 h; resumen facturables / internas / fuera de horario); escribir, vaciar y marcar fuera de horario persisten al recargar; el diálogo de celda corrige las 3 h del seguimiento de OT-0218 y la OT muestra el nuevo valor en la tarea y en "Horas registradas"; con `crojas` se ve la planilla de cualquier persona sin editar; con `nvega` nada se edita; `/configuracion/equipo` muestra 10 filas en la matriz. Detener el `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

## 14. Decisiones tomadas en esta spec (con justificación)

1. **`tarea_id` en `registro_horas` y `horas_registradas` derivado, sin tocar `horas_reales`**: la spec (§4.4) da a las tareas de OT "horas estimadas y reales" editables desde la Fase 3 y §4.8 dice que las horas registradas "se suman a sus tareas". Sumar como dato derivado respeta ambas cosas sin que un `PATCH` de la planilla reescriba un campo que la persona editó a mano; reportes y costo interno siguen leyendo `registro_horas` (ADR 0025.4). Pregunta §15.1.
2. **Permiso nuevo `horas.ver_todas`** (Administración y Coordinación): la spec §4.8 dice "Coordinación puede ver las horas de cualquier persona" y ningún permiso actual lo expresa; `reportes.ver` incluiría a Solo lectura (no lo pide B10) y `ots.aprobar` mezclaría conceptos. Una fila más en la matriz es explícito y barato. Pregunta §15.2.
3. **Ver no es editar**: la spec dice "ver"; la planilla ajena es de solo lectura y `POST` siempre registra para la sesión. Evita que quien ve pueda alterar horas que luego se cobran. Pregunta §15.3.
4. **Las filas nacidas de un seguimiento se corrigen en la planilla y `mensaje.horas` se sincroniza**: ADR 0021.10 dejó para esta fase la corrección de fecha; sin editar horas ni borrar, un error del redactor sería permanente (los mensajes no se editan, ADR 0021.15). Una sola verdad: la fila; el mensaje refleja su valor. Pregunta §15.4.
5. **Sin horas a futuro**: la planilla registra trabajo hecho; el diseño atenúa las columnas posteriores a hoy. Un 400 claro evita cargar horas por adelantado que luego cuadren mal contra la jornada. Pregunta §15.5.
6. **Sin `evento` ni `auditoria` por horas**: la tabla de `CLAUDE.md` ya trata las horas del redactor como "el mensaje es el registro"; la planilla sigue el criterio con `registro_horas` (`creado_en`, `actualizado_en`). `evento` es de ticket/OT/cotización/tarea (ADR 0003) y meter cada celda ahí llenaría el historial de ruido. Pregunta §15.6.
7. **Celda = una fila manual + N de seguimiento**, con índice único parcial: el `input` de la celda edita una sola fila (predecible, sin "repartir" un total entre registros); cuando hay registros de seguimiento se abre el detalle. La unicidad en BD evita duplicados por doble clic o por dos pestañas.
8. **Una fila no cambia de destino**: evita mover horas de una OT cerrada a otra y simplifica bloqueos; se borra y se crea.
9. **Siete columnas siempre**, con sábado y domingo atenuados cuando la jornada es 0: el diseño muestra L–V porque el horario de ejemplo no tiene fin de semana, pero el horario es configurable y hay horas fuera de horario que caen en fin de semana. Pregunta §15.7.
10. **Jornada del día = el mismo cálculo que los plazos** (`bloquesDelDia`, ADR 0005), en `shared`, con feriados generales y del departamento: una sola definición de "hábil".
11. **Ticket cerrado admite horas**: ADR 0021.5 admite mensajes (y por B5 sus horas) en tickets cerrados; cerrar un ticket no es "cerrar el trabajo" como la OT (ADR 0024.2 es específica de OT por la bolsa y la facturación).
12. **"Sin ticket" con descripción libre obligatoria** (máx. 200), sin catálogo: la spec solo da el ejemplo "reuniones/interno". Pregunta §15.9.
13. **Mover tareas a otra OT desvincula `tarea_id`**: las horas se trabajaron en la OT original (bolsa y costo interno de esa OT no deben cambiar por un cierre con `nueva_ot`).
14. **`horas_usadas_mes` del cliente** con la misma consulta que la OT, extraída al módulo `clientes` (dueño de `contrato_bolsa`): cierra ADR 0023.18 sin duplicar SQL.
15. **Sin exportación ni cierre de mes**: B3 y PLAN (Fase 6/7).

## 15. Preguntas para el usuario

1. **[Bloquea F5-T2, T5, T9]** Horas registradas contra una **tarea**: ¿se muestran aparte como "registradas" sin tocar `horas_reales` (decisión 1), o deben **escribir `horas_reales`** automáticamente (la tarea deja de editarse a mano)? **Recomendación: aparte**; `horas_reales` sigue siendo el dato que la persona declara en la tarea.
2. **[Bloquea F5-T1, T3, T6]** ¿Permiso nuevo **`horas.ver_todas`** para Administración y Coordinación (fila 10 de la matriz), o reutilizar `reportes.ver` (Solo lectura también vería las horas de todos)? **Recomendación: permiso nuevo.**
3. **[Bloquea F5-T4, T6]** ¿Coordinación/Administración solo **ven** las horas ajenas (decisión 3) o también pueden **editarlas**? **Recomendación: solo ver** en v1, como dice la spec; cada persona corrige las suyas.
4. **[Bloquea F5-T4]** Filas creadas desde un seguimiento: ¿se **corrigen y borran desde la planilla** sincronizando `mensaje.horas` (decisión 4), o son de solo lectura (y un error se arregla con otra fila)? **Recomendación: corregir con sincronía.**
5. ¿Rechazar **fechas futuras** (decisión 5)? No bloquea (es un `if`). **Recomendación: rechazar.**
6. ¿Registrar un `evento` en la OT/ticket cuando se cargan horas desde la planilla (el historial de la OT del diseño muestra "registró 3 h en «Diagnóstico»", que hoy nace del seguimiento)? No bloquea. **Recomendación: no** (decisión 6).
7. ¿**Siete columnas** siempre (decisión 9) o solo los días activos del horario? No bloquea. **Recomendación: siete.**
8. ¿Tope de horas **por día** (p. ej. más de 24 h sumadas en un día → 400) además del tope por fila? No bloquea. **Recomendación: no**; la comparación con la jornada es visual (B3: sin bloqueos en v1).
9. ¿"Sin ticket" con **descripción libre** (decisión 12) o con un catálogo fijo (Reunión, Capacitación, Administración…)? No bloquea. **Recomendación: libre.**
10. ¿Agregar en esta fase **"Importar horas registradas"** al cotizador (F5-T13: una línea por tarea a tarifa normal y otra con las horas fuera de horario a tarifa extendida), que es lo que B4 ("aplica tarifa extendida") y ADR 0025.16 dejaron para la Fase 5? No bloquea el resto. **Recomendación: sí**, es pequeño y cierra B4; si prefieres, queda para la Fase 7 junto a los reportes.
11. ¿Las horas registradas en una OT deben actualizar `actualizado_en` de la OT (aparecería "actualizada hace 5 min" en `/ots`)? No bloquea. **Recomendación: no.**

### Respuestas del usuario (2026-10-01)

1–4. El usuario aceptó las recomendaciones de las preguntas que bloquean:
  - Las horas registradas van aparte y `horas_reales` no se toca.
  - Se crea el permiso nuevo `horas.ver_todas`.
  - Coordinación y Administración solo ven las horas ajenas.
  - Las filas de seguimiento se corrigen desde la planilla, con sincronía de `mensaje.horas`.

5–11. No bloquean; se resuelven con la recomendación de esta sección. La 10 se acepta: **F5-T13 entra en la fase**. Va después de 5C y 5D, como tarea propia, porque toca `cotizaciones` y `features/cotizador`, que no son de ningún bloque.

### Estado de avance (2026-10-01)

- **F5-T1 y T2 (bloque 5A) hechos**:
  - `reiniciarBd` borra `registro_horas` primero, por sus FK con `SET NULL` y los `CHECK` nuevos.
  - El test de la Fase 3 que insertaba una fila sin destino ahora espera el `CHECK`.
- **F5-T3 a T6 (bloque 5B) hechos** (API: 655 tests + 2 omitidos). Desviaciones:
  - `dia_semana` usa 0 = domingo, como `horario_dia`; la web ordena por el índice de la columna.
  - Los tests de mutaciones e integraciones están en `horas.mutaciones.test.ts` y `horas.integraciones.test.ts`.
  - PATCH con `descripcion: null` en "Sin ticket" → 400; con `tarea_id` en una fila de ticket o "Sin ticket" → 400.
  - Ver una planilla ajena sin permiso → 403, antes del 404 de un usuario inexistente.
  - En `clientes.test.ts`, el contrato vigente devuelve `horas_usadas_mes: 0`, ya no `null`.
- Spec aprobada. **Siguiente** (pendiente desde 5C):
  1. 5A (F5-T1, T2).
  2. 5B (F5-T3 a T6).
  3. 5C y 5D en paralelo (F5-T7 a T9).
  4. F5-T13.
  5. 5E (F5-T10).
  6. Revisión de seguridad (F5-T11).
  7. Documentación (F5-T12).

## 16. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0026 "Precisiones de la Fase 5" al cerrar)

- **ADR 0002 / spec §2**: permiso `horas.ver_todas` (Administración, Coordinación) y fila 10 "Ver horas de todo el equipo" en la matriz; la planilla ajena es de solo lectura; Solo lectura no registra horas (B10) ni ve las ajenas.
- **ADR 0003 / 0017 / `CLAUDE.md` §2**: la planilla de horas no genera `evento` ni `auditoria`; `registro_horas` es el registro, como el `mensaje` lo es para las horas del redactor. Mover tareas a otra OT desvincula `registro_horas.tarea_id`.
- **ADR 0005**: `horasJornada`, `lunesDe` y `diasDeSemana` en `shared/horas-habiles`; la jornada de la planilla usa la misma definición de bloques y feriados que los plazos; "fuera de horario" sigue siendo marca manual (B4).
- **ADR 0007 / 0025.4**: `TareaSalida.horas_registradas` derivado; `horas_reales` no se escribe desde la planilla; costo interno y `bolsa.usadas_mes` sin cambios de fórmula (si §15.10 se acepta: `origen: 'registradas'` en importar horas con `hora_extendida` para las horas fuera de horario).
- **ADR 0010**: rutas nuevas `GET /api/horas`, `POST /api/horas`, `PATCH /api/horas/:id`, `DELETE /api/horas/:id`; sin códigos nuevos; 409 `CONFLICTO { registro_id }` para la celda manual duplicada; `RegistroHorasEditar` como objeto explícito (ADR 0023.19).
- **ADR 0011 / 0019**: pantalla 13 con cuadrícula a ≥ 1024 px, scroll con primera columna fija entre 768 y 1024, vista por día bajo 768 px; estado en la URL (`semana`, `usuario`); guardado por celda al perder el foco, sin botón "Guardar".
- **ADR 0015 / 0023.18**: `ContratoBolsaSalida.horas_usadas_mes` calculado para el contrato vigente (null en el historial) con la consulta extraída a `clientes`.
- **ADR 0021.10 / 0021.15**: la fecha, las horas y la marca "fuera de horario" de una fila nacida de un seguimiento se corrigen en la planilla; `mensaje.horas` se sincroniza (editar → mismo valor; borrar → `NULL`); el texto del mensaje no cambia; sigue sin selector de fecha en el redactor.
- **ADR 0024.2**: la regla "una OT final no registra horas" cubre también crear, editar y borrar filas desde la planilla; un ticket cerrado sí admite horas.
- **ADR 0025 (consecuencias)**: `tarea_id` entregado; "Sin ticket" (ambos destinos nulos con descripción) habilitado; índice único de celda manual.
- **Spec funcional §4.8 / §6 / PLAN §4**: `RegistroHoras` gana `tarea_id`, `mensaje_id` (ya existía) y la restricción de descripción en "Sin ticket"; "se pueden editar hasta el cierre de mes" se implementa como "sin bloqueo" (B3); la exportación de horas queda en Fases 6–7.
