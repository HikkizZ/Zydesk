import type {
  HorasQuery,
  PlanillaSemanal,
  RegistroHorasEditar,
  RegistroHorasEntrada,
  RegistroHorasSalida,
} from '@zydesk/shared';
import { hoyEnSantiago } from '../../core/fechas.js';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de estos esquemas: se infieren aquí.
export type RegistroHorasEntradaDatos = z.infer<typeof RegistroHorasEntrada>;
export type RegistroHorasEditarDatos = z.infer<typeof RegistroHorasEditar>;
export type RegistroHorasSalidaDatos = z.infer<typeof RegistroHorasSalida>;
export type HorasQueryDatos = z.infer<typeof HorasQuery>;
export type PlanillaSemanalDatos = z.infer<typeof PlanillaSemanal>;

export { hoyEnSantiago };
