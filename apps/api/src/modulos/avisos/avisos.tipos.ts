import type {
  AvisoSalida,
  AvisosQuery,
  AvisosSalida,
  PreferenciasEntrada,
  PreferenciasSalida,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de estos esquemas: se infieren aquí.
export type AvisosQueryDatos = z.infer<typeof AvisosQuery>;
export type AvisoSalidaDatos = z.infer<typeof AvisoSalida>;
export type AvisosSalidaDatos = z.infer<typeof AvisosSalida>;
export type PreferenciasEntradaDatos = z.infer<typeof PreferenciasEntrada>;
export type PreferenciasSalidaDatos = z.infer<typeof PreferenciasSalida>;
