# ADR 0003 — Historial (tabla Evento) y transacciones

**Estado**: aceptada · 2026-09-29 · precisada por ADR 0021 (Fase 2)

## Contexto

"Todo deja rastro": cada cambio en Ticket, OT, Cotización y Tarea debe generar un `Evento` con autor, campo, valor anterior y nuevo. Además hay transiciones compuestas que deben ser atómicas: cierre de OT → ticket Resuelto (o siguiente paso), conversión ticket → OT con traspaso de tareas abiertas, "Copiar al ticket" de un seguimiento, descargas de cotización registradas en la OT.

## Opciones consideradas

1. **Subscribers de TypeORM** (`afterUpdate`) — automáticos, pero no conocen al autor ni la intención ("convirtió en OT" no es un diff de columnas), y se disparan de forma poco predecible con `save()` en cascada y `update()` por query builder.
2. **Triggers de Postgres** — garantía total en BD, pero el autor tendría que viajar como `SET LOCAL app.autor_id`, los eventos de negocio seguirían necesitando código, y la lógica queda repartida en dos lenguajes.
3. **Capa de servicio explícita + helper de diff** — los servicios son el único punto de escritura; cada uno recibe un `manager` transaccional y llama a `registrarCambios()`.

## Decisión

Opción 3.

- **Regla de módulo**: los repositorios de `ticket`, `ot`, `cotizacion` y `tarea` no se exportan. Toda mutación pasa por un servicio con firma `(entrada, actor, tx)`. Las rutas nunca tocan repositorios.
- **Transacción por caso de uso**: `enTransaccion(async (tx) => { ... })` envuelve cada operación mutante; los servicios se componen pasándose el mismo `tx` (`EntityManager`). Cierre de OT, conversión a OT y copiar-al-ticket son un único `enTransaccion`.
- **Helper de diff**: `registrarCambios(tx, { entidad, id, antes, despues, actor, camposRastreados })` compara los campos rastreados (estado, prioridad, responsables, seguidores, fechas, categoría, tipo, etapa, estado de facturación, montos de cotización, tareas hechas/no hechas) y emite un `Evento` por campo cambiado. Los cambios relacionales (responsables, tareas) se comparan como conjuntos.
- **Eventos de negocio** (acción explícita, no diff): `creado`, `convertido_en_ot`, `ot_cerrada` (con `resolvio_ticket` y resumen), `cotizacion_creada/enviada/aprobada/rechazada`, `cotizacion_descargada` (xlsx/pdf), `tareas_traspasadas`, `seguimiento_copiado`. Se registran con `registrarEvento(tx, {...})`.
- **Modelo**: `evento(id, entidad, entidad_id, autor_id, accion, campo?, valor_anterior?, valor_nuevo?, datos jsonb?, creado_en)`. `valor_*` guardan el valor legible ya resuelto (p. ej. nombre de usuario), para que el historial no dependa de joins ni se rompa si se renombra algo.
- **Garantía de cobertura**: cada servicio mutante tiene un test que afirma el/los `Evento` esperados. Un subscriber de TypeORM **solo en test** (`afterUpdate/afterInsert`) verifica que en la misma transacción exista al menos un `Evento` para esa entidad y falla el test si no; no se usa en producción.
- El `Evento` se inserta **antes** del commit; los avisos (ADR 0008) se despachan **después** del commit.

## Consecuencias

- Un solo lugar para leer "qué pasó" (`GET /api/tickets/:id/actividad` mezcla mensajes y eventos por fecha).
- Costo: disciplina. Compensado por la regla de no exportar repositorios y por el subscriber de verificación en tests.
- Los eventos son inmutables: no hay `UPDATE`/`DELETE` sobre `evento` desde la app (se puede reforzar con un rol de BD sin esos permisos si hiciera falta).
- Se acepta no auditar Cliente, Contacto ni Configuración (la spec no lo pide); si más adelante hace falta, se reutiliza el mismo helper.
