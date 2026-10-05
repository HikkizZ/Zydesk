import { z } from 'zod';
import { fechaIso, instante } from './comunes.js';

export const IndicadorUfSalida = z.object({
  fecha: fechaIso, // fecha a la que corresponde el valor
  valor: z.number(),
  fuente: z.enum(['boostr', 'mindicador', 'semilla']),
  obtenido_en: instante,
  hoy: fechaIso, // hoy en America/Santiago, para que el front no calcule la zona
  desactualizado: z.boolean(), // fecha < hoy
});
export type IndicadorUfSalidaDatos = z.infer<typeof IndicadorUfSalida>;
