const formatoNumero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

/** "3,5 h", "0 h" */
export const formatearHoras = (n: number): string => `${formatoNumero.format(n)} h`;

/** "3,5" para las celdas de la planilla; vacío si es 0. */
export const horasCorto = (n: number): string => (n === 0 ? '' : formatoNumero.format(n));
