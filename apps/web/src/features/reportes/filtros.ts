import type { ConsultaReportes } from './api';

export type PresetPeriodo =
  'este_mes' | 'mes_anterior' | 'ultimos_30' | 'ultimos_90' | 'personalizado';

export const PRESETS_PERIODO: { valor: PresetPeriodo; etiqueta: string }[] = [
  { valor: 'este_mes', etiqueta: 'Este mes' },
  { valor: 'mes_anterior', etiqueta: 'Mes anterior' },
  { valor: 'ultimos_30', etiqueta: 'Últimos 30 días' },
  { valor: 'ultimos_90', etiqueta: 'Últimos 90 días' },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aIso = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Suma días calendario a una fecha `AAAA-MM-DD` (sin zona). */
export function sumarDias(iso: string, dias: number): string {
  const f = aFecha(iso);
  f.setUTCDate(f.getUTCDate() + dias);
  return aIso(f);
}

/** `desde`/`hasta` de un preset; «Este mes» y «Personalizado» no fijan nada (los defectos son de la API). */
export function rangoDePreset(
  preset: PresetPeriodo,
  hoy: string,
): { desde?: string; hasta?: string } {
  switch (preset) {
    case 'mes_anterior': {
      const primero = aFecha(`${hoy.slice(0, 8)}01`);
      primero.setUTCMonth(primero.getUTCMonth() - 1);
      const desde = aIso(primero);
      return { desde, hasta: sumarDias(`${hoy.slice(0, 8)}01`, -1) };
    }
    case 'ultimos_30':
      return { desde: sumarDias(hoy, -30), hasta: hoy };
    case 'ultimos_90':
      return { desde: sumarDias(hoy, -90), hasta: hoy };
    default:
      return {};
  }
}

/** El preset que coincide con la URL, o `'personalizado'`. */
export function presetDeParams(params: URLSearchParams, hoy: string): PresetPeriodo {
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  if (!desde && !hasta) return 'este_mes';
  for (const p of ['mes_anterior', 'ultimos_30', 'ultimos_90'] as const) {
    const r = rangoDePreset(p, hoy);
    if (r.desde === desde && r.hasta === hasta) return p;
  }
  return 'personalizado';
}

const id = (valor: string | null): number | undefined => {
  const n = Number(valor);
  return valor !== null && Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Consulta de la API a partir de la URL: `?departamento=3` viaja como `departamento_id=3`. */
export function consultaDeParams(params: URLSearchParams): ConsultaReportes {
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const departamento = id(params.get('departamento'));
  const cliente = id(params.get('cliente'));
  const usuario = id(params.get('usuario'));
  return {
    ...(desde && ISO.test(desde) ? { desde } : {}),
    ...(hasta && ISO.test(hasta) ? { hasta } : {}),
    ...(departamento ? { departamento_id: departamento } : {}),
    ...(cliente ? { cliente_id: cliente } : {}),
    ...(usuario ? { usuario_id: usuario } : {}),
  };
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

function partes(iso: string) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return { anio: anio ?? 0, mes: MESES[(mes ?? 1) - 1] ?? '', dia: dia ?? 0 };
}

/** «del 1 al 4 de octubre de 2026», «del 28 de septiembre al 4 de octubre de 2026». */
export function textoPeriodo(desde: string, hasta: string): string {
  const d = partes(desde);
  const h = partes(hasta);
  if (desde === hasta) return `del ${h.dia} de ${h.mes} de ${h.anio}`;
  if (d.anio === h.anio && d.mes === h.mes)
    return `del ${d.dia} al ${h.dia} de ${h.mes} de ${h.anio}`;
  if (d.anio === h.anio) return `del ${d.dia} de ${d.mes} al ${h.dia} de ${h.mes} de ${h.anio}`;
  return `del ${d.dia} de ${d.mes} de ${d.anio} al ${h.dia} de ${h.mes} de ${h.anio}`;
}
