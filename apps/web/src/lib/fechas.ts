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

const formatoFechaLarga = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "jueves 1 de octubre" a partir de `AAAA-MM-DD` (fecha sin zona: no se corre de día). */
export const formatearFechaLarga = (fecha: string): string =>
  formatoFechaLarga.format(new Date(`${fecha}T00:00:00Z`)).replace(',', '');
