import { ZONA } from '@zydesk/shared';

// AAAA-MM-DD de hoy en Santiago (única copia; `horas.tipos.ts` y `ots.comun.ts` la reexportan).
export const hoyEnSantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
