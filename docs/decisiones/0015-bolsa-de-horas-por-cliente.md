# ADR 0015 — Bolsa de horas opcional por cliente

**Estado**: aceptada · 2026-09-29 · cierra la pregunta abierta B6 · precisada por ADR 0023 (Fase 3)

## Contexto

La spec (4.9) describe en la ficha de cliente un contrato "soporte por horas con bolsa mensual, horas usadas vs disponibles, fecha de renovación". La pregunta B6 proponía sumar todas las horas de OT facturables del cliente. El usuario decidió (2026-09-29) que la bolsa sea **opcional** y que solo descuenten las OT marcadas explícitamente.

## Opciones consideradas

1. Descontar automáticamente todas las horas de OT facturables del cliente — simple, pero mezcla trabajos cotizados aparte con el soporte contratado.
2. **Vincular cada OT a la bolsa mediante una casilla** — decide la persona que crea la OT; el cálculo es una suma directa.
3. Descontar por línea de registro de horas — control fino, pero mucha fricción en la planilla semanal.

## Decisión

Opción 2.

- **Modelo**: `contrato_bolsa(id, cliente_id, horas_mes numeric(6,1), vigente_desde date, vigente_hasta date?, fecha_renovacion date?, notas)`. Un cliente puede tener **cero** contratos; a lo sumo uno vigente a la vez (validación en el servicio). `ot.contrato_id` nullable → `contrato_bolsa`.
- **Vigente** = `vigente_desde ≤ hoy` y (`vigente_hasta` nulo o `≥ hoy`), en `America/Santiago`.
- **Ficha de cliente**: sección "Bolsa de horas" solo si el cliente tiene algún contrato; muestra horas del mes (usadas / contratadas), fecha de renovación e historial de contratos. El botón "Agregar bolsa" aparece en la ficha para Administración y Coordinación (`config.editar` o `ots.aprobar`).
- **OT**: al crear o editar una OT **facturable** de un cliente con bolsa vigente, casilla **"Descuenta de la bolsa"** que fija `contrato_id` al contrato vigente. Si la OT no es facturable o el cliente no tiene bolsa vigente, la casilla no se muestra. Si la OT pasa a interna o cambia de cliente, `contrato_id` se pone en null. El campo es rastreado por `registrarCambios` (Evento "Descuenta de la bolsa: sí/no").
- **Horas usadas del mes** = `SUM(registro_horas.horas)` de las filas cuya OT tiene `contrato_id` = ese contrato y cuya fecha cae en el mes calendario. Es una consulta, no un campo materializado; se expone en `GET /api/clientes/:id` (`bolsa: { horas_mes, usadas_mes, restantes_mes }`) y en `GET /api/ots/:id` (para mostrar "Descuenta de la bolsa · 12,5 / 20 h usadas este mes").
- **Sin alertas automáticas en v1**: no hay aviso al 80 % ni bloqueo al superar la bolsa; el saldo puede quedar negativo y se muestra en rojo. El aviso al 80 % es mejora futura (evento `bolsa.por_agotarse` en el despachador de ADR 0008).

## Consecuencias

- Clientes sin bolsa no ven nada nuevo: ni sección ni casilla.
- El reporte de facturación puede separar "horas de bolsa" de "horas a cotizar" con un join por `contrato_id`, sin cálculo adicional.
- Renovar un contrato = cerrar el vigente (`vigente_hasta`) y crear otro; las OT antiguas conservan su `contrato_id` y el historial de meses anteriores queda intacto.
- No se soportan bolsas acumulables (horas no usadas que pasan al mes siguiente); si se necesita, es una nueva ADR.
