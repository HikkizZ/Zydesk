import type { ConsultaTickets } from '@/features/tickets/api';

export type ClaveChip =
  'todos' | 'mios' | 'sin_asignar' | 'vencen_hoy' | 'vencidos' | 'con_ot' | 'archivados';

// Cada chip activo es un parámetro de la URL con el mismo nombre que el de la API (`=true`).
export const CHIPS: {
  clave: ClaveChip;
  etiqueta: string;
  param: 'solo_mios' | 'sin_asignar' | 'vencen_hoy' | 'vencidos' | 'archivados' | null;
  /** Texto del tooltip si el chip aún no está disponible. */
  deshabilitado?: string;
}[] = [
  { clave: 'todos', etiqueta: 'Todos', param: null },
  { clave: 'mios', etiqueta: 'Míos', param: 'solo_mios' },
  { clave: 'sin_asignar', etiqueta: 'Sin asignar', param: 'sin_asignar' },
  { clave: 'vencen_hoy', etiqueta: 'Vencen hoy', param: 'vencen_hoy' },
  { clave: 'vencidos', etiqueta: 'Vencidos', param: 'vencidos' },
  { clave: 'con_ot', etiqueta: 'Con OT', param: null, deshabilitado: 'Disponible en la Fase 3' },
  { clave: 'archivados', etiqueta: 'Archivados', param: 'archivados' },
];

export const PARAMS_CHIP = CHIPS.flatMap((c) => (c.param ? [c.param] : []));

export function chipActivo(params: URLSearchParams): ClaveChip {
  return CHIPS.find((c) => c.param && params.get(c.param) === 'true')?.clave ?? 'todos';
}

// Parte de la consulta que aporta un chip.
export function consultaDeChip(clave: ClaveChip): ConsultaTickets {
  switch (clave) {
    case 'mios':
      return { solo_mios: true };
    case 'sin_asignar':
      return { sin_asignar: true };
    case 'vencen_hoy':
      return { vencen_hoy: true };
    case 'vencidos':
      return { vencidos: true };
    case 'archivados':
      return { archivados: true };
    default:
      return {};
  }
}
