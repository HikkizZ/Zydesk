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

const ITEMS_POR_SECCION = 5;
const LARGO_ASUNTO = 60;

/** Escapa todo texto dinámico antes de mandarlo con `parse_mode: 'HTML'`. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** «viernes 2 de octubre» a partir de AAAA-MM-DD (sin depender del locale del sistema). */
export function fechaLargaDeIso(fechaIso: string): string {
  const [y = 0, m = 1, d = 1] = fechaIso.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
  return `${dia} ${d} de ${MESES[m - 1] ?? ''}`;
}

const recortar = (texto: string): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= LARGO_ASUNTO ? limpio : `${limpio.slice(0, LARGO_ASUNTO - 1).trimEnd()}…`;
};

/** Lo mínimo de `MiDiaSalida` que necesita el formato (la API y el bot lo cumplen). */
export interface DatosMiDia {
  fecha: string;
  vencen_hoy: { codigo: string; asunto: string }[];
  vencidos: { codigo: string; asunto: string }[];
  por_aprobar: { codigo: string; titulo: string }[];
  tareas: { titulo: string; destino: { codigo: string } }[];
  conteos: {
    vencen_hoy: number;
    vencidos: number;
    por_aprobar: number;
    menciones: number;
    tareas: number;
  };
}

export const cabeceraMiDia = (fechaIso: string): string =>
  `<b>Zydesk · Mi día</b> — ${escaparHtml(fechaLargaDeIso(fechaIso))}`;

function seccion(titulo: string, total: number, items: string[]): string | null {
  if (total <= 0) return null;
  const lineas = items.slice(0, ITEMS_POR_SECCION).map((i) => `• ${i}`);
  const resto = total - lineas.length;
  if (resto > 0) lineas.push(`y ${resto} más`);
  return [`<b>${titulo} (${total})</b>`, ...lineas].join('\n');
}

/**
 * Mensaje de Telegram (HTML) del resumen diario y de `/hoy`, o `null` si no hay nada que mostrar.
 * Solo códigos, asuntos y títulos: nunca texto de mensajes.
 */
export function formatearMiDia(d: DatosMiDia, opciones: { url: string }): string | null {
  const secciones = [
    seccion(
      'Vencen hoy',
      d.conteos.vencen_hoy,
      d.vencen_hoy.map((t) => `${escaparHtml(t.codigo)} · ${escaparHtml(recortar(t.asunto))}`),
    ),
    seccion(
      'Vencidos',
      d.conteos.vencidos,
      d.vencidos.map((t) => `${escaparHtml(t.codigo)} · ${escaparHtml(recortar(t.asunto))}`),
    ),
    seccion(
      'Por aprobar',
      d.conteos.por_aprobar,
      d.por_aprobar.map((o) => `${escaparHtml(o.codigo)} · ${escaparHtml(recortar(o.titulo))}`),
    ),
    d.conteos.menciones > 0 ? `<b>Menciones sin leer:</b> ${d.conteos.menciones}` : null,
    seccion(
      'Tareas para hoy',
      d.conteos.tareas,
      d.tareas.map((t) => `${escaparHtml(recortar(t.titulo))} · ${escaparHtml(t.destino.codigo)}`),
    ),
  ].filter((s): s is string => s !== null);
  if (secciones.length === 0) return null;
  return [
    cabeceraMiDia(d.fecha),
    ...secciones,
    `<a href="${escaparHtml(opciones.url)}">Abrir Mi día</a>`,
  ].join('\n\n');
}
