export const EVENTOS_AVISO = [
  'asignacion',
  'mencion',
  'vence_pronto',
  'vencio',
  'estado_ticket',
  'seguimiento',
  'cotizacion',
  'por_facturar',
  'resumen_diario',
] as const;
export type EventoAviso = (typeof EVENTOS_AVISO)[number];

// Las 8 filas del diseño "Avisos" más el resumen diario
export const ETIQUETA_EVENTO_AVISO: Record<EventoAviso, string> = {
  asignacion: 'Me asignan un ticket o una tarea',
  mencion: 'Me mencionan con @',
  vence_pronto: 'Un ticket mío vence en 24 horas',
  vencio: 'Un ticket mío venció',
  estado_ticket: 'Cambia el estado de un ticket que sigo',
  seguimiento: 'Nuevo seguimiento en un ticket que sigo',
  cotizacion: 'Cotización aprobada o rechazada',
  por_facturar: 'OT cerrada y lista para facturar',
  resumen_diario: 'Resumen diario a las 08:30 (lunes a viernes)',
};

// `correo` está previsto y sin implementar (ADR 0013)
export const CANALES = ['app', 'telegram', 'correo'] as const;
export type Canal = (typeof CANALES)[number];
export const CANALES_ACTIVOS = ['app', 'telegram'] as const;
export type CanalActivo = (typeof CANALES_ACTIVOS)[number];

export const TIPOS_AVISO = [
  'ticket_asignado',
  'seguidor_agregado',
  'tarea_asignada',
  'ot_por_aprobar',
  'mencion',
  'vence_pronto',
  'vencio',
  'estado_ticket',
  'ot_cerrada',
  'ot_cancelada',
  'seguimiento',
  'cotizacion_aprobada',
  'cotizacion_rechazada',
  'por_facturar',
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export const FILTROS_AVISO = ['todos', 'menciones', 'asignaciones', 'vencimientos'] as const;
export type FiltroAviso = (typeof FILTROS_AVISO)[number];

export const EVENTOS_POR_FILTRO: Record<Exclude<FiltroAviso, 'todos'>, EventoAviso[]> = {
  menciones: ['mencion'],
  asignaciones: ['asignacion'],
  vencimientos: ['vence_pronto', 'vencio'],
};
