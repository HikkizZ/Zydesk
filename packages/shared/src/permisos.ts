// matriz de permisos (Fase 1, ADR 0002)
import type { Rol } from './enums/rol.js';

export const PERMISOS = [
  'tickets.editar',
  'ots.aprobar',
  'ots.cerrar',
  'ots.facturar',
  'reportes.ver',
  'config.editar',
  'horas.ver_todas',
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  admin: [...PERMISOS],
  coordinacion: [
    'tickets.editar',
    'ots.aprobar',
    'ots.cerrar',
    'ots.facturar',
    'reportes.ver',
    'horas.ver_todas',
  ],
  tecnico: ['tickets.editar'],
  lectura: ['reportes.ver'],
};

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}

// Filas de la matriz visible en Configuración (spec §2, 9 acciones + la fila 10 de la Fase 5). Las 4 primeras mapean a tickets.editar.
export const MATRIZ_VISIBLE: ReadonlyArray<{ etiqueta: string; permiso: Permiso }> = [
  { etiqueta: 'Crear y editar tickets', permiso: 'tickets.editar' },
  { etiqueta: 'Registrar seguimiento y notas', permiso: 'tickets.editar' },
  { etiqueta: 'Asignar responsables', permiso: 'tickets.editar' },
  { etiqueta: 'Convertir ticket en OT', permiso: 'tickets.editar' },
  { etiqueta: 'Aprobar cotizaciones y OT internas', permiso: 'ots.aprobar' },
  { etiqueta: 'Cerrar OT', permiso: 'ots.cerrar' },
  { etiqueta: 'Marcar OT como facturada', permiso: 'ots.facturar' },
  { etiqueta: 'Ver reportes y montos', permiso: 'reportes.ver' },
  { etiqueta: 'Cambiar configuración', permiso: 'config.editar' },
  { etiqueta: 'Ver horas de todo el equipo', permiso: 'horas.ver_todas' },
];
