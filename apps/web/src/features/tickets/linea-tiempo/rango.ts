import type { DiaLineaTiempoDatos } from '@/features/tickets/api';

export const ESCALAS = ['dia', '2semanas', 'mes'] as const;
export type Escala = (typeof ESCALAS)[number];

export const ETIQUETA_ESCALA: Record<Escala, string> = {
  dia: 'Día',
  '2semanas': '2 semanas',
  mes: 'Mes',
};

// Dos semanas = 10 días hábiles (ADR 0016); se piden 20 días corridos y se recorta.
export const HABILES_2_SEMANAS = 10;
const DIAS_PEDIDOS_2_SEMANAS = 20;

const DIA_MS = 86_400_000;

// Fechas `AAAA-MM-DD` sin zona: se operan en UTC para no correrse de día.
const aMs = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`);
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const sumarDias = (fecha: string, n: number) => deMs(aMs(fecha) + n * DIA_MS);

// 0 = domingo … 6 = sábado
export const diaDeSemana = (fecha: string) => new Date(aMs(fecha)).getUTCDay();

export const lunesDeSemana = (fecha: string) => sumarDias(fecha, -((diaDeSemana(fecha) + 6) % 7));

export const primerDiaDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

export function ultimoDiaDelMes(fecha: string) {
  const d = new Date(aMs(primerDiaDelMes(fecha)));
  return deMs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function sumarMeses(fecha: string, n: number) {
  const d = new Date(aMs(primerDiaDelMes(fecha)));
  return deMs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export function esFechaIso(valor: string | null): valor is string {
  return valor !== null && /^\d{4}-\d{2}-\d{2}$/.test(valor) && deMs(aMs(valor)) === valor;
}

export function desdePorDefecto(escala: Escala, hoy: string) {
  return escala === 'dia' ? hoy : escala === 'mes' ? primerDiaDelMes(hoy) : lunesDeSemana(hoy);
}

export function normalizarDesde(escala: Escala, desde: string) {
  return escala === 'mes' ? primerDiaDelMes(desde) : desde;
}

// Rango que se pide a la API.
export function consultaDeEscala(escala: Escala, desde: string) {
  if (escala === 'dia') return { desde, hasta: desde };
  if (escala === 'mes') return { desde, hasta: ultimoDiaDelMes(desde) };
  return { desde, hasta: sumarDias(desde, DIAS_PEDIDOS_2_SEMANAS) };
}

// Rango que se dibuja: solo días hábiles (A8), recortado a la escala.
export function rangoDeEscala(escala: Escala, desde: string, dias: DiaLineaTiempoDatos[]) {
  if (escala === 'dia') {
    return { desde, hasta: desde, columnas: dias.filter((d) => d.habil && d.fecha === desde) };
  }
  if (escala === 'mes') {
    const hasta = ultimoDiaDelMes(desde);
    return {
      desde,
      hasta,
      columnas: dias.filter((d) => d.habil && d.fecha >= desde && d.fecha <= hasta),
    };
  }
  const columnas = dias.filter((d) => d.habil && d.fecha >= desde).slice(0, HABILES_2_SEMANAS);
  return { desde, hasta: columnas.at(-1)?.fecha ?? desde, columnas };
}

// ‹ ›: día (saltando fines de semana), 2 semanas o mes.
export function moverRango(escala: Escala, desde: string, sentido: 1 | -1) {
  if (escala === 'mes') return sumarMeses(desde, sentido);
  if (escala === '2semanas') return sumarDias(desde, 14 * sentido);
  let nuevo = sumarDias(desde, sentido);
  while ([0, 6].includes(diaDeSemana(nuevo))) nuevo = sumarDias(nuevo, sentido);
  return nuevo;
}
