import { addDays, format, parseISO } from 'date-fns';
import type { Moneda } from '../enums/cotizacion.js';

// ADR 0007: la única implementación del cálculo de cotizaciones (front, API y exportadores).
export interface LineaCalculo {
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
}
export interface ParametrosCalculo {
  moneda: Moneda;
  aplica_iva: boolean;
  iva_pct: number;
}
export interface TotalesCotizacion {
  subtotal: number;
  descuentos: number;
  neto: number;
  iva: number;
  total: number;
}

export function decimalesDe(moneda: Moneda): 0 | 2 {
  return moneda === 'CLP' ? 0 : 2;
}

// Half-up para montos >= 0; el EPSILON evita 1,005 -> 1,00 por la representación binaria.
export function redondear(n: number, moneda: Moneda): number {
  const f = 10 ** decimalesDe(moneda);
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function totalLinea(l: LineaCalculo, moneda: Moneda): number {
  return redondear(l.cantidad * l.precio_unitario * (1 - l.descuento_pct / 100), moneda);
}

export function calcularCotizacion(
  lineas: LineaCalculo[],
  p: ParametrosCalculo,
): { lineas: number[] } & TotalesCotizacion {
  const totales = lineas.map((l) => totalLinea(l, p.moneda));
  const subtotal = redondear(
    lineas.reduce((acc, l) => acc + redondear(l.cantidad * l.precio_unitario, p.moneda), 0),
    p.moneda,
  );
  const neto = redondear(
    totales.reduce((acc, t) => acc + t, 0),
    p.moneda,
  );
  const descuentos = redondear(subtotal - neto, p.moneda);
  const iva = p.aplica_iva ? redondear((neto * p.iva_pct) / 100, p.moneda) : 0;
  return {
    lineas: totales,
    subtotal,
    descuentos,
    neto,
    iva,
    total: redondear(neto + iva, p.moneda),
  };
}

export function enClp(monto: number, moneda: Moneda, valor_uf: number | null): number | null {
  if (moneda === 'CLP') return monto;
  if (valor_uf === null) return null;
  return redondear(monto * valor_uf, 'CLP');
}

export interface TarifaConMoneda {
  moneda: Moneda;
  valor: number;
}

// Precio unitario de una tarifa expresado en la moneda de la cotización, redondeado como monto de esa
// moneda (ADR 0007, Fase 8b). Si hace falta convertir y valor_uf es null → null.
export function convertirTarifa(
  t: TarifaConMoneda,
  destino: Moneda,
  valor_uf: number | null,
): number | null {
  if (t.moneda === destino) return t.valor;
  if (valor_uf === null) return null;
  return destino === 'CLP'
    ? redondear(t.valor * valor_uf, 'CLP')
    : redondear(t.valor / valor_uf, 'UF');
}

// Suma días calendario a una fecha AAAA-MM-DD, sin zona horaria.
export function venceEl(fecha_emision: string, validez_dias: 15 | 30): string {
  return format(addDays(parseISO(fecha_emision), validez_dias), 'yyyy-MM-dd');
}
