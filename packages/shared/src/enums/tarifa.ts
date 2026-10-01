export const CONCEPTOS_TARIFA = [
  'hora_normal',
  'hora_extendida',
  'hora_urgencia',
  'traslado_km',
] as const;
export type ConceptoTarifa = (typeof CONCEPTOS_TARIFA)[number];

export const CONCEPTOS_TARIFA_GLOBAL = [...CONCEPTOS_TARIFA, 'costo_interno'] as const;
export type ConceptoTarifaGlobal = (typeof CONCEPTOS_TARIFA_GLOBAL)[number];

export const ETIQUETA_CONCEPTO_TARIFA: Record<ConceptoTarifaGlobal, string> = {
  hora_normal: 'Hora normal',
  hora_extendida: 'Hora horario extendido',
  hora_urgencia: 'Hora fin de semana / urgencia',
  traslado_km: 'Traslado por km',
  costo_interno: 'Costo interno (OT internas)',
};
