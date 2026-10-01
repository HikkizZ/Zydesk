import type {
  AplicarPlantillaEntrada,
  CotizacionBreve,
  CotizacionEntrada,
  CotizacionResumen,
  CotizacionSalida,
  CotizacionesQuery,
  ImportarHorasEntrada,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta todos los tipos de estos esquemas: se infieren aquí.
export type CotizacionEntradaDatos = z.infer<typeof CotizacionEntrada>;
export type CotizacionSalidaDatos = z.infer<typeof CotizacionSalida>;
export type CotizacionResumenDatos = z.infer<typeof CotizacionResumen>;
export type CotizacionesQueryDatos = z.infer<typeof CotizacionesQuery>;
export type ImportarHorasEntradaDatos = z.infer<typeof ImportarHorasEntrada>;
export type AplicarPlantillaEntradaDatos = z.infer<typeof AplicarPlantillaEntrada>;
export type CotizacionBreveDatos = z.infer<typeof CotizacionBreve>;

// La cotización vigente de una OT (la de mayor versión) con el número de versiones.
export type CotizacionVigenteDatos = CotizacionBreveDatos & { n_versiones: number };
