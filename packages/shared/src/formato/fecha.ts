import { TZDate } from '@date-fns/tz';
import { getDate, getMonth, getYear } from 'date-fns';

export const ZONA = 'America/Santiago';

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatearFecha(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new TZDate(fecha, ZONA) : new TZDate(fecha, ZONA);
  return `${getDate(d)} ${MESES_CORTOS[getMonth(d)]} ${getYear(d)}`;
}
