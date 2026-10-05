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

// Valor de la UF en pesos, siempre con dos decimales: '$41.098,15'
const formatoValorUf = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearValorUf(n: number): string {
  return formatoValorUf.format(n).replace('$-', '-$');
}
