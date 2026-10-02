# ADR 0016 — Línea de tiempo: agrupación, vencidos y ancho mínimo de barra

**Estado**: aceptada · 2026-09-29 · complementa a ADR 0011 (frontend) y la respuesta A8 · precisada por ADR 0027 (Fase 6)

## Contexto

El diseño de referencia muestra la línea de tiempo con una fila por persona, barras de inicio planificado a fecha límite, estilo por estado y escala Día / 2 semanas / Mes. Al usarlo para "¿en qué está cada uno?" faltan tres cosas que el usuario pidió (2026-09-29): ver la misma información **por cliente**, detectar de un vistazo lo **vencido**, y que las barras de un día no desaparezcan.

## Decisión

- **Selector "Agrupar por"**: `persona` (por defecto) o `cliente`. Por persona: fila = responsable principal (los sin responsable van en "Sin asignar"). Por cliente: fila = cliente o área interna (los sin cliente van en "Sin cliente"). El valor vive en la URL (`?agrupar=cliente`, ADR 0011) y las filas se ordenan alfabéticamente, con la del usuario que mira primero en modo persona.
- **Vencidos**: un ítem está vencido si `fecha_limite < ahora` y no está cerrado (ticket no resuelto/descartado/duplicado; OT no cerrada ni cancelada). Aviso superior "**N vencidos**" con ícono de alerta (`lucide` `triangle-alert`), que al pulsarlo filtra solo vencidos; cada barra vencida lleva el mismo ícono al inicio y el par de color `urgente` de la spec (texto + ícono, nunca solo color). El cálculo es del servidor (`vencido: boolean` en la respuesta del listado), para que coincida con el job `tickets.vencimientos` de ADR 0008.
- **Ancho mínimo**: toda barra ocupa al menos el ancho de una columna de día (y nunca menos de 24 px), aunque inicio y límite sean el mismo día o el límite haya pasado; una barra vencida se prolonga hasta la columna de hoy con trazo punteado desde su límite.
- Se mantiene la escala por **días hábiles** del departamento de quien mira (A8) y los estilos por estado de la spec (en curso, planificado, en espera rayado, resuelto).

## Consecuencias

- Una sola consulta `GET /api/tickets/linea-de-tiempo?desde&hasta&agrupar` devuelve ítems planos con `responsable_id`, `cliente_id`, `vencido`; el agrupado se hace en el cliente.
- El contador de vencidos coincide con el filtro "Vencidos" de la Tabla porque usa la misma definición.
- En móvil la pantalla sigue siendo "usable, no optimizada" (scroll horizontal, ADR 0011).
