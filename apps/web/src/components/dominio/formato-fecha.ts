import { ZONA } from '@zydesk/shared';

// Formatos cortos de fecha para tickets ("30 sep", "28 sep 17:05") siempre en America/Santiago.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const formatoPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partes(fecha: Date) {
  const p: Record<string, string> = {};
  for (const parte of formatoPartes.formatToParts(fecha)) p[parte.type] = parte.value;
  return {
    anio: p['year'] ?? '',
    mes: Number(p['month']),
    dia: Number(p['day']),
    hora: p['hour'] ?? '00',
    minuto: p['minute'] ?? '00',
  };
}

/** "30 sep" */
export function diaMes(iso: string | Date): string {
  const p = partes(new Date(iso));
  return `${p.dia} ${MESES[p.mes - 1]}`;
}

/** "28 sep 17:05" */
export function diaMesHora(iso: string | Date): string {
  const p = partes(new Date(iso));
  return `${p.dia} ${MESES[p.mes - 1]} ${p.hora}:${p.minuto}`;
}

/** "29 sep" a partir de `AAAA-MM-DD` (fecha sin zona, no se corre de día). */
export function diaMesDeFecha(fecha: string): string {
  const [, mes, dia] = fecha.split('-').map(Number);
  return `${dia} ${MESES[(mes ?? 1) - 1]}`;
}

/** Fecha de hoy en Santiago como `AAAA-MM-DD`. */
export function hoyIso(ahora: Date = new Date()): string {
  const p = partes(ahora);
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

function desfaseMinutos(ms: number): number {
  const nombre =
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' })
      .formatToParts(ms)
      .find((x) => x.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** `AAAA-MM-DDTHH:mm` escrito en Santiago (input `datetime-local`) → instante ISO con Z. */
export function localSantiagoAIso(local: string): string {
  const [fecha = '', hora = '00:00'] = local.split('T');
  const [a = 0, m = 1, d = 1] = fecha.split('-').map(Number);
  const [hh = 0, mm = 0] = hora.split(':').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, hh, mm);
  const primero = ingenuo - desfaseMinutos(ingenuo) * 60_000;
  return new Date(ingenuo - desfaseMinutos(primero) * 60_000).toISOString();
}

/** Instante ISO → `AAAA-MM-DDTHH:mm` en Santiago (valor de un `datetime-local`). */
export function isoALocalSantiago(iso: string): string {
  const p = partes(new Date(iso));
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}T${p.hora}:${p.minuto}`;
}

/** "hace 12 min", "hace 3 h", "ayer", "26 sep". */
export function tiempoRelativo(iso: string | Date, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const hoy = hoyIso(ahora);
  const dia = hoyIso(fecha);
  if (dia === hoy) return `hace ${horas} h`;
  const ayer = hoyIso(new Date(ahora.getTime() - 86_400_000));
  if (dia === ayer) return 'ayer';
  return diaMes(fecha);
}

/** "1,2 MB", "340 KB" */
export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
