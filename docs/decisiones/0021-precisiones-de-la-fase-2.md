# ADR 0021 — Precisiones surgidas al especificar e implementar la Fase 2

**Estado**: aceptada · 2026-09-30 · precisa a ADR 0001, 0003, 0004, 0005, 0008, 0009, 0010 y 0017 (no cambia sus decisiones de fondo) · precisada por ADR 0023 (Fase 3) y por ADR 0027 (Fase 6)

## Contexto

Al escribir `docs/specs/fase-2.md` (§17 y §19) y al implementar tickets, mensajes, tareas y archivos aparecieron detalles que las ADR dejaban abiertos. Las preguntas de §18 se resolvieron con la recomendación de la spec (el usuario delegó las no bloqueantes). Se registran aquí para que las ADR, la spec y el código digan lo mismo.

## Decisión

1. **Auditoría de descargas** (precisa ADR 0017): `descarga_archivo` se registra solo cuando el archivo se sirve como `attachment` (documentos y correos). Las imágenes y PDF servidos inline no se auditan: generarían decenas de filas por visita sin valor de seguridad. Esto resuelve la contradicción de la spec entre la prueba 13 y §4.4 a favor de §4.4.
2. **Eventos de tareas y mensajes** (precisa ADR 0003): los eventos de tareas (`tarea_creada`, `tarea_hecha`, …) se registran con `entidad = 'ticket'` y `datos.tarea_id`, para que la actividad del ticket sea una sola consulta. Los mensajes (seguimientos y notas) no generan `evento`; "N° de mensajes" cuenta mensajes.
3. **Actividad del ticket** (precisa ADR 0003 y 0010): `GET /api/tickets/:id/actividad` vive en `modulos/mensajes`, no en `tickets`, porque depende del servicio de mensajes. Se devuelve sin paginar, con `conteos` para las pestañas, ordenada por `creado_en` con desempate: eventos antes que mensajes, luego por id.
4. **Escritura de `ticket` desde otros módulos** (precisa ADR 0003): `tickets.service` exporta `registrarActividadEnTicket(tx, id, { respuesta? })`; mensajes y tareas la usan para actualizar `actualizado_en` y `primera_respuesta_en` sin escribir la tabla `ticket` directamente (regla de módulos de `CLAUDE.md`).
5. **Cambio de estado y tickets cerrados** (precisa ADR 0004): cada cambio de estado genera un único `evento` `cambio` en `estado` con el payload en `datos` (`espera_de`, `motivo`), en vez de eventos separados. Un ticket cerrado admite mensajes, seguidores y marcar/desmarcar tareas; no admite `PATCH`, responsables ni alta/baja/edición de tareas (409 `TICKET_CERRADO`, "Reabre el ticket para editarlo"). Reabrir = `cambiar-estado` a `en_curso` y limpia `archivado_en`.
6. **Plazos** (precisa ADR 0005): `respuesta_limite` y `primera_respuesta_en` se calculan y guardan en `ticket`; la primera respuesta se fija con el primer seguimiento o al pasar a En curso. Sin responsable con departamento ni categoría no se calcula fecha límite (`NULL`, "Sin fecha"); no se inventa un plazo.
7. **Responsable por defecto de la categoría**: se **propone** en el formulario y la persona confirma; no se asigna automáticamente.
8. **Correos adjuntos** (precisa ADR 0009): la API re-lee el correo al crear el ticket (`correo: { archivo_id } | { texto }`); lo guardado en `correo_adjunto` es lo que dice el archivo. El texto pegado se guarda como `correo-pegado.txt` con `categoria = 'correo'` (`guardarBufferComoArchivo` acepta `categoria` opcional), de modo que "original descargable" vale en los tres modos. El cuerpo se recorta a 20 000 caracteres (con "…"); el original sigue descargable. `archivo.entidad` NULL = pendiente; `mensaje_id` para adjuntos de mensajes. MIME detectado por contenido con `file-type`, aceptando texto plano solo para `.eml/.txt/.csv`; `.msg` solo si `msgreader` lo abre.
9. **Fixture `.msg`**: no se genera sin Outlook. El test queda en `it.skip` hasta contar con un correo de prueba exportado desde Outlook sin datos reales en `apps/api/test/fixtures/correo.msg`.
10. **Horas desde el redactor**: fila de `registro_horas` con la fecha de hoy en Santiago, `fuera_de_horario = false` y `mensaje_id`; sin selector de fecha (se corrige en la planilla de la Fase 5) ni endpoints de horas hasta esa fase.
11. **Rutas con middlewares previos** (precisa ADR 0010): `ruta()` admite `previos?: RequestHandler[]` para intercalar `multer` entre autorización y handler en la única ruta multipart, manteniendo la declaración única de rutas.
12. **Búsqueda y listados** (precisa ADR 0010): `q` con solo dígitos busca por número o código exacto; otro texto busca parcialmente por asunto, solicitante y código. El Tablero recibe el listado sin paginar (activos + cerrados no archivados) ordenado por prioridad y luego actualización; la Tabla es paginada. `vence_hoy` en los resúmenes exige además ticket no cerrado.
13. **Job de archivado** (precisa ADR 0008): `tickets.archivar` corre a las 03:10 (no 03:00) para no solaparse con `mantencion.limpiar`, y registra un `evento` `archivado` por ticket.
14. **Estructura** (precisa ADR 0001): se agregan `apps/api/src/integraciones/{storage,correo,archivos}` y `apps/api/test/fixtures/`. Las migraciones de la fase van juntas en el bloque 2B; `archivo.mensaje_id` se añade por `ALTER` para evitar la referencia circular. Una BD de test por bloque con `TEST_BD_SUFIJO`; CI genera `.env` desde `.env.example` y ejecuta el mismo `01-roles.sql` (ADR 0020).
15. **Sin edición ni borrado de mensajes ni de sus archivos** en esta fase; menciones solo como ids (el `@` en el texto es presentación, ADR 0008). Exportar (Fase 7), filtro Con OT y Convertir en OT (Fase 3) visibles y deshabilitados; `OT_ABIERTA` y `otsAbiertas()` declarados ahora para que la Fase 3 no toque el contrato.

## Consecuencias

- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR.
- El test de `.msg` sigue en `it.skip` hasta recibir la fixture; se prueba a mano en la demo.
- Quedan pendientes de la Fase 5 el selector de fecha para horas y los endpoints de horas.
