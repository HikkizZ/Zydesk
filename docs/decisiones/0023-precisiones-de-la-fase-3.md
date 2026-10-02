# ADR 0023 — Precisiones surgidas al especificar e implementar la Fase 3

**Estado**: aceptada · 2026-10-01 · precisa a ADR 0003, 0004, 0008, 0009, 0010, 0011, 0015, 0021 y 0022 (no cambia sus decisiones de fondo) · precisada por ADR 0024 (seguridad de la Fase 3) y por ADR 0027 (Fase 6) · punto 1 sustituido por ADR 0025 (la marca manual "Cotizada" desaparece)

## Contexto

Al escribir `docs/specs/fase-3.md` (§17 y §19) y al implementar órdenes de trabajo, su cierre, tareas y mensajes de OT aparecieron detalles que las ADR dejaban abiertos. Las nueve preguntas de §18 las respondió el usuario el 2026-09-30 aceptando las decisiones de la spec; durante la implementación se tomaron otras menores. Se registran aquí para que las ADR, la spec y el código digan lo mismo.

## Decisión

### Respuestas del usuario (§18)

1. **Cotizada se marca a mano** (precisa ADR 0004): `POST /api/ots/:id/cambiar-etapa { etapa: 'cotizada' }` hasta que exista el cotizador (Fase 4), que decidirá si conserva la marca manual. Exige cliente externo.
2. **`OT_ABIERTA` bloquea los tres cierres del ticket** (precisa ADR 0004 y la pregunta B1): `cambiarEstadoEnTx` rechaza `resuelto`, `descartado` y `duplicado` con `esCerrado(estado)` si hay OT no final. Así el ticket siempre está abierto cuando se cierra una OT.
3. **Cancelar exige `ots.cerrar`** desde cualquier etapa no final; una OT cancelada pasa a `estado_facturacion = 'no_aplica'` y sus tareas no hechas se quedan en ella.
4. **Aprobación interna** por cualquiera con `ots.aprobar`; `aprobador_id` solo indica a quién se le pide. `aprobar` y `aprobacion` admiten `iniciar` (aprobada → en_ejecucion en la misma transacción, dos eventos).
5. **"Marcar facturada" se adelanta** de la Fase 6: `POST /api/ots/:id/facturar` (`ots.facturar`) solo desde `por_facturar`.
6. **Las tareas abiertas se mueven**, no se copian: del ticket a la OT al convertir y de la OT cerrada a la nueva con `nueva_ot` (`moverTareasAbiertas`). Las hechas se quedan.
7. **`aprueba_cotizaciones` del contacto es informativo**: la aprobación del cliente exige contacto activo del cliente de la OT y respaldo adjunto, no esa marca.
8. **Lista mínima `/ots`** en esta fase como vista de solo lectura (precisa ADR 0011 y 0022): chips, búsqueda y tabla; sin montos, exportación ni cambios de etapa desde la lista. La pantalla 10 completa sigue en Fase 6.
9. **"Copiar al ticket" copia seguimientos y notas internas**, cada uno con su mismo `tipo`; una copia por mensaje (índice único sobre `copiado_desde_id`), sin duplicar `archivo`, `mencion` ni horas.

### Decisiones de la implementación

10. **Auditoría de descargas** (confirma ADR 0021.1, precisa ADR 0009): se mantiene la regla de la Fase 2: `descarga_archivo` solo cuando el archivo se sirve como `attachment`, también para `entidad = 'ot'`. Imágenes y PDF inline de una OT no se auditan. Resuelve la contradicción de la prueba 13 de la spec a favor de esta regla (decisión del usuario).
11. **Cierre de OT y regla de módulos** (precisa ADR 0003): `mensajes.service` exporta `insertarMensaje` y `copiarAlTicket`; `ots.cierre.service` las reutiliza para el seguimiento de cierre en la OT y su copia en el ticket, por lo que el cierre registra además `seguimiento_copiado` en el ticket. `cambiarEstadoEnTx` y `guardarResponsablesEnTx` se exportan de `tickets.service` para orquestar desde `ots` (única circularidad permitida).
12. **Fechas al cambiar de etapa** (precisa ADR 0004): `en_ejecucion` fija `inicio = hoy` (Santiago) solo si era null y `termino` no es anterior a hoy. El cierre fija `termino = COALESCE(termino, hoy)` y, si `inicio` es posterior a hoy, usa `inicio` (CHECK `termino >= inicio`).
13. **Cierre con `en_espera` sobre un ticket ya en espera** actualiza `espera_de`/`espera_detalle` con un `UPDATE` y un `evento` `cambio` en `estado`, sin transición.
14. **Eventos de dominio** (precisa ADR 0008): `ot.cerrada`, `ot.por_facturar`, `ot.por_aprobar` y `ot.cancelada` se publican tras el commit desde `core/eventos/dominio.ts`; el único oyente es un log. `destinatarios_ids` de `ot.cerrada` se calcula con responsables y seguidores **antes** de reasignar el responsable siguiente. Si la transacción falla nada se publica; el número de OT de `nueva_ot` no se consume.
15. **Eventos de OT** (precisa ADR 0003): tareas de OT con `entidad = 'ot'`; nuevos `creada`, `tareas_traspasadas`, `archivos_agregados` (OT) y `convertido_en_ot`, `ot_cerrada`, `ot_cancelada` (ticket); `convertido_en_ot` y `creada` llevan `desde_ot` y `tareas_traspasadas` también cuando nacen de un cierre. Los cambios de etapa y de facturación son `cambio` con `datos`, no acciones propias. `ot_cancelada` registra solo `datos { ot_id, codigo, motivo }`.
16. **Rutas** (precisa ADR 0010): `cambiar-etapa` genérico solo para `borrador`, `cotizada` y `en_ejecucion`; aprobar, aprobación del cliente, cancelar, facturar y cerrar son acciones propias porque cambian el permiso. `POST /api/ots/:id/archivos` responde 200 con los archivos de la OT (asocia, no crea).
17. **Archivos** (precisa ADR 0009): `archivo.entidad` acepta `'ot'`; descarga para cualquier usuario autenticado; el respaldo de la aprobación es un archivo de la OT; la galería se compone en el front (propios, mensajes, respaldo, archivos del ticket).
18. **Bolsa** (precisa ADR 0015): `usadas_mes` se expone en `GET /api/ots/:id` desde ahora; la ficha de cliente lo completa en Fase 5. Una OT cancelada conserva `contrato_id`.
19. **`TareaEditarEntrada` es un objeto explícito con todo opcional** (precisa ADR 0021): en Zod 4, `.partial()` aplicaba los `default(null)` y un `PATCH { hecha: true }` borraba responsable, fecha y horas. Afectaba también a las tareas de ticket de la Fase 2; corregido.
20. **Front** (precisa ADR 0011): `ListaTareas` y `Redactor` se generalizan con `destino: { tipo: 'ticket' | 'ot', id }` manteniendo `ticketId` como forma anterior; la actividad de la OT reutiliza `TarjetaMensaje` de tickets; la actividad no salta al final al abrir, solo al llegar un ítem nuevo.

## Consecuencias

- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR.
- La Fase 4 decide si `cotizada` sigue admitiendo la marca manual; la Fase 5 completa `horas_usadas_mes` en la ficha de cliente; la Fase 6 conecta el despachador a los eventos ya publicados y entrega la pantalla 10 completa.
- `preguntas-abiertas.md` no se edita: B1 queda ampliada por el punto 2.
