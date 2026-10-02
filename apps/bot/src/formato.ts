import { ZONA } from '@zydesk/shared';

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Partes numéricas en Santiago (en-US para no depender del locale del sistema).
function partes(fecha: Date): { m: number; d: number; h: number; min: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(fecha)) v[p.type] = Number(p.value);
  return { m: v['month'] ?? 1, d: v['day'] ?? 1, h: v['hour'] ?? 0, min: v['minute'] ?? 0 };
}

const mesCorto = (m: number) => (MESES[m - 1] ?? '').slice(0, 3);

/** «30 sep» */
export function fechaCorta(fecha: Date | string): string {
  const p = partes(new Date(fecha));
  return `${p.d} ${mesCorto(p.m)}`;
}

/** «1 oct 10:15» */
export function fechaHoraCorta(fecha: Date | string): string {
  const p = partes(new Date(fecha));
  const hora = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
  return `${p.d} ${mesCorto(p.m)} ${hora}`;
}

/** «jueves 1 de octubre» a partir de AAAA-MM-DD */
export function fechaLargaDeIso(fechaIso: string): string {
  const [y = 0, m = 1, d = 1] = fechaIso.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
  return `${dia} ${d} de ${MESES[m - 1] ?? ''}`;
}

export function enlace(base: string, ruta: string, texto: string): string {
  const href = escaparHtml(base + ruta).replace(/"/g, '&quot;');
  return `<a href="${href}">${escaparHtml(texto)}</a>`;
}

/** Hasta `max` líneas; `mas` = lo que falta respecto de `total`. */
export function listaConMas(
  lineas: string[],
  total: number,
  max = 5,
): { lineas: string[]; mas: number } {
  const mostradas = lineas.slice(0, max);
  return { lineas: mostradas, mas: Math.max(0, total - mostradas.length) };
}
