import { TZDate } from '@date-fns/tz';
import { ZONA } from '../formato/fecha.js';
import { bloquesDelDia } from './calendario.js';
import type { Calendario } from './tipos.js';

const MS_DIA = 86_400_000;

function aUtc(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a!, m! - 1, d!);
}

function desdeUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Horas de jornada de un día (AAAA-MM-DD): 0 si está inactivo o es feriado (misma definición que los plazos). */
export function horasJornada(fecha: string, cal: Calendario): number {
  const [a, m, d] = fecha.split('-').map(Number);
  // mediodía local: evita cualquier borde de cambio de hora
  const medio = new Date(new TZDate(a!, m! - 1, d!, 12, 0, ZONA).getTime());
  const ms = bloquesDelDia(medio, cal).reduce(
    (s, b) => s + (b.fin.getTime() - b.inicio.getTime()),
    0,
  );
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** Lunes (AAAA-MM-DD) de la semana ISO de `fecha`. */
export function lunesDe(fecha: string): string {
  const ms = aUtc(fecha);
  const diaSemana = new Date(ms).getUTCDay(); // 0 = domingo
  return desdeUtc(ms - ((diaSemana + 6) % 7) * MS_DIA);
}

/** Las 7 fechas (lunes a domingo) de la semana que empieza en `lunes`. */
export function diasDeSemana(lunes: string): string[] {
  const base = aUtc(lunes);
  return Array.from({ length: 7 }, (_, i) => desdeUtc(base + i * MS_DIA));
}
