# ADR 0005 — Motor de horas hábiles, fechas y feriados

**Estado**: aceptada · 2026-09-29 · precisada por ADR 0021 (Fase 2)

## Contexto

Los plazos por categoría se expresan en horas o días **hábiles** según el horario del departamento del responsable principal (por día: activo, entrada, salida, colación) y el calendario de feriados de Chile. El mismo motor alimenta capacidad/carga, "fuera de jornada" y reportes ("resolución promedio en días hábiles"). Zona horaria America/Santiago (con cambio de hora dos veces al año). El front debe poder mostrar la fecha límite calculada antes de guardar.

## Opciones consideradas

| Librería | A favor | En contra |
|---|---|---|
| **date-fns v4 + `@date-fns/tz`** | Funcional, tree-shakeable, `TZDate` hace que cada operación respete la zona; locale `es`; se usa igual en front y API. | Zonas con `TZDate` requieren disciplina (crear siempre con la zona). |
| Luxon | API cómoda con zonas. | Otra API distinta a date-fns; más pesado en el front. |
| Temporal | Es el futuro. | Aún requiere polyfill en Node 22 y navegadores; no para producción hoy. |

## Decisión

- **date-fns v4 + @date-fns/tz**, con `ZONA = 'America/Santiago'` constante en `shared`. La API y los tests corren con `TZ=UTC`; toda aritmética de calendario usa `TZDate` en la zona.
- **Almacenamiento**: `timestamptz` en Postgres, ISO 8601 en JSON. Horarios del departamento como texto `HH:mm` (hora local) y minutos.
- **Modelo de horario**: `horario_dia(departamento_id, dia_semana 0-6, activo, entrada, salida, colacion_inicio, colacion_min)`. La jornada del día son dos bloques: `[entrada, colacion_inicio)` y `[colacion_inicio + colacion_min, salida)`. Por defecto colación 13:00 / 60 min (la spec y el diseño solo muestran la duración; ver preguntas abiertas). Jornada semanal = suma de bloques.
- **Feriados**: tabla `feriado(fecha, nombre, departamento_id NULL = todos)`. Semilla en `apps/api/src/seeds/feriados-cl.json` con los feriados legales de Chile del año en curso y el siguiente, cargada al iniciar si no existen. Administración los edita en Configuración → Departamentos y horarios (agregar/quitar). **Sin consumo de APIs externas**: la lista chilena cambia poco y a veces se decreta un feriado nuevo; editarlo a mano es más simple y confiable que depender de un servicio.
- **Motor** en `packages/shared/src/horas-habiles/` (puro, sin BD): recibe `{ horario: HorarioDia[], feriados: string[] }` y expone
  - `sumarHorasHabiles(desde, horas, cal)` — avanza por bloques; si `desde` cae fuera de jornada, empieza en el próximo bloque hábil.
  - `sumarDiasHabiles(desde, dias, cal)` — cuenta días con jornada activa y no feriados; conserva la hora de `desde`, recortada a la jornada.
  - `horasHabilesEntre(a, b, cal)` — para reportes y "% dentro de plazo".
  - `esHoraExtendida(fecha, cal)` — `>= hora_extendida_desde` o fuera de jornada.
- **Plazo por categoría**: `plazo(valor, unidad ∈ {horas, dias})`. Al crear un ticket sin fecha límite: `fecha_limite = sumar…(inicio_planificado ?? ahora, plazo_resolucion[prioridad], calendario del departamento del responsable principal)`. Si no hay responsable, se usa el del responsable por defecto de la categoría. Cambiar de responsable principal **no** recalcula fechas ya fijadas (se registra en historial, la persona ajusta a mano si corresponde).
- El front llama a `POST /api/plazos/calcular` (que usa el mismo motor con el calendario real) para la vista previa; así no hay que enviar el calendario completo al navegador.

## Consecuencias

- Tests de tabla en `shared`: cruces de colación, viernes corto, fin de semana, feriado, cambio de hora (abril/septiembre), inicio fuera de jornada. Son la única defensa real contra errores de calendario.
- El motor no sabe de personas ni tickets: recibe calendarios y devuelve fechas, lo que lo hace testeable y reutilizable en reportes.
- Riesgo asumido: las horas registradas en la planilla semanal no tienen hora de inicio, por lo que "fuera de horario" en ese registro es una marca manual (ADR y preguntas abiertas), no una derivación del motor.
