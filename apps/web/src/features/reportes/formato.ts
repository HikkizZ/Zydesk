const numero2 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const numero1 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

/** "32,8", "14" (sin unidad). */
export const numeroHoras = (n: number): string => numero2.format(n);

/** "1,5" (días con 1 decimal, spec fase 7 §4.13). */
export const numeroDias = (n: number): string => numero1.format(n);

/** "75 %" */
export const porcentaje = (n: number): string => `${n} %`;

/** "1 ticket abierto", "2 tickets abiertos" */
export const pluralizar = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;
