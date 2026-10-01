# ADR 0024 — Reglas de seguridad surgidas en la revisión de la Fase 3

**Estado**: aceptada · 2026-10-01 · precisa a ADR 0010, 0015, 0017 y 0023 (no cambia sus decisiones de fondo)

## Contexto

La revisión de seguridad de la Fase 3 (skill `sentry-security-review`, criterio de alta confianza) dejó tres hallazgos que las ADR no cubrían: los errores del lector del cuerpo (`body-parser`/`raw-body`) distintos de `entity.parse.failed` caían en el manejador genérico y respondían 500 registrándose como error del servidor; `POST /api/ots/:id/mensajes` aceptaba `horas` en una OT cerrada o cancelada y las sumaba a la bolsa del cliente (ADR 0015); y `PATCH /api/ots/:id`, con solo `tickets.editar`, permitía cambiar OC, condición de pago y "descuenta de la bolsa" después de que el cliente aprobó la OT. El usuario aprobó las tres reglas el 2026-10-01; están en los commits `0c22d93` y `94842d2`.

## Decisión

1. **Errores del lector del cuerpo son 4xx del cliente, no errores del servidor** (precisa ADR 0010 y 0017). El manejador único trata cualquier error con `status` 4xx y `type` de texto: `entity.too.large` → 413 `CUERPO_MUY_GRANDE`; `charset.unsupported` y `encoding.unsupported` → 415 `TIPO_NO_SOPORTADO`; el resto conserva su `status` con `VALIDACION`. Se registra con `logger.warn` solo `{ tipo, status }` (nunca el cuerpo) y no se emite `logger.error`. Los errores 5xx del flujo (`stream.*`) siguen siendo `INTERNO` y sí se registran como error. Ambos códigos viven en `shared/errores.ts`.
2. **Una OT final no registra horas** (precisa ADR 0015 y 0023.9). Los mensajes siguen permitidos en una OT cerrada o cancelada, pero si traen `horas` la petición responde 409 `OT_CERRADA` con `detalles.horas` y no escribe nada, también con `copiar_al_ticket`. La comprobación va tras `bloquearOt` (`FOR UPDATE`), así que no compite con un cierre o cancelación concurrentes. El único escritor de `registro_horas` sigue siendo `registrarHorasDesdeMensaje` desde `insertarMensaje`; el cierre inserta su seguimiento con `horas: null` y `copiarAlTicket` nunca copia horas. El `Redactor` recibe `sinHoras` y oculta el campo con la explicación.
3. **Los datos comerciales de una OT aprobada solo los cambia quien puede aprobar** (precisa ADR 0023.4). En `aprobada` y `en_ejecucion`, cambiar `oc_cliente`, `condicion_pago` o `descuenta_bolsa` exige `ots.aprobar`; sin él la API responde 403 `SIN_PERMISO` con `detalles.campos` (solo los que de verdad cambian: reenviar el valor actual no cuenta) antes de validar o escribir, por lo que no queda `evento`. En Borrador y Cotizada se mantiene `tickets.editar`; el tipo y el cliente ya solo se cambian en Borrador (`OT_TIPO_BLOQUEADO`). La web deja los tres campos en solo lectura con un texto que lo explica; el resto del formulario sigue editable.

## Consecuencias

- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR.
- Las tres reglas tienen tests de integración (`ruta.test.ts`, `mensajes-ot.test.ts`, `ots.test.ts`) y de la web (`OtDetallePage.test.tsx`); los tests del punto 3 cubren `oc_cliente` y `condicion_pago`; `descuenta_bolsa` se cubre solo por código.
- Toda vía nueva que escriba `registro_horas` con `ot_id` o que toque `oc_cliente`, `condicion_pago` o `contrato_id` fuera de Borrador debe respetar estas reglas; la planilla de horas de la Fase 5 y el cotizador de la Fase 4 las heredan.
