import { z } from 'zod';
import { PlazoEsquema } from './categoria.js';
import { id, instante } from './comunes.js';

export const CalcularPlazoEntrada = z.object({
  desde: instante,
  plazo: PlazoEsquema,
  departamento_id: id,
});

export const CalcularPlazoSalida = z.object({ hasta: instante, horas_habiles: z.number() });

export type CalcularPlazoEntradaDatos = z.infer<typeof CalcularPlazoEntrada>;
export type CalcularPlazoSalidaDatos = z.infer<typeof CalcularPlazoSalida>;
