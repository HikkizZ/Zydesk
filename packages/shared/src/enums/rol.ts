export const ROLES = ['admin', 'coordinacion', 'tecnico', 'lectura'] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administración',
  coordinacion: 'Coordinación',
  tecnico: 'Técnico',
  lectura: 'Solo lectura',
};
