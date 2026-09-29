# ADR 0007 — Montos, moneda, IVA y redondeo

**Estado**: aceptada · 2026-09-29

## Contexto

CLP sin decimales (`$565.250`), opción UF (con decimales), IVA 19 % desactivable por cotización, descuentos en % por línea, totales recalculados en vivo en el front y validados en la API, y exportación a .xlsx/PDF que debe cuadrar al peso. Las tarifas (hora normal, extendida, urgencia, traslado por km, costo interno) son globales, con tarifas acordadas por cliente.

## Opciones consideradas

1. `integer` para todo — exacto y simple, pero no admite UF.
2. `numeric(14,2)` + transformer a `number` — una sola representación para CLP (siempre `.00`) y UF (2 decimales); `number` de JS es exacto para estos rangos si se redondea en cada paso.
3. `numeric` + librería de decimales (decimal.js/big.js) — precisión garantizada, pero agrega dependencia y verbosidad para sumar cinco líneas.

## Decisión

Opción 2.

- **BD**: montos y precios unitarios `numeric(14,2)` con `CHECK (>= 0)`; porcentajes `numeric(5,2)`; cantidades `numeric(10,2)` (horas fraccionarias). Transformer de columna a `number`. Tarifas (`configuracion`) y `tarifa_cliente` en CLP entero (`numeric(14,2)` igual, por uniformidad).
- **Snapshot fiscal por cotización**: `cotizacion.moneda ∈ {CLP, UF}`, `aplica_iva bool`, `iva_pct numeric(5,2)` copiado de la configuración al crear (si el IVA cambiara por ley, las cotizaciones antiguas no se alteran). Si `moneda = UF`, `valor_uf numeric(12,2)` ingresado a mano en el encabezado (la app no consulta el valor de la UF; solo sirve para mostrar el equivalente en CLP en el PDF).
- **Cálculo único** en `packages/shared/src/cotizacion/calcular.ts`, usado por el front (en vivo), la API (al guardar: recalcula y **descarta** los totales enviados por el cliente) y los exportadores:
  ```
  totalLinea = redondear(cantidad × precio × (1 − descuento/100))
  subtotal   = Σ redondear(cantidad × precio)
  descuentos = subtotal − Σ totalLinea
  neto       = Σ totalLinea
  iva        = aplica_iva ? redondear(neto × iva_pct/100) : 0
  total      = neto + iva
  ```
  `redondear` = 0 decimales en CLP, 2 en UF (half-up). Se redondea **por línea** y luego se suma, que es lo que hace una planilla y lo que el cliente va a recalcular a mano.
- **Formato** (`shared/formato.ts`): `formatearMonto(n, moneda)` → `$565.250` / `UF 12,50` con `Intl.NumberFormat('es-CL')`. Fechas con `date-fns` locale `es`.
- **OT interna**: `costo_interno = horas_reales × tarifa_costo_interno` calculado al vuelo (no se guarda), sin IVA.
- **Excel**: las celdas llevan números y fórmulas (`=C5*E5*(1-F5/100)`) con formato `#,##0` para que el cliente pueda editar; el PDF usa los valores calculados por `shared`.

## Consecuencias

- Front y API no pueden discrepar: la API es la fuente y el front solo previsualiza con la misma función.
- Con 2 decimales y `number`, los tests deben cubrir casos de redondeo (`0.5`, descuentos que dan `.005`); si alguna vez aparece un caso que `number` no representa, se cambia solo `redondear` por una versión con enteros escalados sin tocar el resto.
- Exportar en UF muestra también el total en CLP al `valor_uf` declarado, con leyenda "valor UF al [fecha]".
