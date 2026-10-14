import {
  aLocal,
  aMinutos,
  bloquesDelDia,
  bloquesEnMinutos,
  diaMasN,
  fechaLocal,
  horaLocalEnMinutos,
} from './calendario.js';
import type { Calendario, Plazo } from './tipos.js';

const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const LIMITE_DIAS = 400;
const ERROR_SIN_DIAS = 'Calendario sin días hábiles';

export function sumarHorasHabiles(desde: Date, horas: number, cal: Calendario): Date {
  let restante = horas * MS_HORA;
  const dia0 = aLocal(desde);
  for (let i = 0; i <= LIMITE_DIAS; i++) {
    const dia = diaMasN(dia0, i);
    for (const { inicio, fin } of bloquesDelDia(dia, cal)) {
      if (desde.getTime() >= fin.getTime()) continue;
      const comienzo = Math.max(desde.getTime(), inicio.getTime());
      const disponible = fin.getTime() - comienzo;
      if (restante <= disponible) return new Date(comienzo + restante);
      restante -= disponible;
    }
  }
  throw new Error(ERROR_SIN_DIAS);
}

export function siguienteInicioHabil(desde: Date, cal: Calendario): Date {
  return sumarHorasHabiles(desde, 0, cal);
}

export function sumarDiasHabiles(desde: Date, dias: number, cal: Calendario): Date {
  const dia0 = aLocal(desde);
  const minutos = horaLocalEnMinutos(desde);
  let contados = 0;
  for (let i = 1; i <= LIMITE_DIAS; i++) {
    const dia = diaMasN(dia0, i);
    const bloques = bloquesDelDia(dia, cal);
    if (bloques.length === 0) continue;
    contados++;
    if (contados < dias) continue;
    const primero = bloques[0]!.inicio;
    const ultimo = bloques[bloques.length - 1]!.fin;
    const propuesto = fechaLocal(dia, minutos);
    if (propuesto.getTime() < primero.getTime()) return primero;
    if (propuesto.getTime() > ultimo.getTime()) return ultimo;
    return new Date(propuesto.getTime());
  }
  throw new Error(ERROR_SIN_DIAS);
}

export function sumarPlazo(desde: Date, plazo: Plazo, cal: Calendario): Date {
  return plazo.unidad === 'horas'
    ? sumarHorasHabiles(desde, plazo.valor, cal)
    : sumarDiasHabiles(desde, plazo.valor, cal);
}

// Milisegundo del día local de `fecha` (hora de pared) y su día como UTC de la fecha local (aritmética de
// calendario). Los bloques de jornada se comparan en hora de pared: el cambio de hora de Chile ocurre a las
// 24:00 de un sábado, antes de cualquier bloque, así que dentro de un bloque la hora de pared avanza como el reloj.
function ubicar(fecha: Date): { dia: number; ms: number } {
  const l = aLocal(fecha);
  return {
    dia: Date.UTC(l.getFullYear(), l.getMonth(), l.getDate()),
    ms: ((l.getHours() * 60 + l.getMinutes()) * 60 + l.getSeconds()) * 1000 + l.getMilliseconds(),
  };
}

export function horasHabilesEntre(a: Date, b: Date, cal: Calendario): number {
  if (a.getTime() > b.getTime()) return 0 - horasHabilesEntre(b, a, cal);
  // Un solo recorrido por los días locales sin construir una fecha con zona por día (era lo caro): equivale a
  // sumar la intersección de [a, b] con los bloques de cada día (test de equivalencia en motor.test.ts).
  const bloquesPorDiaSemana = new Map<number, Array<[number, number]>>();
  for (const h of cal.horario) {
    bloquesPorDiaSemana.set(
      h.dia_semana,
      bloquesEnMinutos(h).map(([ini, fin]) => [ini * 60_000, fin * 60_000]),
    );
  }
  const feriados = new Set(cal.feriados);
  const desde = ubicar(a);
  const hasta = ubicar(b);
  let ms = 0;
  for (let t = desde.dia; t <= hasta.dia; t += MS_DIA) {
    const dia = new Date(t);
    if (feriados.has(dia.toISOString().slice(0, 10))) continue;
    const piso = t === desde.dia ? desde.ms : 0;
    const techo = t === hasta.dia ? hasta.ms : MS_DIA;
    for (const [ini, fin] of bloquesPorDiaSemana.get(dia.getUTCDay()) ?? []) {
      const entre = Math.min(fin, techo) - Math.max(ini, piso);
      if (entre > 0) ms += entre;
    }
  }
  return Math.round((ms / MS_HORA) * 100) / 100;
}

export function esHoraExtendida(fecha: Date, cal: Calendario): boolean {
  const t = fecha.getTime();
  const dentro = bloquesDelDia(fecha, cal).some(
    ({ inicio, fin }) => t >= inicio.getTime() && t < fin.getTime(),
  );
  if (!dentro) return true;
  return (
    cal.hora_extendida_desde !== undefined &&
    horaLocalEnMinutos(fecha) >= aMinutos(cal.hora_extendida_desde)
  );
}
