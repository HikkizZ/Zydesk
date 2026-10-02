# ADR 0022 — Tablero de solo lectura

**Estado**: aceptada · 2026-09-30 · precisa a ADR 0011 (Kanban con dnd-kit); sustituye A7 de `preguntas-abiertas.md` · precisada por ADR 0023 (Fase 3) y por ADR 0027 (Fase 6)

## Contexto

ADR 0011 preveía un Kanban con arrastrar y soltar (`@dnd-kit`) más un menú "Cambiar estado" en cada tarjeta, y A7 resolvía qué pasa al soltar en "Cerrados" (selector Resuelto / Descartado / Duplicado). La spec de Fase 2 (§11–§12) lo detallaba también para la Tabla (menú `⋯` por fila). Al implementarlo aparecieron tres problemas: movimientos accidentales, sobre todo en celular (una tarjeta que se desliza al hacer scroll cambia el estado y ensucia el historial); dos caminos distintos para el mismo cambio (arrastre "directo" a Nuevo/En curso sin formulario, diálogo en los demás); y bastante complejidad (sensores, overlay, anuncios `aria-live`, actualización optimista con reversión) para 10 usuarios.

## Opciones consideradas

- **Tablero y Tabla solo como vistas; el estado se cambia únicamente desde el detalle del ticket.** Un solo camino, siempre con `DialogoCambiarEstado` y sus validaciones.
- Mantener dnd-kit y exigir confirmación al soltar. Evita el cambio accidental, pero conserva la complejidad y sigue habiendo dos caminos.
- Solo el menú "Cambiar estado" en tarjeta y fila, sin arrastre. Más simple, pero sigue permitiendo cambiar un ticket sin haber abierto su detalle (contexto, actividad, OT vinculadas).

## Decisión

- **Tablero (`/tickets`) y Tabla (`/tickets/tabla`) son vistas.** No hay arrastrar y soltar ni menú "Cambiar estado" en tarjetas ni filas. Cada tarjeta y cada fila enlazan al detalle (`/tickets/:id`).
- **El estado se cambia solo desde el detalle**, con `DialogoCambiarEstado` (ADR 0004 y spec Fase 2 §8.2): de quién se espera, motivo de descarte, ticket original, `OT_ABIERTA`, "Reabrir" en cerrados.
- La columna **Cerrados** muestra el tipo de cierre como `Pill` (Resuelto / Descartado · motivo / Duplicado de TK-x), sin selector.
- Se **desinstala `@dnd-kit/core` y `@dnd-kit/utilities`** de `apps/web`.
- La misma regla aplica al futuro **tablero de OT** (Fase 3): vista; los cambios de etapa se hacen desde la OT.

## Qué deja sin efecto

- **A7** de `preguntas-abiertas.md` (selector al soltar en Cerrados): ya no hay "soltar".
- **ADR 0011**, párrafo de accesibilidad: "Kanban con dnd-kit más un menú Cambiar estado en cada tarjeta". El resto de la ADR sigue vigente.
- **`docs/specs/fase-2.md`**: en §0 y §2 la mención a dnd-kit; en §11 el párrafo "Arrastrar y soltar", el menú `⋯` de la tarjeta y el test "el menú de una tarjeta `nuevo` ofrece 5 estados"; en §12 el menú `⋯` por fila; en §15 (F2-T16) y §16 las verificaciones de arrastre y del selector de Cerrados. No se edita la spec; queda registrado aquí.
- **`docs/especificacion/contexto-app-trazo.md` §5**, en lo que sugiere cambiar el estado desde el tablero. La especificación funcional no se edita.

## Consecuencias

- Historial más fiable: cada cambio de estado nace de un formulario validado, con actor y motivo; sin movimientos por error.
- Menos código y una dependencia menos; sin sensores, overlay ni actualización optimista que revertir.
- Más accesible: el Tablero es una lista de enlaces; no hay que replicar el arrastre con teclado ni anunciarlo.
- Cambiar el estado cuesta un clic más (abrir el detalle). Se acepta: obliga a ver el contexto del ticket antes de moverlo.
