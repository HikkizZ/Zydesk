import { TZDate } from '@date-fns/tz';
import { ZONA } from '../formato/fecha.js';
import type { Calendario, HorarioDia } from './tipos.js';

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** Bloques de la jornada en minutos desde medianoche local. */
function bloquesEnMinutos(h: HorarioDia): Array<[number, number]> {
  if (!h.activo) return [];
  const entrada = aMinutos(h.entrada);
  const salida = aMinutos(h.salida);
  let bloques: Array<[number, number]>;
  if (h.colacion_min <= 0) {
    bloques = [[entrada, salida]];
  } else {
    const colIni = aMinutos(h.colacion_inicio);
    bloques = [
      [entrada, Math.min(colIni, salida)],
      [Math.max(colIni + h.colacion_min, entrada), salida],
    ];
  }
  return bloques.filter(([ini, fin]) => fin > ini);
}

export function claveFecha(d: TZDate): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function aLocal(fecha: Date): TZDate {
  return new TZDate(fecha, ZONA);
}

/** Medianoche local n días después del día de `d`. */
export function diaMasN(d: TZDate, n: number): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + n, ZONA);
}

/** Fecha en el día local de `dia` a `minutos` desde medianoche. */
export function fechaLocal(dia: TZDate, minutos: number): TZDate {
  return new TZDate(
    dia.getFullYear(),
    dia.getMonth(),
    dia.getDate(),
    Math.floor(minutos / 60),
    minutos % 60,
    ZONA,
  );
}

export function horaLocalEnMinutos(fecha: Date): number {
  const d = aLocal(fecha);
  return d.getHours() * 60 + d.getMinutes();
}

export function bloquesDelDia(fecha: Date, cal: Calendario): Array<{ inicio: Date; fin: Date }> {
  const dia = aLocal(fecha);
  if (cal.feriados.includes(claveFecha(dia))) return [];
  const horario = cal.horario.find((h) => h.dia_semana === dia.getDay());
  if (!horario) return [];
  return bloquesEnMinutos(horario).map(([ini, fin]) => ({
    inicio: new Date(fechaLocal(dia, ini).getTime()),
    fin: new Date(fechaLocal(dia, fin).getTime()),
  }));
}

export function jornadaSemanalHoras(horario: HorarioDia[]): number {
  const minutos = horario.reduce(
    (total, h) => total + bloquesEnMinutos(h).reduce((s, [ini, fin]) => s + (fin - ini), 0),
    0,
  );
  return Math.round((minutos / 60) * 10) / 10;
}
