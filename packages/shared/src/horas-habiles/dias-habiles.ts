import { TZDate } from '@date-fns/tz';
import { ZONA } from '../formato/fecha.js';
import { jornadaSemanalHoras } from './calendario.js';
import { horasJornada } from './jornada.js';
import { horasHabilesEntre } from './motor.js';
import type { Calendario, HorarioDia } from './tipos.js';

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Resolución en días hábiles (ADR 0005): cada día de [a, b] aporta (horas hábiles de ese tramo) / (jornada del día), como máximo 1. */
export function diasHabilesEntre(a: Date, b: Date, cal: Calendario): number {
  if (b.getTime() <= a.getTime()) return 0;
  const ini = new TZDate(a.getTime(), ZONA);
  const fin = new TZDate(b.getTime(), ZONA);
  let total = 0;
  let y = ini.getFullYear();
  let m = ini.getMonth();
  let d = ini.getDate();
  const ultimo = fin.getFullYear() * 10_000 + fin.getMonth() * 100 + fin.getDate();
  for (;;) {
    const clave = y * 10_000 + m * 100 + d;
    if (clave > ultimo) break;
    const jornada = horasJornada(`${y}-${dosDigitos(m + 1)}-${dosDigitos(d)}`, cal);
    if (jornada > 0) {
      const inicioDia = new Date(new TZDate(y, m, d, 0, 0, ZONA).getTime());
      const finDia = new Date(new TZDate(y, m, d + 1, 0, 0, ZONA).getTime());
      const desde = a.getTime() > inicioDia.getTime() ? a : inicioDia;
      const hasta = b.getTime() < finDia.getTime() ? b : finDia;
      total += Math.min(1, horasHabilesEntre(desde, hasta, cal) / jornada);
    }
    const sig = new Date(Date.UTC(y, m, d + 1));
    y = sig.getUTCFullYear();
    m = sig.getUTCMonth();
    d = sig.getUTCDate();
  }
  return Math.round(total * 100) / 100;
}

/** Jornada semanal / días activos; 0 si no hay ninguno. Convierte plazos en horas a días (§4.6). */
export function jornadaDiariaPromedio(horario: HorarioDia[]): number {
  const activos = horario.filter((h) => h.activo).length;
  if (activos === 0) return 0;
  return Math.round((jornadaSemanalHoras(horario) / activos) * 100) / 100;
}
