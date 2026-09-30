import { ZONA } from '@zydesk/shared';

// Fechas y horas siempre en la zona de la app (America/Santiago), sin importar la del navegador.
const formatoHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatoFechaHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "14:05" */
export const formatearHora = (iso: string | Date): string => formatoHora.format(new Date(iso));

/** "30 sept 2026, 14:05" */
export const formatearFechaHora = (iso: string | Date): string =>
  formatoFechaHora.format(new Date(iso));
