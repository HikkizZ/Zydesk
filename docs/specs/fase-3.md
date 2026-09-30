# Fase 3 — OT y cierre · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §4 Fase 3, ADR 0003, 0004, 0006, 0007, 0008, 0009, 0010, 0011, 0014, 0015, 0017, 0020, 0021, **0022**; `preguntas-abiertas.md` A1, A2, A4, B1, B6, B8, B10; spec funcional §4.1 (advertencia OT abierta), §4.4, **§4.5**, **§4.6**, §5 pantallas 5, 6, 6b, §6 (`OT`, `AprobacionCliente`, `Tarea`, `Mensaje`); diseño "Orden de trabajo OT-0218", "Cerrar OT-0218", "Ticket TK-1048", "Tablero de tickets", "Tabla de tickets" y "Órdenes de trabajo" (solo como referencia de lista).
>
> Rama `feat/fase-3-ot`; PR a `main` al cerrar con CI verde (ADR 0020). Entorno: el de la Fase 2. Todo lo construido en las Fases 0–2 (`ruta()`, `enTransaccion`, `registrarCambios`, `registrarEvento`, `siguienteNumero` + `fuenteNumeros`, `Storage`, `asociarArchivos`, `bloquearTicket`, `registrarActividadEnTicket`, `otsAbiertas()` stub, `OT_ABIERTA`, `TicketResumen.tipo/ot_vinculada`, `TicketSalida.ots`, `DialogoCambiarEstado` con el diálogo de OT abierta, `ListaTareas`, `Redactor`, `GaleriaArchivos`, `PillTipo`, fábricas, BD de test por bloque) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, `type` explícito en `@Column`, SQL a mano en migraciones, servicios como único punto de escritura, `tickets` ↔ `ots` es la única dependencia circular permitida (solo entre `*.service.ts`), `logger` sin contenido, procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: tabla `ot` y `aprobacion_cliente`; `tarea`, `mensaje` y `registro_horas` aceptan `ot_id`; `archivo.entidad = 'ot'`; convertir ticket en OT (tareas abiertas pasan a la OT, vínculo doble, evento) y "Crear otra OT"; tipo facturable/interna con sus campos, cambiable solo en Borrador; casilla "Descuenta de la bolsa" (ADR 0015); máquina de etapas de OT en `shared` con tests de tabla (ADR 0004: etapa termina en `cerrada`; "Facturada" es `estado_facturacion`; `cancelada` con motivo); aprobación del cliente con respaldo adjunto obligatorio (facturable) y aprobación interna por alguien con `ots.aprobar` (B8); marcar facturada con `n_factura` (`ots.facturar`); tareas de OT con horas estimadas y reales; galería de fotos y archivos de la OT (reutiliza `Storage`, subida en dos pasos, cámara en celular); seguimiento y notas de la OT con "Copiar al ticket"; historial de la OT; **cierre de OT (spec 4.6)** transaccional con `efectosCierreOt()` compartida, ambos caminos, resumen obligatorio, facturación independiente; eventos de dominio publicados tras el commit (sin despachador: Fase 6); **B1 real**: cerrar un ticket con OT abierta → 409 `OT_ABIERTA`; numeración `OT-` conectada a la tabla real; pantallas **6 Orden de trabajo** (mobile-first) y **6b Cerrar OT**; detalle de ticket con OT vinculadas y "Convertir en OT" / "Crear otra OT"; Tablero y Tabla con la OT vinculada y su tipo (filtro "Tipo" y chip "Con OT" habilitados); lista mínima de OT en `/ots` y tarjeta "Órdenes de trabajo" de la ficha de cliente (solo lectura, ADR 0022); semillas (OT-0218 y OT-0219 del diseño, más OT-0214, 0215, 0216 y 0217 vinculadas a tickets ya sembrados); manuales, CHANGELOG, ADR 0023.

**No entra**: cotizador, versiones, líneas, montos, descargas `.xlsx`/PDF y "enviar cotización" (Fase 4: aquí `OtSalida.cotizacion` y `neto` son `null`, la tarjeta "Cotización" se dibuja deshabilitada y la etapa `cotizada` se marca a mano, §5.4); tarifa de costo interno y `costo_interno` (Fase 4/5: `null`); planilla de horas, `horas_usadas_mes` en la ficha de cliente y `tarea_id` en `registro_horas` (Fase 5); avisos, despachador, preferencias, "Por aprobar" en Mi día (Fase 6: aquí solo se publican los eventos de dominio); pantalla **10 Órdenes de trabajo** completa (indicadores en pesos, "Esperando aprobación", exportación `.xlsx` y `exportacion` en auditoría: Fase 6; la lista de §12 es una vista mínima); tablero Kanban de OT (no lo pide la spec); edición o borrado de mensajes y archivos; Playwright; CD.

## 1. Bloques y paralelismo

| Bloque | Contenido | Depende de | Archivos que toca (exclusivos) |
|---|---|---|---|
| **3A** Contratos y BD | migración 10, entidades nuevas y modificadas, `entidades.ts`, `shared` (enums, `estados/ot.ts`, `esquemas/ot.ts`, cambios en `tarea/mensaje/ticket/comunes`, `errores`, `eventos.ts`), `archivos.service.ts` (entidad `'ot'`), `modulos/ots/ots.acceso.ts`, `core/eventos/dominio.ts`, fábricas | — | `packages/shared/src/**`, `apps/api/src/database/**` (salvo semillas), `apps/api/src/modulos/**/*.entity.ts`, `apps/api/src/modulos/archivos/**`, `apps/api/src/modulos/ots/{ot.entity,aprobacion-cliente.entity,ots.acceso}.ts`, `apps/api/src/core/eventos/**`, `apps/api/test/**` |
| **3B** OT API | `modulos/ots` (crear desde ticket, obtener, listar, editar, etapas, aprobaciones, cancelar, facturar, archivos de OT), `core/numeracion/fuente.ts`, `tickets.service/consulta` (`otsAbiertas`, `ot_vinculada`, filtros, `cambiarEstadoEnTx`), `app.ts` | 3A | `apps/api/src/modulos/ots/**` (salvo `ots.cierre.service.ts` y los archivos de 3A), `apps/api/src/modulos/tickets/**` (salvo entities), `core/numeracion/fuente.ts`, `app.ts` |
| **3C** Tareas, mensajes y horas de OT | `modulos/tareas`, `modulos/mensajes`, `modulos/horas` | 3A | `apps/api/src/modulos/{tareas,mensajes,horas}/**` (salvo entities) |
| **3D** Cierre | `ots.cierre.service.ts`, integración de `efectosCierreOt`, publicación de eventos de dominio, suites de seguridad y cobertura de eventos de OT | 3B, 3C | `apps/api/src/modulos/ots/{ots.cierre.service,cierre.test,seguridad.test,eventos.test}.ts` |
| **3E** Web OT | `features/ots/**`, componentes de dominio generalizados (`ListaTareas`, `Redactor`), componentes nuevos, `router.tsx`, pantallas 6 y 6b, lista `/ots` | 3B–3D (API); componentes puros contra los esquemas de 3A | `apps/web/src/features/ots/**`, `apps/web/src/components/dominio/**`, `apps/web/src/app/router.tsx` |
| **3F** Web tickets y clientes | detalle de ticket (convertir, OT vinculadas), Tablero, Tabla, `eventos.ts`, ficha de cliente | 3B (API); 3E solo para `features/ots/api.ts` (se acuerda la firma en §10.1) | `apps/web/src/features/tickets/**`, `apps/web/src/features/clientes/**` |
| **3G** Semillas y docs | semillas de OT, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0023 | todo | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md` |

**En paralelo sin conflicto**: 3B con 3C (tras 3A); 3E y 3F entre sí (tras la API); 3E puede empezar `PillEtapaOt`, `Etapas`, `SelectorTipoOt`, `efectos` del diálogo de cierre y la generalización de `ListaTareas`/`Redactor` contra los esquemas de 3A. Orden general en §15.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en la Fase 2 (§1.1): `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 3A usa `zydesk_test` (sin variable); 3B `3b`; 3C `3c`; 3D `3d`; 3G `3g`. CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas (obligatorio)

Toda transacción que toque ticket y OT bloquea **primero el ticket** (`bloquearTicket`) y **después la OT** (`bloquearOt`), y solo después tareas o mensajes (`FOR UPDATE OF t`). Operaciones solo de OT (tareas, mensajes, archivos, etapas, edición) bloquean solo la OT. Conversión, cierre, cancelación y "copiar al ticket" bloquean ticket → OT. Así no hay interbloqueos entre un cierre y un seguimiento simultáneo.

## 2. Versiones nuevas

Ninguna. Sin paquetes nuevos en API ni web; sin componentes shadcn nuevos (los radios de "¿Resolvió el ticket?" y de tipo se hacen con `input type="radio"` estilizado como en `DialogoCambiarEstado`). Si al implementar hace falta un paquete, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 3A)

### 3.1 Migración `1791000000010-ots` (SQL a mano; `down` inverso; no inserta datos)

```sql
ot (
  id identity PK,
  numero integer NOT NULL UNIQUE, codigo text NOT NULL UNIQUE,                 -- ADR 0006/0014, siempre correlativa
  ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE RESTRICT,          -- siempre nace de un ticket (spec 4.5)
  tipo text NOT NULL CHECK (tipo IN ('facturable','interna')),
  etapa text NOT NULL CHECK (etapa IN ('borrador','cotizada','aprobada','en_ejecucion','cerrada','cancelada')),
  titulo text NOT NULL, alcance text NULL,
  responsable_tecnico_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  cliente_id integer NULL REFERENCES cliente(id) ON DELETE SET NULL,            -- copiado del ticket; editable en borrador
  contacto_id integer NULL REFERENCES contacto(id) ON DELETE SET NULL,          -- facturable
  inicio date NULL, termino date NULL,
  oc_cliente text NULL, condicion_pago text NULL,                               -- facturable
  contrato_id integer NULL REFERENCES contrato_bolsa(id) ON DELETE SET NULL,    -- "Descuenta de la bolsa" (ADR 0015)
  centro_costo text NULL, area_solicitante text NULL,                           -- interna
  aprobador_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,          -- interna (B8)
  aprobada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL, aprobada_en timestamptz NULL,
  estado_facturacion text NOT NULL CHECK (estado_facturacion IN ('no_aplica','pendiente','por_facturar','facturada')),
  n_factura text NULL, facturada_en timestamptz NULL, facturada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  resolvio_ticket boolean NULL, resumen_cierre text NULL, cerrada_en timestamptz NULL,
  cerrada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  motivo_cancelacion text NULL, cancelada_en timestamptz NULL,
  creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL, creado_en, actualizado_en,
  CHECK (tipo = 'facturable' OR estado_facturacion = 'no_aplica'),
  CHECK (etapa <> 'cerrada' OR (resumen_cierre IS NOT NULL AND resolvio_ticket IS NOT NULL AND cerrada_en IS NOT NULL)),
  CHECK (etapa <> 'cancelada' OR (motivo_cancelacion IS NOT NULL AND cancelada_en IS NOT NULL)),
  CHECK (estado_facturacion <> 'facturada' OR (n_factura IS NOT NULL AND facturada_en IS NOT NULL)),
  CHECK (termino IS NULL OR inicio IS NULL OR termino >= inicio)
)  -- índices: (ticket_id), (etapa), (estado_facturacion), (cliente_id), (responsable_tecnico_id), (aprobador_id), (creado_en desc)

aprobacion_cliente (                                                            -- spec 4.5, facturable
  id identity PK, ot_id integer NOT NULL UNIQUE REFERENCES ot(id) ON DELETE CASCADE,
  contacto_id integer NOT NULL REFERENCES contacto(id) ON DELETE RESTRICT,
  fecha date NOT NULL, forma text NOT NULL CHECK (forma IN ('orden_de_compra','correo','cotizacion_firmada')),
  archivo_id integer NOT NULL REFERENCES archivo(id) ON DELETE RESTRICT,        -- respaldo obligatorio
  registrada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL, registrada_en timestamptz NOT NULL DEFAULT now()
)

ALTER TABLE tarea ALTER COLUMN ticket_id DROP NOT NULL;
ALTER TABLE tarea ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE CASCADE,
                  ADD COLUMN horas_estimadas numeric(6,2) NULL CHECK (horas_estimadas >= 0),
                  ADD COLUMN horas_reales numeric(6,2) NULL CHECK (horas_reales >= 0),
                  ADD CONSTRAINT tarea_destino_chk CHECK ((ticket_id IS NULL) <> (ot_id IS NULL)),
                  ADD CONSTRAINT tarea_horas_solo_ot_chk CHECK (ot_id IS NOT NULL OR (horas_estimadas IS NULL AND horas_reales IS NULL));
CREATE INDEX tarea_ot_orden_idx ON tarea (ot_id, orden);

ALTER TABLE mensaje ALTER COLUMN ticket_id DROP NOT NULL;
ALTER TABLE mensaje ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE CASCADE,
                    ADD COLUMN copiado_desde_id integer NULL REFERENCES mensaje(id) ON DELETE SET NULL,
                    ADD CONSTRAINT mensaje_destino_chk CHECK ((ticket_id IS NULL) <> (ot_id IS NULL));
CREATE INDEX mensaje_ot_creado_idx ON mensaje (ot_id, creado_en);
CREATE UNIQUE INDEX mensaje_copiado_desde_uq ON mensaje (copiado_desde_id) WHERE copiado_desde_id IS NOT NULL;  -- una copia por origen

ALTER TABLE registro_horas ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE SET NULL,
                           ADD CONSTRAINT registro_horas_destino_chk CHECK (ticket_id IS NULL OR ot_id IS NULL);  -- Fase 5 permite ambos NULL
CREATE INDEX registro_horas_ot_idx ON registro_horas (ot_id);

ALTER TABLE archivo DROP CONSTRAINT <check de entidad>; ALTER TABLE archivo ADD CONSTRAINT archivo_entidad_chk CHECK (entidad IN ('ticket','ot'));
```

`evento` no cambia: `entidad = 'ot'`, `entidad_id = id` como texto. `entidades.ts` registra `Ot` y `AprobacionCliente`; `Tarea`, `Mensaje`, `RegistroHoras`, `Archivo` actualizan sus columnas (`ticket_id: number | null`, `ot_id`, `horas_estimadas`, `horas_reales`, `copiado_desde_id`, `entidad: 'ticket' | 'ot' | null`). `down`: elimina índices y columnas nuevas, restaura `NOT NULL` (falla si hay filas con `ot_id`: aceptable, `db:revertir` es de desarrollo) y el `CHECK` anterior de `archivo`.

### 3.2 `packages/shared`

```ts
// enums/ot.ts
export const TIPOS_OT = ['facturable','interna'] as const;  ETIQUETA_TIPO_OT = { facturable: 'Facturable · externa', interna: 'Interna · no facturable' }
export const ETAPAS_OT = ['borrador','cotizada','aprobada','en_ejecucion','cerrada','cancelada'] as const;
export const ETAPAS_OT_FINALES = ['cerrada','cancelada'] as const;
export const ETIQUETA_ETAPA_OT = { borrador: 'Borrador', cotizada: 'Cotizada', aprobada: 'Aprobada', en_ejecucion: 'En ejecución', cerrada: 'Cerrada', cancelada: 'Cancelada' }
export const ESTADOS_FACTURACION = ['no_aplica','pendiente','por_facturar','facturada'] as const;
export const ETIQUETA_ESTADO_FACTURACION = { no_aplica: 'No aplica', pendiente: 'Pendiente', por_facturar: 'Por facturar', facturada: 'Facturada' }
export const FORMAS_APROBACION = ['orden_de_compra','correo','cotizacion_firmada'] as const;  ETIQUETA_FORMA_APROBACION = { orden_de_compra: 'Orden de compra', correo: 'Correo de aprobación', cotizacion_firmada: 'Cotización firmada' }
export const TIPOS_TICKET = ['ticket','ot_facturable','ot_interna'] as const   // ya existía inline en TicketResumen; se nombra

// estados/ot.ts  (ADR 0004)
export function etapasDe(tipo: TipoOt): EtapaOt[]                      // facturable: borrador, cotizada, aprobada, en_ejecucion, cerrada · interna: borrador, aprobada, en_ejecucion, cerrada (sin cancelada: es salida, no paso)
export function esEtapaFinal(e: EtapaOt): boolean
export function transicionesEtapaDesde(tipo: TipoOt, e: EtapaOt): EtapaOt[]
  // facturable: borrador→[cotizada, cancelada]; cotizada→[aprobada, borrador, cancelada]; aprobada→[en_ejecucion, cancelada]; en_ejecucion→[cerrada, cancelada]; cerrada→[]; cancelada→[]
  // interna:    borrador→[aprobada, cancelada]; aprobada→[en_ejecucion, cancelada]; en_ejecucion→[cerrada, cancelada]; cerrada→[]; cancelada→[]
export function puedeCambiarEtapa(tipo, desde, hasta): boolean          // desde ≠ hasta y hasta ∈ transicionesEtapaDesde
export function pasoVisual(ot: { tipo, etapa, estado_facturacion }): { pasos: string[]; actual: number | null }
  // etiquetas de etapasDe(tipo) + 'Facturada' al final si facturable (A1: sexto paso derivado); actual = índice de la etapa,
  // o del paso 'Facturada' si cerrada && facturada; null si cancelada
export function estadoFacturacionInicial(tipo: TipoOt): EstadoFacturacion   // facturable → 'pendiente'; interna → 'no_aplica'
export const CambioEtapaOt = z.object({ etapa: z.enum(['borrador','cotizada','en_ejecucion']) })   // solo etapas sin permiso especial (§5.4)
export const CierreOt = z.discriminatedUnion('resolvio_ticket', [
  z.object({ resolvio_ticket: z.literal(true), resumen: texto(5000) }),
  z.object({ resolvio_ticket: z.literal(false), resumen: texto(5000),
             siguiente: z.discriminatedUnion('accion', [
               z.object({ accion: z.literal('en_curso'), responsable_id: id }),
               z.object({ accion: z.literal('en_espera'), responsable_id: id, espera_de: z.enum(ESPERA_DE), espera_detalle: texto(120).optional() }),
               z.object({ accion: z.literal('nueva_ot'), responsable_id: id }),
             ]) }),
]);  export type CierreOtDatos
export const CancelarOt = z.object({ motivo: texto(500) });  FacturarOt = z.object({ n_factura: texto(40) })

// estados/efectos-cierre.ts  (ADR 0004: la misma función en el diálogo y en el servicio)
export interface ContextoCierreOt {
  ot: { codigo: string; tipo: TipoOt; neto: number | null };
  ticket: { codigo: string; estado: EstadoTicket; responsables: { nombre: string }[]; seguidores: { nombre: string }[] };
  responsable_siguiente: { nombre: string } | null;   // quien queda a cargo del siguiente paso (solo si !resolvio)
}
export interface EfectosCierreOt {
  ot: string; ticket: string; historial: string; avisos: string;    // textos del bloque "Qué va a pasar"
  ticket_estado_final: EstadoTicket; estado_facturacion_final: EstadoFacturacion; crea_nueva_ot: boolean;
  destinatarios: string[];   // nombres únicos de responsables ∪ seguidores
}
export function efectosCierreOt(ctx: ContextoCierreOt, p: CierreOtDatos): EfectosCierreOt
```

Textos de `efectosCierreOt` (los del diseño "Cerrar OT-0218"): `ot` = `Pasa a Cerrada y queda «Por facturar»` + (`neto` ? ` (${formatearCLP(neto)} neto)` : ``) + `. Se factura aunque no haya resuelto el ticket.` para facturable; `Pasa a Cerrada. Es interna: no se factura.` para interna. `ticket` = `Pasa a Resuelto.` si resolvió; si no: `No se resuelve: sigue abierto y vuelve a En curso con {nombre}` / `… pasa a En espera ({etiqueta espera_de}) con {nombre}` / `… se crea una OT nueva vinculada, a cargo de {nombre}`. `historial` = `En {TK} se registra «{OT} cerrada · resolvió el ticket»` / `«… no resolvió el ticket» junto al resumen.`. `avisos` = `Se avisa a {responsables unidos con "y"} (responsables) y a quienes siguen el ticket.` (sin responsables: `Se avisa a quienes siguen el ticket.`). `ticket_estado_final` = `resuelto` | `en_curso` | `en_espera` | `en_curso` (nueva_ot). `estado_facturacion_final` = facturable → `por_facturar`, interna → `no_aplica`.

Tests `estados/ot.test.ts`: tabla completa 2 tipos × 6 × 6 de `puedeCambiarEtapa`; `etapasDe`; `pasoVisual` para facturable en `cotizada` (actual 1), cerrada+facturada (actual 5 "Facturada"), interna en `en_ejecucion` (actual 2), cancelada (null); `CierreOt` rechaza `resolvio_ticket: false` sin `siguiente`, `en_espera` sin `espera_de`, resumen vacío; `CambioEtapaOt` rechaza `aprobada`, `cerrada`, `cancelada`. Tests `estados/efectos-cierre.test.ts`: 6 casos (sí facturable con y sin neto, sí interna, no/en_curso, no/en_espera, no/nueva_ot) comparando los 4 textos y los campos derivados.

```ts
// esquemas/comunes.ts  — se mueven aquí desde ticket.ts (evita el ciclo ticket ↔ ot; `ticket.ts` los importa)
export const Responsable = UsuarioBreve.extend({ principal: z.boolean() });  ClienteBreve = { id, nombre, es_interno }

// esquemas/ot.ts
OtBreve = { id, numero, codigo, titulo: string, tipo, etapa, estado_facturacion, resolvio_ticket: boolean|null, creado_en, cerrada_en: instante|null }
OtCrearEntrada = { tipo: z.enum(TIPOS_OT), titulo: texto(200).optional() /* por defecto el asunto del ticket */, alcance: texto(20_000).nullable().default(null),
                   responsable_tecnico_id: id.nullable().default(null) /* por defecto el principal del ticket */, descuenta_bolsa: z.boolean().default(false) }
OtEditarEntrada = { tipo?: z.enum(TIPOS_OT), titulo?: texto(200), alcance?: texto(20_000).nullable(), responsable_tecnico_id?: id.nullable(), cliente_id?: id.nullable(),
                    contacto_id?: id.nullable(), inicio?: fechaIso.nullable(), termino?: fechaIso.nullable(), oc_cliente?: texto(60).nullable(), condicion_pago?: texto(80).nullable(),
                    descuenta_bolsa?: z.boolean(), centro_costo?: texto(80).nullable(), area_solicitante?: texto(120).nullable(), aprobador_id?: id.nullable() }
                  .refine(termino null o inicio null o termino >= inicio)
AprobarOtEntrada = { iniciar: z.boolean().default(false) }                                  // interna (B8); "Aprobar e iniciar" del diseño
AprobacionClienteEntrada = { contacto_id: id, fecha: fechaIso, forma: z.enum(FORMAS_APROBACION), archivo_id: id, iniciar: z.boolean().default(false) }
AprobacionClienteSalida = { contacto: { id, nombre: string, correo: string|null }, fecha: fechaIso, forma, archivo: ArchivoSalida, registrada_por: referencia|null, registrada_en: instante }
ArchivosOtEntrada = { archivo_ids: z.array(id).min(1).max(10) }
HorasOt = { estimadas: number /* Σ tarea.horas_estimadas */, reales: number /* Σ tarea.horas_reales */, registradas: number /* Σ registro_horas.horas con ot_id */ }
OtResumen = OtBreve & { ticket: { id, codigo: string, asunto: string }, cliente: ClienteBreve|null, responsable_tecnico: UsuarioBreve|null, aprobador: UsuarioBreve|null,
                        neto: z.null() /* Fase 4 */, horas: HorasOt, inicio: fechaIso|null, termino: fechaIso|null, vencida: boolean /* termino < hoy (Santiago) y no final */,
                        n_mensajes: number, actualizado_en }
OtSalida = OtResumen & { alcance: string|null, cliente_id: id|null, contacto: { id, nombre, correo, area: string|null }|null, oc_cliente, condicion_pago,
                        bolsa: { contrato_id: id, horas_mes: number, usadas_mes: number }|null /* ADR 0015 */, centro_costo, area_solicitante,
                        aprobada_por: referencia|null, aprobada_en: instante|null, aprobacion: AprobacionClienteSalida|null,
                        n_factura: string|null, facturada_en: instante|null, facturada_por: referencia|null,
                        resumen_cierre: string|null, cerrada_por: referencia|null, motivo_cancelacion: string|null, cancelada_en: instante|null,
                        tareas: TareaSalida[], archivos: ArchivoSalida[] /* propios de la OT, sin los de mensajes */,
                        ticket_origen: { id, codigo, asunto, estado, cliente: ClienteBreve|null, responsables: Responsable[], seguidores: UsuarioBreve[],
                                         otras_ots_abiertas: z.array({ id, codigo, etapa }) },
                        cotizacion: z.null() /* Fase 4: { id, codigo, version, estado, neto, total } */, costo_interno: z.null() /* Fase 4/5 */,
                        tipo_cambiable: boolean /* etapa === 'borrador' */, creado_por: referencia|null }
OtsQuery = esquemaPaginacion.extend({ q: texto(80).optional(), ticket_id: idQuery.optional(), cliente_id: idQuery.optional(), tipo: csv(TIPOS_OT).optional(),
                                      etapa: csv(ETAPAS_OT).optional(), estado_facturacion: csv(ESTADOS_FACTURACION).optional(), abiertas: booleanoTexto.optional(),
                                      responsable_id: idQuery.optional(), aprobador_id: idQuery.optional(),
                                      orden: z.enum(['-actualizado_en','-creado_en','termino']).default('-actualizado_en') })

// esquemas/tarea.ts (cambios)
TareaEntrada += { horas_estimadas: z.number().min(0).max(999).multipleOf(0.25).nullable().default(null) }   // solo OT; en ticket debe ser null (400)
TareaEditarEntrada += { horas_estimadas?, horas_reales?: z.number().min(0).max(999).multipleOf(0.25).nullable() }
TareaSalida: ticket_id: id.nullable(), ot_id: id.nullable(), horas_estimadas: number|null, horas_reales: number|null

// esquemas/mensaje.ts (cambios)
MensajeEntrada += { copiar_al_ticket: z.boolean().default(false) }     // solo OT; en ticket debe ser false (400)
MensajeSalida: ticket_id: id.nullable(), ot_id: id.nullable(), copiado_de: { mensaje_id: id, ot: { id, codigo } }|null /* mensaje del ticket copiado desde una OT */,
               copiado_al_ticket: boolean /* mensaje de OT que ya tiene copia */

// esquemas/ticket.ts (cambios)
TicketSalida.ots: z.array(OtBreve)                                      // más nueva primero
TicketsQuery += { con_ot: booleanoTexto.optional(), tipo: csv(TIPOS_TICKET).optional() }   // TableroQuery hereda `tipo` y `con_ot`
TicketResumen.tipo: z.enum(TIPOS_TICKET)  (sin cambio de forma)

// eventos.ts  (ADR 0008: nombres y cargas de los eventos de dominio que esta fase publica; el despachador llega en Fase 6)
export interface EventosDominio {
  'ot.cerrada':      { ot_id: number; ticket_id: number; resolvio_ticket: boolean; destinatarios_ids: number[] /* responsables ∪ seguidores del ticket */ };
  'ot.por_facturar': { ot_id: number };
  'ot.por_aprobar':  { ot_id: number; aprobador_id: number };
  'ot.cancelada':    { ot_id: number; ticket_id: number; destinatarios_ids: number[] };
}
export type NombreEventoDominio = keyof EventosDominio
```

Códigos nuevos en `shared/errores.ts`: `OT_CERRADA: 409` ("La OT está cerrada o cancelada"), `OT_TIPO_BLOQUEADO: 409` ("El tipo solo se cambia en Borrador"), `MENSAJE_YA_COPIADO: 409`. Se reutilizan `TRANSICION_INVALIDA` (con `detalles.entidad = 'ot'`), `OT_ABIERTA`, `TICKET_CERRADO`, `VALIDACION`.

### 3.3 Núcleo compartido nuevo en la API (3A)

- `modulos/ots/ots.acceso.ts` (para que 3B y 3C avancen en paralelo): `bloquearOt(tx, id): Promise<{ id, codigo, ticket_id, tipo, etapa, cliente_id, final: boolean }>` (`SELECT … FOR UPDATE`, 404 `NO_ENCONTRADO` "OT no encontrada"), `otCerrada(): ErrorApp('OT_CERRADA')`, `registrarActividadEnOt(tx, id)` (`UPDATE ot SET actualizado_en = now()`), `existeOt(m, id)`.
- `core/eventos/dominio.ts` (ADR 0008): `publicar<N extends NombreEventoDominio>(nombre: N, datos: EventosDominio[N]): void` sobre un `EventEmitter` tipado (`eventosDominio.on(nombre, fn)`); en esta fase el único oyente es un `logger.debug({ evento: nombre, ...ids }, 'evento de dominio')`. Se llama **después** del commit (ADR 0003): los servicios devuelven del `enTransaccion` una lista `pendientes: [nombre, datos][]` y la publican al salir. Test: `publicar` llega a un oyente registrado con los datos.
- `archivos.service.ts`: `DestinoArchivo.entidad: 'ticket' | 'ot'`; `archivosDe(m, entidad, entidad_id)` acepta `'ot'` (misma exclusión de `mensaje_id`; el filtro de `correo_adjunto` solo aplica a `'ticket'`); `prepararDescarga`: `entidad = 'ot'` → cualquier usuario autenticado (B10), misma auditoría de `attachment`.
- `test/fabricas.ts`: `crearOt(ticket_id, { tipo?, etapa?, titulo?, responsable_tecnico_id?, cliente_id?, aprobador_id?, estado_facturacion?, contrato_id?, resolvio_ticket?, resumen_cierre?, numero? })` inserta directo con `numero` desde 9000 y `codigo = OT-<numero>`, rellenando lo que exigen los `CHECK` (cerrada → resumen/resolvió/cerrada_en; cancelada → motivo; `estado_facturacion` coherente con el tipo); `crearTarea(destino: number | { ot_id: number }, …)` (número = ticket como hoy); `crearMensaje(destino: number | { ot_id: number }, …)`; `crearContacto(cliente_id, { aprueba_cotizaciones? })`; `crearBolsa(cliente_id, { vigente_desde?, horas_mes? })`.

## 4. OT API (bloque 3B, `modulos/ots/`)

### 4.1 Endpoints

| Método y ruta | Permiso | Entrada | Salida | Errores / notas |
|---|---|---|---|---|
| `POST /api/tickets/:id/convertir-en-ot` | tickets.editar | `OtCrearEntrada` | 201 `OtSalida` | ver 4.2; 409 `TICKET_CERRADO`; se declara en `ots.routes.ts` (el servicio vive en `ots`) |
| `GET /api/ots` | sesion | `OtsQuery` | paginado de `OtResumen` | ver 4.3 |
| `GET /api/ots/:id` | sesion | — | `OtSalida` | 404 |
| `PATCH /api/ots/:id` | tickets.editar | `OtEditarEntrada` | `OtSalida` | ver 4.4; 409 `OT_CERRADA`; 409 `OT_TIPO_BLOQUEADO` |
| `POST /api/ots/:id/cambiar-etapa` | tickets.editar | `CambioEtapaOt` | `OtSalida` | ver 4.5; 409 `TRANSICION_INVALIDA` |
| `POST /api/ots/:id/aprobar` | ots.aprobar | `AprobarOtEntrada` | `OtSalida` | interna `borrador → aprobada` (B8); con `iniciar` sigue a `en_ejecucion` en la misma transacción; en facturable → 409 `TRANSICION_INVALIDA` ("Una OT facturable se aprueba con la aprobación del cliente") |
| `PUT /api/ots/:id/aprobacion` | ots.aprobar | `AprobacionClienteEntrada` | `OtSalida` | facturable `cotizada → aprobada` registrando `aprobacion_cliente`; ver 4.6 |
| `POST /api/ots/:id/cancelar` | ots.cerrar | `CancelarOt` | `OtSalida` | desde cualquier etapa no final; ver 4.7 |
| `POST /api/ots/:id/facturar` | ots.facturar | `FacturarOt` | `OtSalida` | solo `estado_facturacion = 'por_facturar'` (→ 409 `TRANSICION_INVALIDA` `{ entidad: 'ot', campo: 'estado_facturacion' }`); `UPDATE facturada, n_factura, facturada_en, facturada_por`; evento `cambio` en `estado_facturacion` ("Por facturar" → "Facturada") con `datos: { n_factura }` |
| `POST /api/ots/:id/archivos` | tickets.editar | `ArchivosOtEntrada` | `ArchivoSalida[]` (los de la OT) | `asociarArchivos(tx, ids, { entidad: 'ot', entidad_id })`; 409 `OT_CERRADA`; evento `archivos_agregados { n, nombres }` |
| `POST /api/ots/:id/cerrar` | ots.cerrar | `CierreOt` | `OtSalida` | bloque 3D, §7 |
| `GET/POST /api/ots/:id/tareas`, `GET/POST /api/ots/:id/mensajes`, `GET /api/ots/:id/actividad`, `POST /api/mensajes/:id/copiar-al-ticket` | | | | bloque 3C, §6 |

### 4.2 Convertir ticket en OT (`convertirEnOt(actor, ticket_id, e)`) — un solo `enTransaccion`

1. `bloquearTicket`; si `cerrado_en` no es null → 409 `TICKET_CERRADO` ("Reabre el ticket para crear una OT"). Se permite aunque el ticket ya tenga OT abiertas (spec 4.5: varias OT por ticket; "Crear otra OT" usa este mismo endpoint).
2. Validar: `responsable_tecnico_id` (o, si es null, el principal del ticket; puede quedar null) activo → 400 `VALIDACION`. `descuenta_bolsa = true` exige `tipo = 'facturable'`, `ticket.cliente_id` no nulo y bolsa **vigente** de ese cliente (`contrato_bolsa` con `vigente_desde ≤ hoy ≤ COALESCE(vigente_hasta, ∞)` en Santiago) → si no, 400 `VALIDACION { descuenta_bolsa: ['El cliente no tiene bolsa vigente'] }`.
3. `siguienteNumero(tx, 'ot', fuenteNumeros)` (§4.8).
4. `INSERT ot`: `ticket_id`, `tipo`, `etapa = 'borrador'`, `titulo = e.titulo ?? ticket.asunto`, `alcance`, `responsable_tecnico_id`, `cliente_id = ticket.cliente_id`, `contacto_id = NULL`, `area_solicitante = nombre del cliente si es_interno, si no NULL` (solo para `interna`), `contrato_id` (paso 2), `estado_facturacion = estadoFacturacionInicial(tipo)`, `creado_por = actor`.
5. **Tareas abiertas pasan a la OT** (spec 4.4): `UPDATE tarea SET ticket_id = NULL, ot_id = $ot, orden = <correlativo desde 1 conservando el orden previo>, actualizado_en = now() WHERE ticket_id = $t AND NOT hecha RETURNING id, titulo`. Las hechas se quedan en el ticket.
6. Eventos: en el **ticket** `convertido_en_ot { ot_id, codigo, tipo, tareas_traspasadas: n }` (valor_nuevo `"OT-0218 · Facturable"`); en la **OT** `creada { desde_ticket: { id, codigo }, codigo, tipo, tareas_traspasadas: n }`; si `n > 0`, además `tareas_traspasadas { desde: 'TK-1048', n, titulos }` en la OT (ADR 0003).
7. `registrarActividadEnTicket(tx, ticket_id)`. Si `tipo = 'interna'` y (por PATCH posterior) hay `aprobador_id`, se publica `ot.por_aprobar` (ver 4.4). Devolver `cargarOt(tx, id)`.

El estado del ticket **no cambia** al convertir (decisión §16).

### 4.3 Listado (`listarOts(actor, q)`, `ots.consulta.ts`)

Una consulta con `JOIN ticket`, `LEFT JOIN cliente`, `LEFT JOIN usuario` (responsable, aprobador), subconsultas para `horas` (`COALESCE(SUM(horas_estimadas),0)`, `SUM(horas_reales)`, `SUM(registro_horas.horas)`), `n_mensajes`, `vencida = termino < hoy_santiago AND etapa NOT IN finales`. Filtros: `q` (dígitos → `numero`/`codigo`; texto → `titulo`, `codigo`, `ticket.codigo`, `cliente.nombre` `ILIKE`), `ticket_id`, `cliente_id`, `tipo`, `etapa`, `estado_facturacion`, `abiertas=true` (`etapa NOT IN ('cerrada','cancelada')`), `responsable_id`, `aprobador_id`. Orden `-actualizado_en` (defecto), `-creado_en`, `termino` (nulos al final); nunca por `numero` (ADR 0014). `cargarOt(m, id)` arma `OtSalida` con `tareas` (por `orden`), `archivos` (`archivosDe(m, 'ot', id)`), `aprobacion` (join `contacto`, `archivoDeId`), `bolsa` (`usadas_mes = SUM(registro_horas.horas)` de las OT con ese `contrato_id` cuya `fecha` cae en el mes calendario actual en Santiago; ADR 0015), `ticket_origen` (responsables/seguidores del ticket y `otras_ots_abiertas` = OT del mismo ticket, distintas de esta, con etapa no final), `cotizacion: null`, `costo_interno: null`, `neto: null`.

### 4.4 Editar (`editarOt(actor, id, e)`)

`bloquearOt`; etapa final → 409 `OT_CERRADA`. Reglas:
- `tipo` presente y distinto: solo en `borrador` (si no, 409 `OT_TIPO_BLOQUEADO`). Al pasar a `interna`: `estado_facturacion = 'no_aplica'`, `contrato_id`, `contacto_id`, `oc_cliente`, `condicion_pago` → NULL. Al pasar a `facturable`: `estado_facturacion = 'pendiente'`, `centro_costo`, `area_solicitante`, `aprobador_id` → NULL. Campos del otro tipo enviados en la misma petición → 400 `VALIDACION` por campo ("No aplica a una OT interna/facturable").
- `cliente_id`: solo en `borrador` (409 `OT_TIPO_BLOQUEADO` con mensaje "El cliente solo se cambia en Borrador"); activo (400); al cambiar, `contacto_id` y `contrato_id` → NULL (ADR 0015).
- `contacto_id`: debe pertenecer a `ot.cliente_id` y estar activo (400). `aprobador_id`: usuario activo con permiso `ots.aprobar` (rol `admin` o `coordinacion`; 400 "Debe poder aprobar OT"). `responsable_tecnico_id`: activo (400).
- `descuenta_bolsa`: `true` → misma validación que 4.2 y `contrato_id = contrato vigente`; `false` → NULL.
- `registrarCambios` con campos: `tipo` (etiqueta), `titulo`, `alcance` (recortado a 120), `responsable_tecnico` (nombre), `cliente` (nombre), `contacto` (nombre), `inicio`, `termino` (`formatearFecha`), `oc_cliente`, `condicion_pago`, `descuenta_bolsa` ("sí"/"no"), `centro_costo`, `area_solicitante`, `aprobador` (nombre). Si `aprobador_id` cambia a un valor no nulo y la OT es interna en `borrador`, tras el commit se publica `ot.por_aprobar`.

### 4.5 Etapas sin permiso especial (`cambiarEtapa(actor, id, p)`)

`bloquearOt`; `puedeCambiarEtapa(tipo, etapa, p.etapa)` o 409 `TRANSICION_INVALIDA { entidad: 'ot', desde, hasta, permitidas: transicionesEtapaDesde(tipo, etapa) }`. Reglas adicionales:
- `cotizada` (facturable): exige `cliente_id` de un cliente **externo** (`es_interno = false`) → si no, 400 `VALIDACION { cliente_id }`. En esta fase es una **marca manual** ("Marcar como cotizada": la cotización se hizo fuera de la app); la Fase 4 la disparará al enviar la cotización (§16, §18).
- `borrador` (desde `cotizada`): permitido (rechazo del cliente, ADR 0004); la `aprobacion_cliente` no existe aún en `cotizada`, no hay nada que borrar.
- `en_ejecucion` (desde `aprobada`): sin condiciones. Fija `inicio = hoy` (Santiago) si era null.
Un solo evento `cambio` en `etapa` (etiquetas: "Borrador" → "Cotizada") con `datos = null`. `registrarActividadEnOt`.

### 4.6 Aprobaciones

- **Interna** (`aprobarOt`, `ots.aprobar`): etapa debe ser `borrador` de una `interna` (si no, 409 `TRANSICION_INVALIDA`). `UPDATE etapa = 'aprobada', aprobada_por = actor, aprobada_en = now()`. Cualquier usuario con `ots.aprobar` puede aprobar aunque `aprobador_id` sea otra persona (decisión §16, pregunta §18). Evento `cambio etapa` ("Borrador" → "Aprobada") con `datos: { aprobada_por: nombre }`. Si `iniciar`, en la misma transacción `aprobada → en_ejecucion` con su propio evento (dos eventos).
- **Cliente** (`registrarAprobacionCliente`, `ots.aprobar`): OT `facturable` en `cotizada` (si no, 409 `TRANSICION_INVALIDA`; una OT ya aprobada tiene fila en `aprobacion_cliente` y no está en `cotizada`). `contacto_id` activo y del `ot.cliente_id` (400 `VALIDACION`; `aprueba_cotizaciones` es informativo, no se exige: §16). `archivo_id`: pendiente del actor (`asociarArchivos(tx, [archivo_id], { entidad: 'ot', entidad_id })`; el respaldo queda en la galería de la OT). `INSERT aprobacion_cliente`; `UPDATE etapa = 'aprobada', aprobada_por = actor, aprobada_en = now(), contacto_id = COALESCE(contacto_id, $contacto)`. Evento `cambio etapa` ("Cotizada" → "Aprobada por cliente") con `datos: { contacto: nombre, fecha, forma, archivo_id }`. `iniciar` como arriba.

### 4.7 Cancelar (`cancelarOt`, `ots.cerrar`)

`bloquearTicket` → `bloquearOt`. Etapa no final (si no, 409 `TRANSICION_INVALIDA`). `UPDATE etapa = 'cancelada', motivo_cancelacion, cancelada_en = now(), estado_facturacion = 'no_aplica'` (una OT cancelada no se factura, aunque sea facturable). Las tareas no hechas **se quedan en la OT** (no vuelven al ticket; §16). Evento `cambio etapa` (… → "Cancelada") con `datos: { motivo }`; evento en el ticket `ot_cancelada { ot_id, codigo, motivo }`; `registrarActividadEnTicket`. Tras el commit: `publicar('ot.cancelada', { ot_id, ticket_id, destinatarios_ids })`.

### 4.8 Numeración conectada (`core/numeracion/fuente.ts`)

`fuenteNumeros` deja de delegar en `fuenteNumerosFase1`: `'ot'` → `ultimoUsado = SELECT max(numero) FROM ot`, `usados = count(*) WHERE numero >= contador.inicial`, `existe = SELECT 1 FROM ot WHERE numero = $1`. `fuenteNumerosFase1` se elimina de `fuente.ts` (queda en `numeracion.ts` solo si sus tests la usan; si nada la usa, se borra con su test). Tests: dos conversiones → `OT-0200`, `OT-0201`; `PUT /api/config/numeracion` con `ot.inicial ≤ MAX(numero)` → 400 `NUMERACION_INICIAL_MENOR`; una conversión que falla tras `siguienteNumero` (bolsa no vigente) no consume número.

### 4.9 Cambios en `modulos/tickets` (mismo bloque)

- `otsAbiertas(tx, ticket_id)`: `SELECT id, codigo, etapa FROM ot WHERE ticket_id = $1 AND etapa NOT IN ('cerrada','cancelada') ORDER BY creado_en`.
- `cambiarEstado`: la comprobación de OT abiertas se aplica a **los tres estados cerrados** (`esCerrado(p.estado)`), no solo a `resuelto` (§16, cambio propuesto a ADR 0004). El cuerpo se extrae a `cambiarEstadoEnTx(tx, actor, id, payload, opciones?: { ticket?: FilaBloqueada })` exportada (la usa el cierre de OT con el ticket ya bloqueado); `cambiarEstado` la envuelve en `enTransaccion`. Ídem `guardarResponsablesEnTx(tx, actor, id, e)`.
- `tickets.consulta.ts`: `SELECT_RESUMEN` gana `ot_vinculada` = la OT del ticket **abierta más reciente**; si no hay abiertas, la **cerrada** más reciente; nunca una cancelada (`ORDER BY (etapa IN ('cerrada')) ASC, creado_en DESC LIMIT 1` sobre `etapa <> 'cancelada'`, como `json_build_object('id','codigo','tipo')`). `tipo` = `'ticket'` sin vinculada, `'ot_facturable'` / `'ot_interna'` según `ot_vinculada.tipo`. `TicketSalida.ots` = todas las OT del ticket (`OtBreve`, incluidas canceladas) por `creado_en DESC`. Filtros: `con_ot=true` → `EXISTS (ot no cancelada)`, `con_ot=false` → `NOT EXISTS`; `tipo` (lista) → `CASE` sobre la vinculada (`'ticket'` = sin vinculada). El Tablero acepta `tipo` y `con_ot`.
- Convertir se declara en `ots.routes.ts`, pero `tickets.routes.ts` no cambia.

## 5. Archivos de OT (3A + 3B)

Galería de la OT = `OtSalida.archivos` (propios) + archivos de los mensajes de la OT (vienen en cada `MensajeSalida`) + los del ticket de origen (`correo.archivo`, `correo.adjuntos`, `archivos` de `GET /api/tickets/:id`), compuesta **en el front** (§10.4; sin endpoint agregado, §16). `POST /api/ots/:id/archivos` asocia pendientes propios del actor (foto/documento; un archivo `categoria = 'correo'` también se acepta). Descarga por `GET /api/archivos/:id` con las reglas de §3.3.

## 6. Tareas, mensajes y horas de OT (bloque 3C)

### 6.1 Tareas (`modulos/tareas/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `GET /api/ots/:id/tareas` | sesion | — | `TareaSalida[]` por `orden` | 404 si no existe la OT |
| `POST /api/ots/:id/tareas` | tickets.editar | `TareaEntrada` | 201 `TareaSalida` | `bloquearOt`; 409 `OT_CERRADA`; `orden = max+1` por OT; evento `tarea_creada { tarea_id, titulo, responsable, horas_estimadas }` con `entidad = 'ot'` |
| `PATCH /api/tareas/:id` | tickets.editar | `TareaEditarEntrada` | `TareaSalida` | el servicio detecta el destino (`ticket_id` u `ot_id`) y bloquea ticket **o** OT; `horas_estimadas`/`horas_reales` solo en tareas de OT (en ticket → 400 `VALIDACION`); cambios de horas van en `tarea_editada.cambios` (`"3 h" → "4 h"`); marcar/desmarcar se permite con OT cerrada o cancelada; editar título/responsable/fecha/horas con OT final → 409 `OT_CERRADA` |
| `DELETE /api/tareas/:id` | tickets.editar | — | 204 | 409 `OT_CERRADA` / `TICKET_CERRADO` según destino |

`POST /api/tickets/:id/tareas` con `horas_estimadas` no nulo → 400 `VALIDACION { horas_estimadas: ['Solo en tareas de OT'] }`. `SELECT_TAREA` devuelve `ot_id`, `horas_estimadas::float8`, `horas_reales::float8`. `registrarActividadEnOt` tras cada mutación de tarea de OT. `moverTareasAbiertas(tx, desde: { ticket_id } | { ot_id }, hacia: { ot_id }): Promise<{ id; titulo }[]>` exportada para conversión y cierre con `nueva_ot` (renumera `orden` desde 1 en la OT destino, después de las que ya tenga).

### 6.2 Mensajes y actividad (`modulos/mensajes/`)

| Método y ruta | Permiso | Entrada | Salida | Notas |
|---|---|---|---|---|
| `POST /api/ots/:id/mensajes` | tickets.editar | `MensajeEntrada` | 201 `MensajeSalida` | `bloquearOt` (permitido con OT cerrada/cancelada, como en tickets); `asociarArchivos(…, { entidad: 'ot', entidad_id, mensaje_id })`; menciones igual; `horas` → `registrarHorasDesdeMensaje(tx, { usuario_id, ot_id, mensaje_id, horas })`; `registrarActividadEnOt`. Con `copiar_al_ticket: true` (solo OT; en ticket → 400): en la **misma transacción** se ejecuta `copiarAlTicket` (abajo) |
| `GET /api/ots/:id/mensajes` | sesion | `MensajesQuery` | `MensajeSalida[]` | |
| `GET /api/ots/:id/actividad` | sesion | `ActividadQuery` | `ActividadSalida` | mensajes con `ot_id` ∪ eventos `entidad = 'ot'`; mismo orden y conteos que el ticket (`actividadDe(m, destino, q)` generaliza `actividadDeTicket`) |
| `POST /api/mensajes/:id/copiar-al-ticket` | tickets.editar | — | 201 `MensajeSalida` (la copia) | 404 si el mensaje no es de una OT; 409 `MENSAJE_YA_COPIADO` si ya tiene copia |

`copiarAlTicket(tx, actor, mensaje)`: bloquea el **ticket** de la OT (`ot.ticket_id`) y luego la OT (orden §1.2); inserta en el ticket un mensaje con el mismo `tipo`, `texto`, `autor_id = autor original`, `horas = NULL` (las horas ya están registradas en la OT), `copiado_desde_id = mensaje.id`; **no** duplica filas de `archivo` ni `mencion`: `aSalidas` resuelve los `archivos` de un mensaje con `copiado_desde_id` desde el mensaje de origen (misma `clave`, un solo archivo en disco) y `mencionados = []`. Evento en el ticket `seguimiento_copiado { mensaje_id: copia, desde_mensaje_id, ot_id, codigo }`; `registrarActividadEnTicket(tx, ticket_id, { respuesta: tipo === 'seguimiento' })`. La copia se permite aunque el ticket esté cerrado (como cualquier mensaje). `MensajeSalida.copiado_de` se rellena con `ot { id, codigo }` del mensaje origen; `copiado_al_ticket = EXISTS (mensaje WHERE copiado_desde_id = m.id)`.

### 6.3 Horas (`modulos/horas/`)

`registrarHorasDesdeMensaje(tx, d: { usuario_id; mensaje_id; horas } & ({ ticket_id } | { ot_id }))`. Sin rutas (Fase 5). `OtResumen.horas.registradas` = `SUM(horas)` con `ot_id`. Test: seguimiento en OT con `horas: 3` → fila con `ot_id` y `ticket_id NULL`; la OT devuelve `horas.registradas = 3`.

## 7. Cierre de OT (bloque 3D, `ots.cierre.service.ts`) — spec 4.6, ADR 0004

`POST /api/ots/:id/cerrar` (`ots.cerrar`), `cerrarOt(actor, id, p: CierreOtDatos)`, **un solo `enTransaccion`**:

1. `bloquearTicket(ot.ticket_id)` → `bloquearOt(id)` (la OT se lee primero sin bloqueo para conocer `ticket_id`; tras bloquear se relee). Etapa ≠ `en_ejecucion` → 409 `TRANSICION_INVALIDA { entidad: 'ot', desde, hasta: 'cerrada', permitidas }`.
2. Contexto: `ContextoCierreOt` con responsables/seguidores del ticket (nombres), `neto: null`, `responsable_siguiente` = nombre de `p.siguiente.responsable_id` (activo; si no, 400 `VALIDACION { responsable_id }`). `efectos = efectosCierreOt(ctx, p)`.
3. Si `p.resolvio_ticket`: `otsAbiertas(tx, ticket_id)` **excluyendo esta OT**; si hay otras → 409 `OT_ABIERTA { ots }` (nada se escribe). Si el ticket ya está cerrado (descartado/duplicado mientras la OT seguía abierta no puede ocurrir por 4.9; `resuelto` tampoco) → 409 `TICKET_CERRADO`.
4. `UPDATE ot SET etapa = 'cerrada', resolvio_ticket, resumen_cierre, cerrada_en = now(), cerrada_por = actor, estado_facturacion = efectos.estado_facturacion_final, termino = COALESCE(termino, hoy), actualizado_en = now()`.
5. Mensaje **seguimiento en la OT** con `texto = resumen`, `autor = actor`; mensaje seguimiento **en el ticket** con `copiado_desde_id` = el anterior (se ve como "Cierre de OT-0218" en la actividad del ticket, §10.5) → `registrarActividadEnTicket(…, { respuesta: true })`.
6. Eventos: OT `cambio etapa` ("En ejecución" → "Cerrada") con `datos: { resolvio_ticket, siguiente: p.siguiente ?? null }`; si facturable, OT `cambio estado_facturacion` ("Pendiente" → "Por facturar"); ticket `ot_cerrada { ot_id, codigo, resolvio_ticket, siguiente, resumen: recortar(resumen, 300) }` (valor_nuevo `"OT-0218 cerrada · resolvió el ticket"` / `"… · no resolvió el ticket"`).
7. Ticket:
   - `resolvio_ticket: true` → `cambiarEstadoEnTx(tx, actor, ticket_id, { estado: 'resuelto' })` (genera su `cambio estado`; la OT ya está `cerrada`, por lo que `otsAbiertas` no la ve).
   - `en_curso` → si `ticket.estado !== 'en_curso'`, `cambiarEstadoEnTx({ estado: 'en_curso' })`; luego `guardarResponsablesEnTx` con `principal_id = responsable_id` y `otros_ids` = responsables actuales sin él (el principal anterior pasa a "otros" si era distinto).
   - `en_espera` → `cambiarEstadoEnTx({ estado: 'en_espera', espera_de, espera_detalle })` (`puedeTransicionar` exige destino distinto; si ya estaba `en_espera`, solo se actualizan `espera_de/detalle` con un `UPDATE` y evento `cambio` en `estado` "En espera" → "En espera · repuesto"); responsables como arriba.
   - `nueva_ot` → `siguienteNumero('ot')`; `INSERT ot` en `borrador`, mismo `tipo`, `cliente_id`, `contacto_id`, `contrato_id`, `centro_costo`, `area_solicitante`, `aprobador_id`, `titulo = ot.titulo`, `alcance = ot.alcance`, `responsable_tecnico_id = responsable_id`, `estado_facturacion = estadoFacturacionInicial(tipo)`; `moverTareasAbiertas({ ot_id: cerrada }, { ot_id: nueva })`; eventos `creada { desde_ticket, desde_ot: { id, codigo }, tareas_traspasadas }` en la nueva y `convertido_en_ot { …, desde_ot }` en el ticket; ticket → `en_curso` si no lo está y responsables como arriba. La respuesta `OtSalida` de la OT cerrada incluye en `ticket_origen.otras_ots_abiertas` la nueva (el front la enlaza en el toast: "OT-0220 creada").
8. Tras el commit: `publicar('ot.cerrada', { ot_id, ticket_id, resolvio_ticket, destinatarios_ids })` y, si facturable, `publicar('ot.por_facturar', { ot_id })`. Los avisos llegan en la Fase 6.

**Rollback**: cualquier error (400 por responsable inexistente, 409 `OT_ABIERTA`, fallo de BD) deja OT, ticket, tareas, mensajes y eventos intactos (test: `count(*)` de `mensaje`, `evento`, `tarea` iguales antes y después; `ot.etapa = 'en_ejecucion'`).

## 8. Eventos y auditoría generados en esta fase

| Acción | `evento` `entidad = 'ticket'` | `evento` `entidad = 'ot'` | `auditoria` | evento de dominio (tras commit) |
|---|---|---|---|---|
| Convertir en OT / Crear otra OT | `convertido_en_ot { ot_id, codigo, tipo, tareas_traspasadas, desde_ot? }` | `creada { desde_ticket, codigo, tipo, tareas_traspasadas, desde_ot? }` + `tareas_traspasadas { desde, n, titulos }` si n > 0 | — | `ot.por_aprobar` si interna con `aprobador_id` |
| PATCH OT | — | `cambio` por campo de §4.4 | — | `ot.por_aprobar` si cambia `aprobador_id` |
| Cambiar etapa, aprobar, aprobación del cliente | — | `cambio` campo `etapa` (+ `datos`) | — | — |
| Cancelar | `ot_cancelada { ot_id, codigo, motivo }` | `cambio etapa` → Cancelada `{ motivo }` | — | `ot.cancelada` |
| Cerrar (§7) | `ot_cerrada {…}` + `cambio estado` del ticket (+ responsables, + `convertido_en_ot` si nueva OT) | `cambio etapa` → Cerrada, `cambio estado_facturacion` si facturable | — | `ot.cerrada`, `ot.por_facturar` |
| Facturar | — | `cambio estado_facturacion` → Facturada `{ n_factura }` | — | — |
| Tareas de OT | — | `tarea_creada`, `tarea_editada`, `tarea_hecha`, `tarea_reabierta`, `tarea_quitada` | — | — |
| Archivos a la OT | — | `archivos_agregados { n, nombres }` | — | — |
| Seguimiento / nota / horas en OT | — | — (el mensaje es el registro) | — | — |
| Copiar al ticket | `seguimiento_copiado { mensaje_id, desde_mensaje_id, ot_id, codigo }` | — | — | — |
| Descargar archivo de OT como `attachment` | — | — | `descarga_archivo { archivo_id, entidad: 'ot', entidad_id }` | — |

Cobertura (ADR 0003): `ots/eventos.test.ts` ejecuta cada endpoint mutante de OT (`convertir-en-ot`, `PATCH`, `cambiar-etapa`, `aprobar`, `aprobacion`, `cancelar`, `facturar`, `archivos`, `cerrar`, `POST/PATCH/DELETE tareas` de OT) y afirma que `count(*) FROM evento WHERE entidad = 'ot' AND entidad_id = $id` aumenta; que `convertir`, `cancelar`, `cerrar` y `copiar-al-ticket` aumentan también los del ticket; y que `POST mensajes` de OT no crea `evento`.

## 9. Pruebas de seguridad obligatorias (`ots/seguridad.test.ts`, bloque 3D)

1. Test genérico de permisos (Fase 1) verde con las rutas nuevas: sin sesión → 401 en todas.
2. **Roles**: `lectura` → 403 en toda mutación de OT y 200 en `GET /api/ots`, `GET /api/ots/:id`, `GET …/actividad` (incluidas notas internas, B10) y descarga de un archivo de OT. `tecnico` → 201 `convertir-en-ot`, 200 `PATCH`, `cambiar-etapa`, `POST tareas/mensajes/archivos`, `copiar-al-ticket`; **403** en `aprobar`, `PUT aprobacion`, `cerrar`, `cancelar`, `facturar`. `coordinacion` y `admin` → 200 en las cinco.
3. **Máquina**: interna `borrador → cotizada` → 409 `TRANSICION_INVALIDA`; `cambiar-etapa { etapa: 'cerrada' }` → 400 (Zod); `cerrar` desde `aprobada` → 409; `aprobar` una facturable → 409; `PUT aprobacion` en `borrador` → 409; `facturar` una interna o una `pendiente` → 409; segunda aprobación del cliente → 409.
4. **Tipo**: `PATCH { tipo }` en `cotizada` → 409 `OT_TIPO_BLOQUEADO`; en `borrador` → 200 y `estado_facturacion`/campos del otro tipo limpiados (evento `cambio tipo`); `PATCH { centro_costo }` en facturable → 400.
5. **Bolsa** (ADR 0015): `descuenta_bolsa: true` sin bolsa vigente → 400; con bolsa → `bolsa.contrato_id` y `usadas_mes` suma solo horas de OT con ese contrato en el mes; interna con `descuenta_bolsa` → 400.
6. **B1**: ticket con OT en `en_ejecucion` → `cambiar-estado` a `resuelto`, `descartado` y `duplicado` → 409 `OT_ABIERTA { ots: [{ id, codigo, etapa }] }`; tras cerrar o cancelar la OT → 200.
7. **Cierre, ambos caminos**: (a) `resolvio_ticket: true` → OT `cerrada`, `por_facturar` (facturable) / `no_aplica` (interna), ticket `resuelto` con `cerrado_en`, seguimiento en OT y en ticket (`copiado_de.ot.codigo`), eventos `ot_cerrada` y `cambio estado`; (b) `en_curso` con responsable nuevo → ticket `en_curso`, principal cambiado, el anterior en otros; (c) `en_espera` con `espera_de: 'repuesto'` → ticket `en_espera`; (d) `nueva_ot` → nueva OT `borrador` del mismo tipo con las tareas no hechas de la cerrada (la cerrada queda solo con las hechas), `OT-0201`, evento `convertido_en_ot` con `desde_ot`, ticket `en_curso`; (e) `resolvio: true` con otra OT abierta → 409 `OT_ABIERTA`; (f) resumen vacío → 400; (g) **rollback** con `responsable_id` inexistente.
8. **Cancelar**: desde `borrador`, `cotizada`, `en_ejecucion` → 200 con `no_aplica`; desde `cerrada` → 409; ticket recibe `ot_cancelada`; sin motivo → 400.
9. **Aprobación del cliente**: sin `archivo_id` → 400; `archivo_id` pendiente de otro usuario → 400 `VALIDACION`; contacto de otro cliente → 400; correcto → `aprobacion.archivo` en la galería con `entidad = 'ot'` y `etapa = 'aprobada'`; `iniciar: true` → `en_ejecucion` con dos eventos.
10. **Aprobación interna**: `aprobador_id` de un `tecnico` en PATCH → 400; `aprobar` por `coordinacion` distinto del aprobador → 200 (`aprobada_por` = actor).
11. **Tareas**: conversión mueve solo las no hechas (ticket conserva las hechas; `TareaSalida.ot_id`); `horas_estimadas` en tarea de ticket → 400; marcar tarea de OT `cerrada` → 200; editar título → 409 `OT_CERRADA`.
12. **Copiar al ticket**: `copiar_al_ticket: true` crea las dos filas en una transacción (con `copiado_de` y archivos resueltos desde el origen, sin filas `archivo` nuevas); segundo `copiar-al-ticket` → 409 `MENSAJE_YA_COPIADO`; `copiar_al_ticket: true` en un ticket → 400.
13. **Archivos**: `POST /api/ots/:id/archivos` con pendiente ajeno → 400; descarga de un `.pdf` de OT audita `descarga_archivo { entidad: 'ot' }`; imagen inline no.
14. **Listados**: `TicketResumen.ot_vinculada` prefiere la abierta más reciente y luego la cerrada; una cancelada no vincula; `con_ot=true`, `tipo=ot_interna`, `tipo=ticket` filtran; `GET /api/ots?abiertas=true`, `estado_facturacion=por_facturar`, `q=218`, `q=OT-0218`, `cliente_id`, `ticket_id`.
15. **Texto**: resumen `'<img src=x onerror=alert(1)>'` se guarda y se devuelve literal en OT y ticket.
16. **Logs**: cerrar una OT y crear un seguimiento no dejan en el logger de test `resumen`, `texto` ni `nombre_original` (solo ids).
17. **Eventos de dominio**: `ot.cerrada` llega al oyente con `destinatarios_ids` = responsables ∪ seguidores sin repetidos; no se publica si la transacción falla.
18. `X-Request-Id` presente en 409 y `evento.req_id` de un cierre coincide con la cabecera.

## 10. Web OT (bloque 3E)

### 10.1 API del front (`features/ots/api.ts`)

`ots(query)`, `ot(id)`, `convertirEnOt(ticketId, entrada)`, `editarOt`, `cambiarEtapa`, `aprobarOt`, `registrarAprobacion`, `cancelarOt`, `facturarOt`, `cerrarOt`, `agregarArchivos`, `actividadOt(id, tipo)`, `crearMensajeOt`, `copiarAlTicket(mensajeId)`, `tareasOt`, `crearTareaOt` (`editarTarea`/`quitarTarea` se reutilizan de tickets). Claves: `['ots', query]`, `['ot', id]`, `['ot', id, 'actividad', tipo]`. `invalidarOt(queryClient, id, ticketId)`: `['ot', id]`, `['ots']`, `['ticket', ticketId]`, `['tickets']`, `['tablero']`. 3F importa solo `convertirEnOt`, `ots` e `invalidarOt` (firmas fijadas aquí).

### 10.2 Componentes de dominio (`components/dominio/`)

- `PillEtapaOt({ etapa })`: `borrador → neutro`, `cotizada → acento`, `aprobada → resuelto`, `en_ejecucion → acento`, `cerrada → neutro`, `cancelada → neutro` con `line-through`. `PillTipoOt({ tipo })`: `facturable → resuelto` "Facturable", `interna → interna` "Interna". `PillFacturacion({ estado })`: `por_facturar → alta` (negrita), `facturada → resuelto`, `pendiente → neutro`, `no_aplica` → texto "No aplica" sin pill. `PillTipo` (existente) pasa a mostrar `ot_vinculada` cuando se le da: `PillTipo({ tipo, codigo? })` → "OT-0218 · Facturable".
- `Etapas({ ot })`: stepper horizontal con `pasoVisual`; cada paso es un `li` con número, etiqueta y `aria-current="step"` en el actual; pasos hechos con fondo `tinta`, actual con borde `acento`, futuros en `tinta-3`; cancelada muestra un aviso "Cancelada · {motivo}" en lugar del stepper. Bajo 640 px: scroll horizontal (`overflow-x-auto`, sin salto de línea).
- `SelectorTipoOt({ valor, onChange, disabled })`: las dos tarjetas-radio del diseño (`Facturable · externa` verde / `Interna · no facturable` violeta) con descripción; deshabilitado con texto "El tipo solo se cambia en Borrador".
- `ListaTareas` se **generaliza**: `{ destino: { tipo: 'ticket' | 'ot'; id }, tareas, cerrado, conHoras }`. Con `conHoras`: columnas "Est." y "Real" (`input type=number step=0.25`, ancho 72 px, `font-mono`, `aria-label="Horas estimadas de <título>"`, guardan al perder el foco con `PATCH`), cabecera "Tareas · 2/4 · 10 h estimadas · 4 h reales"; la fila de alta incluye "Horas est.". Los tests existentes siguen verdes (`destino` ticket sin horas).
- `Redactor` se **generaliza**: `{ destino, onEnviado?, copiaAlTicket?: boolean }`; con `copiaAlTicket`, `Checkbox` "Copiar al ticket" (ayuda "El avance también queda en TK-1048") que envía `copiar_al_ticket: true`; en modo nota interna la casilla sigue disponible (se copia como nota).

### 10.3 Rutas

`router.tsx`: `/ots/:id` → `OtDetallePage`; `/ots` → `OtsPage` (lista mínima, §12). `menu.ts` no cambia. `TituloPagina` recibe `codigo` ("OT-0218 · Zydesk").

### 10.4 Pantalla 6 — Orden de trabajo (`features/ots/pages/OtDetallePage.tsx`)

Mobile-first (spec §7). A ≥ 1024 px: columna principal 1fr + panel derecho 340 px; bajo 1024 px el panel se apila debajo y el redactor queda fijo al pie (igual que el ticket). Diseño "Orden de trabajo OT-0218".

1. **Encabezado**: `Codigo` + `h1` título; línea con `PillTipoOt`, `PillEtapaOt`, `PillFacturacion` (solo facturable), "Ticket TK-1048" (enlace), responsable técnico (`Avatares`), término ("Termina 2 oct" / vencida en `urgente`); **acciones** según etapa, tipo y permisos (`usePermiso`):
   - Facturable `borrador`: "Marcar como cotizada" (`tickets.editar`; `AlertDialog` con "La cotización se hizo fuera de la app. El cotizador llega en la Fase 4.") · `cotizada`: "Registrar aprobación del cliente…" (`ots.aprobar`, → `DialogoAprobacionCliente`) y "Volver a borrador" · `aprobada`: "Iniciar ejecución" · `en_ejecucion`: **"Cerrar OT…"** (`ots.cerrar`, primario) · `cerrada` + `por_facturar`: "Marcar facturada…" (`ots.facturar`, → `DialogoFacturar` con `n_factura`).
   - Interna `borrador`: "Aprobar e iniciar" y "Solo aprobar" (`ots.aprobar`; sin permiso, texto "Pendiente de aprobación de {aprobador}") · `aprobada`: "Iniciar ejecución" · `en_ejecucion`: "Cerrar OT…".
   - Siempre que no sea final y con `ots.cerrar`: "Cancelar OT…" (`DialogoCancelarOt`, motivo obligatorio). Sin `tickets.editar`: "Solo lectura".
2. **Etapas** (`Etapas`).
3. **Tipo y datos** (tarjeta): `SelectorTipoOt` (habilitado solo en `borrador` y con `tickets.editar`; cambiar pide confirmación "Se limpiarán los campos del otro tipo"); formulario RHF + `zodResolver(OtEditarEntrada)` con "Guardar" (`PATCH`): Título, Alcance (`Textarea`), Responsable técnico (`SelectorPersonas`), Inicio y Término (`input type=date`); **facturable**: Cliente (`SelectorCliente`, solo en `borrador`), Contacto (`Select` con los contactos del cliente; los que aprueban cotizaciones llevan "aprueba"), N° de OC del cliente, Condición de pago, casilla **"Descuenta de la bolsa"** solo si `ticket_origen.cliente` tiene bolsa vigente (`GET /api/clientes/:id` → `bolsa.vigente`), con texto "12,5 / 20 h usadas este mes" desde `ot.bolsa`; **interna**: Área solicitante, Centro de costo, Quién aprueba (`SelectorPersonas` filtrado a roles con `ots.aprobar`). Con OT final, todo en solo lectura.
4. **Tareas** (`ListaTareas` con `conHoras`).
5. **Fotos y archivos** (`GaleriaOt`): pestañas Todo · Fotos · Documentos · Correos (por `categoria`), botones "Subir fotos" (`SubidaArchivos` con `camara`) y "Subir archivo" que suben y luego llaman a `POST /api/ots/:id/archivos`; lista compuesta (§5): propios, de mensajes ("en seguimiento del 29 sep"), respaldo de aprobación ("respaldo de aprobación") y del ticket ("desde TK-1048"). Reutiliza `GaleriaArchivos`.
6. **Actividad** con pestañas Actividad · Seguimiento · Notas internas · Historial (URL `?actividad=`), `ActividadLista` (generalizada para recibir `describirEvento` de OT), `Redactor` con `copiaAlTicket`; cada mensaje de OT con copia muestra "Copiado al ticket"; sin copia, botón "Copiar al ticket" (`tickets.editar`).
7. **Panel derecho**: **Cotización** (facturable): tarjeta con `EstadoVacio` "Cotizador disponible en la Fase 4" y botón "Crear cotización" deshabilitado; **Costo interno** (interna): "Se calcula con la tarifa de costo interno (Fase 4)" + `horas.reales`/`horas.registradas`; **Aprobación**: facturable → estado "Pendiente"/"Aprobada" con contacto, fecha, forma y enlace al respaldo; interna → aprobador y "Aprobada por … el …"; **Facturación** (facturable): `PillFacturacion`, `n_factura`, fecha; **Ticket de origen**: `Codigo` + asunto (enlace), `PillEstado`, responsables, y si `otras_ots_abiertas` > 0, la lista; **Horas**: estimadas / reales / registradas; **Datos**: creada por, fecha, cerrada por/fecha, resumen de cierre (`pre-wrap`); **Historial** resumido: últimos 5 eventos con enlace "Ver todo" a la pestaña Historial.

Estados: `Cargando`, 404 "OT no encontrada" (enlace a `/ots`), `EstadoError`; toasts por acción ("OT marcada como cotizada", "OT aprobada", "OT cerrada", "OT-0220 creada" con enlace). Errores 409 `TRANSICION_INVALIDA`/`OT_CERRADA`/`OT_TIPO_BLOQUEADO` → toast con el `mensaje` de la API y refetch. Tras cada mutación `invalidarOt`.

### 10.5 Pantalla 6b — Cerrar OT (`features/ots/components/DialogoCerrarOt.tsx`)

`Dialog` (pantalla completa bajo 640 px, `max-h-[90dvh]` con scroll) titulado "Cerrar OT-0218". Contenido, en este orden:
1. **¿Esta OT resolvió el ticket?** Dos tarjetas-radio (diseño): **Sí** (verde: "El ticket TK-1048 pasa a Resuelto") y **No, o solo en parte** (ámbar: "El ticket sigue abierto y eliges el siguiente paso"). Si `ticket_origen.otras_ots_abiertas.length > 0`, "Sí" queda deshabilitada con "El ticket tiene otras OT abiertas (OT-0220): ciérralas o cancélalas primero".
2. Con **No**: `Select` "¿Qué pasa con el ticket?" (`Vuelve a En curso` / `Pasa a En espera` / `Se crea una nueva OT vinculada`); con En espera, `Select` "¿De quién se espera?" + detalle opcional; **Responsable del siguiente paso** (`SelectorPersonas`, por defecto el principal del ticket; con nueva OT la etiqueta es "Responsable técnico de la nueva OT").
3. **Resumen de cierre** (`Textarea`, obligatorio, placeholder del diseño según Sí/No, contador 5000).
4. **Qué va a pasar**: lista `dl` con OT / TK-1048 / Historial / Avisos calculada con `efectosCierreOt` en vivo; la línea del ticket en `resuelto` (verde) o `en-espera` (ámbar) en negrita; pie en `tinta-3`: "Los avisos se activan en la Fase 6."
5. Botones: "Cancelar" y primario **"Cerrar OT y resolver ticket"** / **"Cerrar OT (ticket sigue abierto)"**, deshabilitado sin resumen o sin responsable cuando aplica; enviando → "Cerrando…". 409 `OT_ABIERTA` → reemplaza el contenido por la lista de OT con enlaces (mismo patrón que `DialogoCambiarEstado`). Éxito → toast, `invalidarOt`, y si `nueva_ot`, toast con enlace a la nueva.

En la actividad del ticket, un mensaje con `copiado_de` muestra la etiqueta "Seguimiento · desde OT-0218" (enlace) y, cuando el evento `ot_cerrada` lo precede, "Cierre de OT-0218".

### 10.6 `features/ots/eventos.ts`

`describirEventoOt(e)`: `creada` → "creó la OT desde TK-1048" (+ " a partir de OT-0218" con `desde_ot`); `cambio` campo `etapa` → "cambió la etapa" con chip "Borrador → Cotizada" y detalle (motivo de cancelación; "aprobó Camila Rojas"; "contacto Paula Herrera · orden de compra"); `cambio` campo `tipo` → "cambió el tipo"; `cambio estado_facturacion` → "marcó la OT como facturada · N° 1234"; `tareas_traspasadas` → "recibió 3 tareas de TK-1048"; `archivos_agregados` → "agregó 2 archivos"; `tarea_*` como en tickets. `describirEvento` de tickets (3F) gana `convertido_en_ot` → "convirtió el ticket en" + chip "OT-0218 · Facturable"; `ot_cerrada` → "cerró" + chip "OT-0218 · resolvió el ticket" / "… · no resolvió el ticket" con el resumen recortado como detalle; `ot_cancelada` → "canceló OT-0218" + motivo; `seguimiento_copiado` → "copió un seguimiento desde OT-0218". Tests unitarios: 8 casos de OT y 4 nuevos de ticket.

## 11. Web tickets y clientes (bloque 3F)

- **Detalle de ticket**: botón "Convertir en OT" habilitado (`tickets.editar`, ticket no cerrado; cerrado → deshabilitado "Reabre el ticket"); si `ots` tiene alguna no cancelada, el texto es "Crear otra OT". Abre `DialogoConvertirEnOt` (`features/tickets/components/`): `SelectorTipoOt`, Título (prellenado con el asunto), Responsable técnico (prellenado con el principal), Alcance opcional, casilla "Descuenta de la bolsa" si el cliente tiene bolsa vigente, aviso "Las N tareas pendientes pasarán a la OT" (cuenta las no hechas); éxito → toast "OT-0218 creada" y navegar a `/ots/:id`. Tarjeta **OT vinculadas** del panel: lista de `ots` (`Codigo` enlace, `PillTipoOt`, `PillEtapaOt`, `PillFacturacion`, "resolvió/no resolvió el ticket" en cerradas) o "Sin OT"; botón "Crear OT"/"Crear otra OT" (mismo diálogo). Encabezado: `PillTipo` con `ot_vinculada`. En la actividad, mensajes con `copiado_de` según §10.5. `DialogoCambiarEstado`: la lista de OT abiertas muestra `ETIQUETA_ETAPA_OT[etapa]`.
- **Tablero**: `TarjetaTicket` muestra `Pill` de la OT vinculada ("OT-0218 · Facturable" en `resuelto`, "OT-0215 · Interna" en `interna`), como el diseño; filtro **Tipo** habilitado (`DropdownMenu` multi: Ticket / OT facturable / OT interna → `tipo=`), en la URL.
- **Tabla**: chip **Con OT** habilitado (`con_ot=true`, con contador); columna Tipo con `PillTipo` y código; agrupar por `tipo` se agrega a `MODOS_AGRUPAR` (opcional del diseño: "Tipo").
- **Ficha de cliente**: tarjeta "Órdenes de trabajo" con `GET /api/ots?cliente_id&por_pagina=20` (`Codigo`, título, `PillTipoOt`, `PillEtapaOt`, `PillFacturacion`) y enlace "Ver todas" a `/ots?cliente_id=`.
- `features/tickets/eventos.ts`: casos nuevos de §10.6.

Tests (jsdom): el diálogo de conversión envía `tipo`, `titulo` y `responsable_tecnico_id`; la tarjeta con `ot_vinculada` muestra "OT-0218 · Facturable"; el chip Con OT cambia la URL; la ficha lista OT.

## 12. Lista mínima de OT (`features/ots/pages/OtsPage.tsx`, bloque 3E) — vista, ADR 0022

Ruta `/ots`. Chips en la URL: **Todas · Abiertas (`abiertas=true`) · Por facturar (`estado_facturacion=por_facturar`) · Facturadas · Internas (`tipo=interna`)** con contador; búsqueda `q`; tabla con OT (`Codigo` enlace a `/ots/:id`), Trabajo (título + cliente + ticket), Tipo, Etapa, Horas (`estimadas`/`registradas` en `font-mono`; el neto llega en Fase 4/6), Facturación, Responsable; paginación al pie; bajo 1024 px scroll horizontal con la primera columna fija. **Sin** indicadores en pesos, sin exportación (botón deshabilitado "Disponible en la Fase 6"), sin cambios de etapa desde la lista. Vacío: "Sin órdenes de trabajo. Se crean desde un ticket." Tests: chips cambian la URL; una OT `por_facturar` muestra la pill.

## 13. Semillas de desarrollo (bloque 3G, `database/semillas/desarrollo-ots.ts`, llamada desde `desarrollo.ts` tras `sembrarTickets`)

Idempotente por `codigo`. Inserta con `numero` explícito y al final `UPDATE contador SET valor = GREATEST(valor, 219) WHERE clave = 'ot'`. Fechas relativas a hoy (Santiago). Dos tickets nuevos en `desarrollo-tickets.ts`: **TK-1053** "Reemplazo de UPS en sala de servidores" (Operaciones, `en_curso`, media, Valentina Soto, +4 d) y **TK-1019** "Mantención preventiva trimestral" (Clínica Los Robles, `resuelto` cerrado ayer, media, Ignacia Morales, −1 d; con evento `ot_cerrada` y el seguimiento de cierre copiado). Total 18 tickets.

| OT | Ticket | Tipo | Etapa | Facturación | Responsable | Detalle |
|---|---|---|---|---|---|---|
| OT-0214 | TK-1033 | facturable | cotizada | pendiente | Fernanda Castro | Constructora Andes · contacto `[NOMBRE]`; "Renovación de plataforma de respaldo" |
| OT-0215 | TK-1037 | interna | en_ejecucion | no_aplica | Valentina Soto | centro de costo "Operaciones", área "Operaciones", aprobador Fernanda Castro (aprobada por ella), 2 tareas (8 h est.) |
| OT-0216 | TK-1019 | facturable | cerrada (resolvió) | **por_facturar** | Ignacia Morales | aprobación del cliente registrada (forma `correo`, respaldo `aprobacion_ot-0216.txt` generado), resumen "Mantención realizada en los 12 equipos; sin observaciones.", seguimiento copiado al ticket, `termino` ayer |
| OT-0217 | TK-1042 | facturable | en_ejecucion | pendiente | Camila Rojas | Constructora Andes, aprobación con `orden_de_compra` (OC "OC-4471"), 3 tareas |
| **OT-0218** | **TK-1048** | facturable | cotizada | pendiente | Sebastián Díaz | Viña Santa Clara · Paula Herrera; título "Regularización de folios de facturación electrónica"; alcance del caso; sin bolsa (`contrato_id NULL`; la tarea 5 del ticket lo pregunta); 4 tareas del diseño: Diagnóstico y revisión de logs (3 est./3 real, hecha), Carga de nuevo CAF y pruebas en QA (4/1), Paso a producción y acompañamiento (2/—), Capacitación breve (1/—) = 10 h; 3 fotos 1×1 PNG generadas (`captura_error.png`, `log_erp_folios.png`, `emision_ok_qa.png`, subidas por Sebastián, `guardarBufferComoArchivo`); seguimiento de Sebastián "Diagnóstico terminado: 3 h" con `horas: 3` (registro_horas con `ot_id`); eventos del diseño: `creada` (Camila 10:02), `cambio tipo` no (se crea facturable), `tareas_traspasadas` no, `tarea_creada` ×4 (Sebastián 10:15), `cambio etapa` Borrador → Cotizada (Camila 10:40). En TK-1048: evento `convertido_en_ot` "OT-0218 · Facturable" (Camila, hace 1 día 10:02). Las 5 tareas de TK-1048 **se conservan** (la semilla inserta directo; no simula la conversión) |
| **OT-0219** | **TK-1053** | interna | borrador | no_aplica | Valentina Soto | "Reemplazo de UPS en sala de servidores", centro de costo "Operaciones", aprobador Fernanda Castro, 2 tareas (4 + 2 h est.); evento `creada` |

Test `desarrollo.test.ts`: tras sembrar dos veces hay 18 tickets y 6 OT; OT-0218 tiene 4 tareas (10 h estimadas), 3 archivos, 1 mensaje con 3 h; OT-0216 está `por_facturar` con aprobación; TK-1048 `ot_vinculada.codigo = 'OT-0218'`; `contador.valor ≥ 219`.

## 14. Documentación (bloque 3G)

- `docs/manuales/usuario/01-tecnico.md`: secciones "Convertir un ticket en OT", "La orden de trabajo" (tipo, datos, tareas con horas, fotos desde el celular, seguimiento y copiar al ticket), "Qué pasa con las tareas".
- `docs/manuales/usuario/02-coordinacion.md` (nuevo): aprobar OT internas, registrar la aprobación del cliente con respaldo, cerrar una OT (diálogo 4.6 paso a paso, ambos caminos), cancelar, marcar facturada, resolver un ticket con OT abierta.
- `docs/manuales/administracion.md`: sección "Órdenes de trabajo: numeración OT, quién aprueba/cierra/factura, archivos de OT".
- `docs/api/README.md`: ejemplos `curl` de convertir, cerrar y facturar. `docs/api/openapi.json` regenerado. `docs/CHANGELOG.md`. `CLAUDE.md`: tabla §2 con las filas de OT y la regla de bloqueo ticket → OT (§1.2). `README.md` si cambia algún script.
- `docs/decisiones/0023-precisiones-de-la-fase-3.md` con lo de §19 y `README.md` de decisiones actualizado; `preguntas-abiertas.md` no se edita (las respuestas van en la ADR).

## 15. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit; sin `Co-Authored-By`)

| Tarea | Bloque | Crea/edita | Criterio de aceptación |
|---|---|---|---|
| **F3-T1 Contratos compartidos** | 3A | `shared/src/{enums/ot,estados/ot,estados/efectos-cierre,esquemas/ot,eventos}.ts`, cambios en `esquemas/{comunes,ticket,tarea,mensaje}.ts`, `errores.ts`, índices | `estados/ot.test.ts` (tabla 2×6×6, `pasoVisual`, esquemas) y `estados/efectos-cierre.test.ts` (6 casos) verdes; `esquemas.test.ts` cubre `OtCrearEntrada`, `OtEditarEntrada` (término < inicio → error), `CierreOt`, `TareaEntrada.horas_estimadas`; `Responsable`/`ClienteBreve` siguen exportados desde `@zydesk/shared`; `npm run typecheck` verde en api y web sin tocarlos (los cambios de forma son compatibles). |
| **F3-T2 Migración, entidades, núcleo y fábricas** | 3A | migración 10, `ot.entity.ts`, `aprobacion-cliente.entity.ts`, entidades modificadas, `entidades.ts`, `ots.acceso.ts`, `core/eventos/dominio.ts`, `archivos.service.ts`, `fabricas.ts` | `db:migrar` desde cero aplica 10; `db:revertir` deja 9; `fabricas-fase3.test.ts`: `crearOt` en cada etapa respeta los `CHECK`; `archivos.test.ts`: descarga de `entidad = 'ot'` por `lectura` → 200 y auditoría solo en `attachment`; `dominio.test.ts`. |
| **F3-T3 Numeración OT, `otsAbiertas`, resumen y filtros** | 3B | `core/numeracion/fuente.ts`, `tickets.service.ts` (`otsAbiertas`, `cambiarEstadoEnTx`, `guardarResponsablesEnTx`, B1 en los 3 cerrados), `tickets.consulta.ts` | Prueba 6 y 14 (parte tickets) verdes; `GET /api/config/numeracion` refleja `ot.ultimo_usado` real; `TicketSalida.ots`. |
| **F3-T4 OT: convertir, obtener, listar, editar, archivos** | 3B | `ots.service.ts`, `ots.consulta.ts`, `ots.routes.ts`, `ots.tipos.ts`, `app.ts` | §4.1–4.4, §4.8, §5 con tests (`ots.test.ts`); pruebas 4, 5, 11 (conversión), 13; dos conversiones → `OT-0200/0201`; `tipo_cambiable`; `bolsa.usadas_mes`. |
| **F3-T5 OT: etapas, aprobaciones, cancelar, facturar** | 3B | `ots.service.ts` (+`ots.etapas.service.ts` si supera 400 líneas), rutas | §4.5–4.7 con tests (`etapas.test.ts`); pruebas 3, 8, 9, 10. |
| **F3-T6 Tareas de OT** | 3C | `modulos/tareas/**` | §6.1; `moverTareasAbiertas`; prueba 11; tests de Fase 2 verdes. |
| **F3-T7 Mensajes, actividad, copiar al ticket y horas de OT** | 3C | `modulos/mensajes/**`, `modulos/horas/**` | §6.2–6.3; prueba 12; `copiado_de`/`copiado_al_ticket`; archivos de la copia resueltos desde el origen. |
| **F3-T8 Cierre de OT** | 3D | `ots.cierre.service.ts`, `cierre.test.ts`, ruta `cerrar` | §7 completo; prueba 7 (a–g) y 17; el servicio usa `efectosCierreOt` (test: al cambiar un texto en `shared`, el `datos` del evento no depende de él, pero `ticket_estado_final` sí). |
| **F3-T9 Seguridad y cobertura de eventos** | 3D | `ots/seguridad.test.ts`, `ots/eventos.test.ts` | Las 18 pruebas de §9 y la cobertura de §8 verdes. |
| **F3-T10 Web: api, pills, etapas, `ListaTareas` y `Redactor` generalizados, eventos** | 3E | `features/ots/{api,eventos}.ts`, `components/dominio/{PillEtapaOt,PillTipoOt,PillFacturacion,Etapas,SelectorTipoOt,ListaTareas,Redactor,PillTipo}.tsx` | Tests jsdom: `Etapas` marca `aria-current` y el paso "Facturada" derivado; `ListaTareas` con `conHoras` suma horas y hace `PATCH` al perder el foco; `Redactor` envía `copiar_al_ticket`; `describirEventoOt` 8 casos; tests previos de `ListaTareas`/`Redactor` verdes. |
| **F3-T11 Pantalla 6 Orden de trabajo** | 3E | `pages/OtDetallePage.tsx`, `components/{DatosOt,GaleriaOt,PanelOt,DialogoAprobacionCliente,DialogoCancelarOt,DialogoFacturar}.tsx`, `router.tsx` | §10.4; tests: acciones por etapa/tipo/permiso (técnico no ve "Cerrar OT"; coordinación sí), tipo bloqueado fuera de borrador, galería agrupa por pestaña, casilla de bolsa solo con bolsa vigente. En el navegador (1440 y 390 px): OT-0219 → "Aprobar e iniciar" con `fcastro`; OT-0218 → subir foto desde la cámara (emulación), seguimiento con "Copiar al ticket" aparece en TK-1048; panel apilado y redactor fijo en móvil. |
| **F3-T12 Pantalla 6b Cerrar OT** | 3E | `components/DialogoCerrarOt.tsx` | §10.5; tests: "Sí" deshabilitado con otras OT abiertas; "No" muestra siguiente paso y responsable; "Qué va a pasar" cambia con la opción; botón deshabilitado sin resumen; 409 `OT_ABIERTA` muestra la lista. En el navegador: cerrar OT-0217 con "No · nueva OT" crea OT-0220 con las tareas pendientes; cerrar OT-0215 con "Sí" resuelve TK-1037. |
| **F3-T13 Lista de OT** | 3E | `pages/OtsPage.tsx`, `features/ots/lista/**` | §12 con tests. |
| **F3-T14 Web tickets: convertir, OT vinculadas, Tablero, Tabla** | 3F | `features/tickets/components/DialogoConvertirEnOt.tsx`, `PanelTicket.tsx`, `TicketDetallePage.tsx`, `tablero/**`, `tabla/**`, `eventos.ts`, `ActividadLista.tsx` | §11 con tests; en el navegador: TK-1051 → "Convertir en OT" → OT-0220 con la tarea pendiente; TK-1048 muestra "Crear otra OT"; Tablero con etiquetas de OT como el diseño; chip Con OT. |
| **F3-T15 Ficha de cliente** | 3F | `features/clientes/**` | Tarjeta "Órdenes de trabajo" lista OT-0218 en Viña Santa Clara. |
| **F3-T16 Semillas** | 3G | `semillas/desarrollo-ots.ts`, `desarrollo-tickets.ts`, `desarrollo.ts`, `desarrollo.test.ts` | §13; `npm run db:reiniciar` deja el Tablero con las etiquetas de OT del diseño y `/ots` con 6 OT. |
| **F3-T17 Documentación y cierre** | 3G | §14, `docs/decisiones/0023-precisiones-de-la-fase-3.md`, `docs/decisiones/README.md`, `docs/api/openapi.json`, `CLAUDE.md`, `docs/CHANGELOG.md` | Criterios de §16 desde un clon limpio; PR a `main` con CI verde. |

## 16. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 10 migraciones aplicadas
npm test                                                                                    → verde (shared: estados/ot, efectos-cierre, esquemas; api: todos; web)
npm run db:reiniciar                                                                        → 18 tickets, 6 OT, OT-0218 con 4 tareas/3 fotos/1 seguimiento
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (3 colas, sin cambios)
curl -b cookie -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"tipo":"facturable"}' localhost:3010/api/tickets/<id TK-1051>/convertir-en-ot → 201 { codigo: "OT-0220", etapa: "borrador", tareas: [1] }
curl -b cookie -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"estado":"resuelto"}' localhost:3010/api/tickets/<id TK-1042>/cambiar-estado → 409 OT_ABIERTA { ots: [{ codigo: "OT-0217" }] }
curl -b cookie(coordinación) -H … -d '{"resolvio_ticket":true,"resumen":"Listo"}' localhost:3010/api/ots/<id OT-0217>/cerrar → 200 { etapa: "cerrada", estado_facturacion: "por_facturar" }; TK-1042 → resuelto
curl -b cookie(técnico) … /api/ots/<id>/cerrar                                              → 403 SIN_PERMISO
curl -b cookie(coordinación) … -d '{"n_factura":"F-1001"}' /api/ots/<id OT-0216>/facturar   → 200 { estado_facturacion: "facturada" }
GitHub Actions: workflow CI verde en la rama y en el PR a main
```

En el navegador (1440 px y 390 px): `/ots/<OT-0218>` reproduce la pantalla del diseño (etapas con "Cotizada" actual, tipo bloqueado, 4 tareas con horas, galería con 3 fotos + correo del ticket, seguimiento con "Copiar al ticket", panel con cotización deshabilitada); "Cerrar OT" en OT-0217 muestra el diálogo 6b con "Qué va a pasar" y ambos caminos; `/tickets/<TK-1048>` muestra OT-0218 vinculada y "Crear otra OT"; el Tablero muestra "OT-0218 · Facturable" y "OT-0215 · Interna"; con `nvega` (lectura) todo se ve, nada se edita; con `sdiaz` (técnico) no aparecen aprobar, cerrar, cancelar ni facturar. Detener el `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

## 17. Decisiones tomadas en esta spec (menores, con justificación)

1. **`cotizada` se marca a mano en esta fase** (`cambiar-etapa`) porque el cotizador es Fase 4; la Fase 4 hará que "enviar cotización" dispare la transición y decidirá si conserva la marca manual (cotizaciones hechas fuera de la app).
2. **`OT_ABIERTA` bloquea los tres cierres del ticket** (resuelto, descartado, duplicado), no solo `resuelto`: cerrar un ticket con trabajo formal en curso rompe la trazabilidad en cualquiera de los tres; además garantiza que al cerrar una OT el ticket siempre está abierto (§7.3).
3. **Tareas abiertas se mueven** (no se copian) del ticket a la OT, como dice literalmente la spec 4.4; las hechas se quedan. Con `nueva_ot`, las no hechas de la OT cerrada se mueven a la nueva (ADR 0004). Al cancelar, las tareas se quedan en la OT cancelada.
4. **`ot.cliente_id` y `area_solicitante`**: la OT copia el cliente del ticket (editable solo en borrador) y "área solicitante" es texto libre prellenado con el nombre del área interna del ticket. La spec §6 no daba `cliente_id` a la OT, pero la casilla de bolsa (ADR 0015) y la aprobación del cliente exigen saber de qué cliente es.
5. **`estado_facturacion`**: `pendiente` al nacer facturable, `por_facturar` al cerrar, `no_aplica` al cancelar (una OT cancelada no se cobra) y siempre `no_aplica` en internas; `facturar` es endpoint propio con `ots.facturar` (se adelanta de la Fase 6 porque cuesta una ruta y cierra el ciclo).
6. **Cancelar exige `ots.cerrar`**: cancelar es una forma de cierre; la matriz de la spec no lo nombra.
7. **Aprobación interna**: cualquiera con `ots.aprobar` puede aprobar; `aprobador_id` solo indica a quién se le pide (y alimentará "Por aprobar" de Mi día en Fase 6). `aprobar` y `aprobacion` admiten `iniciar` para el botón "Aprobar e iniciar" del diseño (dos eventos de etapa).
8. **`aprueba_cotizaciones` del contacto es informativo**: la aprobación exige contacto del cliente y respaldo adjunto, no esa marca (el respaldo es la prueba).
9. **Convertir no cambia el estado del ticket** ni exige que no haya otra OT abierta (spec: varias OT por ticket).
10. **Copiar al ticket comparte los archivos** (una sola fila `archivo`, resuelta desde el origen) y no repite horas ni menciones; una copia por mensaje (índice único). Se copia con el mismo tipo (nota o seguimiento).
11. **Galería compuesta en el front** (propios + mensajes + aprobación + ticket) en vez de un endpoint agregado: el detalle ya trae todo.
12. **`horas` de la OT** = Σ estimadas y reales de tareas (manuales) y Σ `registro_horas` con `ot_id`; sin `tarea_id` en `registro_horas` (Fase 5 decide si las horas se imputan por tarea).
13. **`usadas_mes` de la bolsa se calcula en la OT**; la ficha de cliente (`horas_usadas_mes: null`) se completa en Fase 5 para no tocar `clientes` en esta fase.
14. **Lista mínima `/ots`** en esta fase (chips, tabla, sin montos ni exportación) porque sin ella una OT solo se alcanza desde su ticket; la pantalla 10 completa sigue en Fase 6. Es una vista (ADR 0022).
15. **Eventos de dominio** se publican desde ahora con un emisor tipado y un oyente de log; Fase 6 conecta el despachador sin tocar los servicios (ADR 0008).
16. **`Responsable` y `ClienteBreve` se mueven a `esquemas/comunes.ts`** para que `ot.ts` y `ticket.ts` se importen sin ciclo; el paquete los sigue exportando con el mismo nombre.
17. **Orden de bloqueo ticket → OT → tarea/mensaje** (§1.2) fijado para toda la API.
18. **`cambiar-etapa` genérico solo para etapas sin permiso especial** (`borrador`, `cotizada`, `en_ejecucion`); aprobar, cerrar, cancelar y facturar son acciones propias (ADR 0010) porque cambian el permiso.
19. **Sin paquetes nuevos**; radios nativos estilizados como en `DialogoCambiarEstado`.
20. **Semilla de OT-0218 inserta directo** y conserva las 5 tareas de TK-1048 tal como están (no simula la conversión), para no romper el test de la Fase 2 y reproducir ambas pantallas del diseño.

## 18. Preguntas para el usuario

1. **[Bloquea F3-T5 y F3-T11]** ¿Aceptas que en esta fase la etapa **Cotizada** se marque a mano ("Marcar como cotizada", decisión 1) hasta que exista el cotizador? Alternativa: saltar de Borrador a Aprobada por cliente en Fase 3 (rompe el grafo de ADR 0004).
2. ¿Confirmas bloquear también **Descartado** y **Duplicado** con OT abierta (decisión 2)? Si prefieres solo Resuelto, es una línea en `cambiarEstado`. No bloquea.
3. ¿Quién puede **cancelar** una OT: solo `ots.cerrar` (decisión 6) o también Técnico (`tickets.editar`) mientras esté en Borrador? No bloquea.
4. ¿La **aprobación interna** la puede registrar cualquiera con `ots.aprobar` o solo la persona elegida como aprobador (decisión 7)? No bloquea.
5. ¿Adelantamos **"Marcar facturada"** a esta fase (decisión 5) o lo dejamos en la Fase 6 con la pantalla 10? No bloquea (es una ruta y un diálogo).
6. **Tareas abiertas**: ¿mover (desaparecen del ticket, decisión 3) o copiar (quedan en ambos)? No bloquea, pero cambia lo que ve el técnico en el ticket.
7. ¿Exigir que el contacto que aprueba tenga marcado **"aprueba cotizaciones"** (decisión 8)? No bloquea.
8. ¿Vale la **lista mínima `/ots`** ahora (decisión 14) o prefieres esperar la pantalla 10 completa en Fase 6? No bloquea.
9. En "Copiar al ticket", ¿se permiten **notas internas** o solo seguimientos (decisión 10)? No bloquea.

## 19. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0023 "Precisiones de la Fase 3" al cerrar)

- **ADR 0004**: `OT_ABIERTA` aplica a los tres estados cerrados del ticket; `cotizada` se marca a mano hasta la Fase 4; una OT cancelada pasa a `estado_facturacion = 'no_aplica'`; `aprobar` y `aprobacion` admiten `iniciar` (aprobada → en_ejecucion en la misma transacción); `en_ejecucion` fija `inicio` si falta y `cerrada` fija `termino` si falta; el cierre con `en_espera` sobre un ticket ya en espera actualiza `espera_de` sin transición; `cancelar` exige `ots.cerrar`; `cambiar-etapa` genérico solo para etapas sin permiso especial.
- **ADR 0003**: eventos de tareas de OT bajo `entidad = 'ot'`; eventos nuevos `ot_cancelada`, `archivos_agregados`, `seguimiento_copiado` (en el ticket) y `creada` (OT); `convertido_en_ot` y `creada` llevan `desde_ot` cuando nacen de un cierre; los cambios de etapa y de facturación son `cambio` con `datos`, no acciones propias; `cambiarEstadoEnTx`/`guardarResponsablesEnTx` exportadas para orquestar desde `ots` (única circularidad permitida).
- **ADR 0008**: los eventos de dominio (`shared/eventos.ts`, `core/eventos/dominio.ts`) se publican desde la Fase 3 tras el commit; el despachador y los canales llegan en Fase 6.
- **ADR 0009**: `archivo.entidad` acepta `'ot'`; la galería de la OT se compone en el front (propios, mensajes, respaldo de aprobación, archivos del ticket); el respaldo de la aprobación es un archivo de la OT; una copia de mensaje comparte los archivos del origen.
- **ADR 0015**: `usadas_mes` se expone en `GET /api/ots/:id` desde ahora; en la ficha de cliente en Fase 5; una OT cancelada conserva `contrato_id` (historial) pero sus horas no cambian.
- **ADR 0010 / 0011 / 0022**: lista mínima `/ots` como vista en Fase 3 (sin cambios de etapa desde la lista); rutas nuevas `POST /api/ots/:id/aprobar`, `/facturar`, `/archivos`, `PUT /api/ots/:id/aprobacion`, `POST /api/mensajes/:id/copiar-al-ticket`.
- **Spec funcional §6 / PLAN §4**: `OT` gana `cliente_id`, `contacto_id`, `aprobada_por/en`, `facturada_en/por`, `cerrada_por`, `cancelada_en`, `motivo_cancelacion`; `area_solicitante` es texto; `Tarea` gana `horas_reales`; `Mensaje.copiado_desde_id` como en §6. La aprobación del cliente (PLAN Fase 4) y "marcar facturada" (PLAN Fase 6) se adelantan a la Fase 3; el cotizador sigue en Fase 4 y la pantalla 10 completa en Fase 6.
- **Preguntas abiertas B1**: se amplía a descartado/duplicado (si el usuario acepta la pregunta 2).
