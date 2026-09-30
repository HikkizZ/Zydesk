export const UNIDADES_PLAZO = ['horas', 'dias'] as const;
export type UnidadPlazo = (typeof UNIDADES_PLAZO)[number];
