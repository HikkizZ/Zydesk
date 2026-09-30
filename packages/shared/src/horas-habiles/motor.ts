import {
  aLocal,
  aMinutos,
  bloquesDelDia,
  diaMasN,
  fechaLocal,
  horaLocalEnMinutos,
} from './calendario.js';
import type { Calendario, Plazo } from './tipos.js';

const MS_HORA = 3_600_000;
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

export function horasHabilesEntre(a: Date, b: Date, cal: Calendario): number {
  if (a.getTime() > b.getTime()) return 0 - horasHabilesEntre(b, a, cal);
  const dia0 = aLocal(a);
  const ultimo = aLocal(b).getTime();
  let ms = 0;
  for (let i = 0; ; i++) {
    const dia = diaMasN(dia0, i);
    if (dia.getTime() > ultimo) break;
    for (const { inicio, fin } of bloquesDelDia(dia, cal)) {
      const ini = Math.max(inicio.getTime(), a.getTime());
      const fn = Math.min(fin.getTime(), b.getTime());
      if (fn > ini) ms += fn - ini;
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
