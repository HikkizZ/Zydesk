# ADR 0004 — Máquinas de estado de Ticket y OT

**Estado**: aceptada · 2026-09-29 · precisada por ADR 0021 (Fase 2)

## Contexto

Ticket: Nuevo, En curso, En espera (exige "de quién"), Resuelto, Descartado (motivo), Duplicado (ticket original); cerrados se archivan a 7 días; advertencia al resolver con OT abierta. OT facturable: Borrador → Cotizada → Aprobada por cliente → En ejecución → Cerrada → Facturada; interna: Borrador → Aprobada → En ejecución → Cerrada. Diálogo de cierre 4.6. La spec dice además que "resolver y facturar son independientes" y modela `estado_facturacion` aparte. El front necesita las mismas reglas para mostrar solo las transiciones válidas y los campos obligatorios.

## Opciones consideradas

1. Librería de máquinas de estado (XState) — potente, pero sobredimensionada: aquí hay dos grafos pequeños y payloads por transición.
2. **Datos + funciones puras en `packages/shared`** — tabla de transiciones, esquema Zod por transición (unión discriminada) y `puedeTransicionar()`. El servicio de la API valida y aplica; el front reutiliza.

## Decisión

Opción 2. Archivos: `packages/shared/src/estados/ticket.ts` y `ot.ts`.

**Ticket** (`EstadoTicket`): `nuevo | en_curso | en_espera | resuelto | descartado | duplicado`.
- Transiciones: desde cualquier abierto (`nuevo`, `en_curso`, `en_espera`) se puede ir a cualquier otro estado; desde un cerrado solo a `en_curso` ("reabrir", genera Evento). `resuelto`, `descartado`, `duplicado` son cerrados → `cerrado_en` se fija y un job archiva a los 7 días (`archivado_en`).
- Payload por transición (Zod, unión discriminada por `estado`):
  - `en_espera` → `espera_de: 'cliente' | 'proveedor' | 'repuesto' | 'aprobacion'` + `espera_detalle?` (texto corto).
  - `descartado` → `motivo` (obligatorio).
  - `duplicado` → `duplicado_de_id` (debe existir, no puede ser el mismo ni ser a su vez duplicado).
  - `resuelto` → sin campos; **regla OT abierta**: si el ticket tiene OT en etapa distinta de `cerrada`/`cancelada`, la API responde `409 OT_ABIERTA` con la lista de OT. El front muestra el diálogo "Cerrar o cancelar la OT primero" con enlaces a cada OT. No existe "resolver de todos modos" (opción más simple y coherente con la trazabilidad; ver preguntas abiertas).
- Columna "Cerrados" del Kanban agrupa los tres cerrados; al arrastrar una tarjeta ahí el front abre el selector de estado cerrado con su payload.

**OT** (`EtapaOt`): `borrador | cotizada | aprobada | en_ejecucion | cerrada | cancelada`.
- Facturable: `borrador → cotizada → aprobada → en_ejecucion → cerrada`. Interna: `borrador → aprobada → en_ejecucion → cerrada`. `cancelada` se alcanza desde cualquier etapa no cerrada (con motivo). `cotizada → borrador` permitido (rechazo del cliente, se duplica la cotización como v2).
- **"Facturada" no es etapa**: es `estado_facturacion ∈ {no_aplica, pendiente, por_facturar, facturada}` (`no_aplica` para internas). Reglas: al cerrar una OT facturable pasa a `por_facturar` aunque no haya resuelto el ticket; `facturada` exige `n_factura` y permiso `ots.facturar`. La UI dibuja "Facturada" como sexto paso derivado (`cerrada && facturada`).
- `aprobada` en facturable exige `AprobacionCliente` completa (contacto, fecha, forma, archivo de respaldo). `aprobada` en interna exige que quien aprueba tenga `ots.aprobar`.
- El tipo (facturable/interna) solo cambia en `borrador`.

**Cierre de OT** (`POST /api/ots/:id/cerrar`), permiso `ots.cerrar`, solo desde `en_ejecucion`:
```
{ resumen: string (obligatorio),
  resolvio_ticket: true }
| { resumen, resolvio_ticket: false,
    siguiente: { accion: 'en_curso' | 'en_espera' | 'nueva_ot', responsable_id, espera_de? } }
```
En una transacción (ADR 0003): OT → `cerrada` (+ `por_facturar` si facturable); el resumen se guarda como seguimiento en la OT **y** en el ticket; Evento en el ticket `ot_cerrada` con `resolvio_ticket`; ticket → `resuelto` o al siguiente paso (con `nueva_ot` se crea una OT en `borrador` del mismo tipo, vinculada al ticket, con las tareas no hechas de la OT cerrada); avisos a responsables y seguidores. El bloque "Qué va a pasar" del diálogo se calcula en el front con una función pura de `shared` (`efectosCierreOt(ot, ticket, payload)`), la misma que usa el servicio.

## Consecuencias

- Las reglas viven una sola vez; cambiar un estado es tocar un archivo y sus tests.
- El front puede deshabilitar opciones inválidas y pedir los campos exactos sin consultar al servidor.
- Se agregó la etapa `cancelada` (no estaba en la lista de la spec pero es necesaria para la regla 4.1 y para OT que no prosperan).
