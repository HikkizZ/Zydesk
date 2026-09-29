const formato = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatearCLP(monto: number): string {
  // es-CL devuelve "$-4.500"; la spec exige "-$4.500"
  return formato.format(monto).replace('$-', '-$');
}
