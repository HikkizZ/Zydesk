export const PRIORIDADES = ['urgente', 'alta', 'media', 'baja'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};
