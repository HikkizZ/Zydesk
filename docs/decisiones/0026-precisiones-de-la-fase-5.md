# ADR 0026 — Precisiones surgidas al especificar e implementar la Fase 5

**Estado**: aceptada · 2026-10-01 · precisa a ADR 0002, 0003, 0005, 0007, 0010, 0011, 0015, 0017, 0019, 0020, 0021, 0023, 0024 y 0025 (no cambia sus decisiones de fondo)

## Contexto

Al escribir `docs/specs/fase-5.md` (§14 y §16) y al implementar la planilla de horas aparecieron detalles que las ADR dejaban abiertos: quién ve las horas de quién, cómo se corrigen las horas nacidas de un seguimiento, qué registra la planilla, cómo se calcula la jornada contra la que se compara cada día y qué pasa con las horas de una tarea que se mueve o se borra. Las once preguntas de §15 las respondió el usuario el 2026-10-01 aceptando las recomendaciones de la spec (y aceptando la tarea condicional F5-T13); durante la implementación se tomaron otras menores, y la revisión de seguridad de PLAN §1 dejó un hallazgo corregido. Se registran aquí para que las ADR, la spec y el código digan lo mismo.

## Decisión

### Respuestas del usuario (§15)

1. **Horas registradas aparte de `horas_reales`** (precisa ADR 0007 y 0025.4): `TareaSalida.horas_registradas` es la suma de `registro_horas.horas` con `tarea_id` de la tarea, calculada al leer; la planilla nunca escribe `tarea.horas_reales`, que sigue siendo lo que la persona declara en la tarea. Costo interno y `bolsa.usadas_mes` no cambian de fórmula.
2. **Permiso nuevo `horas.ver_todas`** (precisa ADR 0002): Administración y Coordinación; fila 10 "Ver horas de todo el equipo" en la matriz. Solo lectura no registra horas (B10) ni ve las ajenas.
3. **Ver no es editar**: la planilla de otra persona es de solo lectura (`editable: false`); `PATCH` y `DELETE` sobre una fila ajena responden 403 `SIN_PERMISO` aunque se tenga `horas.ver_todas`, y `POST` registra siempre para la sesión (`usuario_id` nunca viene del cuerpo).
4. **Las filas nacidas de un seguimiento se corrigen en la planilla** (precisa ADR 0021.10 y 0021.15): fecha, horas y marca "fuera de horario". Editar `horas` deja `mensaje.horas` con el mismo valor; borrar la fila deja `mensaje.horas = NULL` y el mensaje sigue con su texto; cambiar fecha o marca no toca el mensaje. Sigue sin selector de fecha en el redactor.
5. **Sin horas a futuro**: fecha posterior a hoy (Santiago) → 400 `VALIDACION { fecha }`; la web deshabilita las columnas futuras.
6. **Sin `evento` ni `auditoria` por horas** (precisa ADR 0003 y 0017): crear, editar o borrar una fila desde la planilla no deja rastro en `evento` ni `auditoria`; `registro_horas` (`creado_en`, `actualizado_en`) es el registro, como el `mensaje` lo es para las horas del redactor. Primera fase sin eventos nuevos.
7. **Siete columnas siempre** (lunes a domingo), con sábado y domingo atenuados cuando la jornada es 0.
8. **Sin tope de horas por día**: la comparación con la jornada es visual (B3: sin bloqueos en v1); solo rige el tope por fila (0,25 a 24 h, múltiplos de 0,25).
9. **"Sin ticket" con descripción libre obligatoria** (máx. 200 caracteres), sin catálogo.
10. **F5-T13 aceptada: importar horas registradas en el cotizador** (precisa ADR 0025.16, que dejaba el horario extendido "a mano"): `ImportarHorasEntrada.origen` gana `'registradas'`. Por cada tarea con horas registradas, una línea `mano_de_obra` a `hora_normal` con las horas sin marca y otra "`<tarea> (fuera de horario)`" a `hora_extendida` (tarifa del cliente, si no la global; B12) con las marcadas; las horas de la OT sin tarea van en "Horas registradas sin tarea" con la misma separación. 409 `TARIFA_FALTANTE { concepto: 'hora_extendida' }` solo si hay horas fuera de horario; sin horas registradas, 400 `VALIDACION { origen }`. Cierra B4.
11. **Las horas no actualizan `actualizado_en` de la OT ni del ticket**.

### Decisiones de la spec (§14 y §16)

12. **`tarea_id` en `registro_horas`, "Sin ticket" e índice de celda** (precisa ADR 0025, consecuencias): migración 12 agrega `tarea_id` (`ON DELETE SET NULL`), `CHECK (tarea_id IS NULL OR ot_id IS NOT NULL)`, `CHECK` de descripción obligatoria sin destino, y el índice único parcial `registro_horas_celda_manual_uq` (persona, fecha, destino, tarea, descripción) sobre las filas sin `mensaje_id`.
13. **Celda = una fila manual + N filas de seguimiento**: el `input` de la celda edita solo la fila manual; con registros de seguimiento se abre el detalle. Una segunda fila manual en la misma celda → 409 `CONFLICTO { registro_id }` (comprobado antes del `INSERT`; el índice es la red).
14. **Una fila no cambia de destino**: `RegistroHorasEditar` no admite `ticket_id` ni `ot_id`; se borra y se crea. Es un objeto explícito con todo opcional (ADR 0023.19).
15. **Jornada del día con el mismo cálculo que los plazos** (precisa ADR 0005): `horasJornada`, `lunesDe` y `diasDeSemana` en `shared/horas-habiles`; `horasJornada` reutiliza `bloquesDelDia` con horario, colación y feriados generales y del departamento; sin departamento → `null`. "Fuera de horario" sigue siendo marca manual (B4).
16. **Ticket cerrado admite horas**; **OT final no** (precisa ADR 0024.2): crear, editar (horas o fecha) y borrar filas con `ot_id` de una OT cerrada o cancelada responden 409 `OT_CERRADA { horas }`, comprobado después del `FOR UPDATE`.
17. **Orden de bloqueo**: una mutación con `ticket_id` bloquea el ticket; con `ot_id` bloquea solo la OT; "Sin ticket" no bloquea nada; la fila `registro_horas` se bloquea después del destino.
18. **Mover tareas a otra OT desvincula `tarea_id`** (precisa ADR 0003 y 0023): las horas se trabajaron en la OT original y conservan `ot_id`; `horas.service.ts` exporta `desvincularTareas(tx, tarea_ids)` y `moverTareasAbiertas` la llama con el mismo `tx`.
19. **`horas_usadas_mes` del cliente** (precisa ADR 0015 y 0023.18): número en el contrato vigente, `null` en el historial, con la consulta `usadasMesDeContrato` extraída al módulo `clientes` (dueño de `contrato_bolsa`) y usada también por `ots.consulta.ts`.
20. **Dependencias entre módulos** (precisa ADR 0003): `mensajes/mensajes.acceso.ts` expone `fijarHorasDeMensaje(tx, mensaje_id, horas)`; `horas.service` lo importa y `mensajes.service` sigue importando `registrarHorasDesdeMensaje` de `horas.service`. Sin ciclo, misma técnica que `ots.acceso.ts` (ADR 0025.20). `tareas.service` importa `desvincularTareas` de `horas.service`.
21. **Rutas nuevas** (precisa ADR 0010): `GET /api/horas` (sesión; `usuario_id` ajeno exige `horas.ver_todas`), `POST /api/horas`, `PATCH /api/horas/:id`, `DELETE /api/horas/:id` (`tickets.editar`). Sin códigos de error nuevos.
22. **Pantalla 13 Horas** (precisa ADR 0011 y 0019): cuadrícula completa a ≥ 1024 px, scroll horizontal con primera columna fija entre 768 y 1024 px, vista por día bajo 768 px con el total del día fijo sobre la barra inferior; estado en la URL (`semana`, `usuario`); guardado por celda al perder el foco o con Enter, sin botón "Guardar"; vacío = borrar la fila manual.
23. **Sin exportación ni cierre de mes**: B3 y PLAN (Fases 6 y 7).

### Decisiones de la implementación

24. **`reiniciarBd` borra `registro_horas` primero** (precisa ADR 0020 y 0025.21): sus FK con `SET NULL` dejaban filas que violaban los `CHECK` nuevos al limpiar en orden hijos → padres.
25. **`DiaPlanilla.dia_semana` usa 0 = domingo**, como `horario_dia`; la web ordena por el índice de la columna, no por este campo.
26. **Errores del `PATCH`**: `descripcion: null` en una fila "Sin ticket" → 400 `VALIDACION { descripcion }`; `tarea_id` en una fila de ticket o "Sin ticket" → 400 `VALIDACION { tarea_id }`; en una fila de ticket u OT la `descripcion` se ignora.
27. **Orden de errores en `GET /api/horas`**: pedir la planilla ajena sin `horas.ver_todas` responde 403 antes del 404 de un usuario inexistente (no revela si el id existe).
28. **Semillas** (precisa ADR 0025.33): `desarrollo-horas.ts` siembra la semana actual de Sebastián Díaz con las cifras del diseño y 2 h de Valentina Soto en OT-0215 (costo interno $36.000). Solo inserta lo que falta, nunca borra ni pisa, y no siembra días futuros (si hoy es lunes, el martes queda fuera). Las horas de TK-1048 de la Fase 2 (3 h + 1 h desde una nota) pasan al viernes de la semana anterior para no ensuciar la planilla del diseño. La fila de 3 h de OT-0218 la deja `desarrollo-ots.ts` con su tarea y la fecha del lunes.
29. **Tests**: los de mutaciones e integraciones viven en `horas.mutaciones.test.ts` y `horas.integraciones.test.ts`; `clientes.test.ts` espera `horas_usadas_mes: 0` en el contrato vigente.

### Revisión de seguridad (F5-T11, commit `dddfbb3`)

30. **VULN-001 (corregido; precisa ADR 0003 y 0023)**: al desvincular tareas (cierre con `nueva_ot` o borrar una tarea) las filas manuales de una misma celda chocaban con `registro_horas_celda_manual_uq` y la API respondía 500. `desvincularTareas` fusiona antes las filas que colisionarían en una sola (suma de `horas`; `fuera_de_horario = bool_or`), prefiriendo la que ya no tenía tarea, y `quitarTarea` la llama antes del `DELETE` en vez de depender del `SET NULL` de la FK. Test en `horas.integraciones.test.ts`.
31. **Observaciones aceptadas**: la fusión puede dejar una fila de más de 24 h (la columna admite hasta 999,99; Zod limita la edición posterior) y `bool_or` puede marcar como fuera de horario horas que eran normales: es la única fusión conservadora, porque el índice no distingue `fuera_de_horario`.
32. **Observaciones opcionales no aplicadas**: `lunesDe` con años menores que 100 (`Date.UTC` los interpreta como 19xx) y la ausencia de una cota inferior de fecha. Quedan anotadas para una fase posterior.
33. La revisión con `/security-review` no encontró vulnerabilidades.

## Consecuencias

- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR.
- Toda vía que toque `registro_horas` respeta el orden ticket → OT → fila y la regla de ADR 0024.2 ampliada por el punto 16; toda vía que mueva o borre tareas pasa por `desvincularTareas`.
- La Fase 6 trae el despachador y los avisos; las Fases 6 y 7 la exportación de horas y los reportes (horas por semana, % facturables, carga vs capacidad). El cierre de mes, la edición de horas ajenas y la detección automática de "fuera de horario" siguen fuera.
- `preguntas-abiertas.md` no se edita: B3, B4 y B5 quedan aplicadas por los puntos 8, 10, 15 y 4.
