import type { CotizacionEntrada, LineaCalculo } from '@zydesk/shared';
import type { z } from 'zod';
import type { CotizacionSalidaDatos } from './api';

// Valores del formulario: la entrada de Zod (el `default` de `descuento_pct` aún sin aplicar).
export type ValoresCotizacion = z.input<typeof CotizacionEntrada>;
export type ValoresLinea = ValoresCotizacion['lineas'][number];

export const valoresDe = (c: CotizacionSalidaDatos): ValoresCotizacion => ({
  contacto_id: c.contacto?.id ?? null,
  fecha_emision: c.fecha_emision,
  validez_dias: c.validez_dias,
  moneda: c.moneda,
  valor_uf: c.valor_uf,
  aplica_iva: c.aplica_iva,
  condiciones: c.condiciones,
  nota_interna: c.nota_interna,
  lineas: c.lineas.map((l) => ({
    tipo: l.tipo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    descuento_pct: l.descuento_pct,
  })),
});

// Un campo vacío o inválido llega como NaN o `undefined`: cuenta como 0 en el cálculo en vivo
// (el formulario muestra el error y no deja guardar).
const finito = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export const lineasParaCalculo = (lineas: Partial<ValoresLinea>[] | undefined): LineaCalculo[] =>
  (lineas ?? []).map((l) => ({
    cantidad: finito(l?.cantidad),
    precio_unitario: finito(l?.precio_unitario),
    descuento_pct: finito(l?.descuento_pct),
  }));

// Una opción vacía en un `Select` de Radix necesita un valor explícito.
export const SIN_VALOR = '__ninguno__';
