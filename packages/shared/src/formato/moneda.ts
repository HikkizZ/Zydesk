import type { Moneda } from '../enums/cotizacion.js';

const formato = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatearCLP(monto: number): string {
  // es-CL devuelve "$-4.500"; la spec exige "-$4.500"
  return formato.format(monto).replace('$-', '-$');
}

const formatoUf = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearMonto(n: number, moneda: Moneda): string {
  if (moneda === 'CLP') return formatearCLP(n);
  const abs = formatoUf.format(Math.abs(n));
  return n < 0 ? `-UF ${abs}` : `UF ${abs}`;
}
