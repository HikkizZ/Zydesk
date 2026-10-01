import type {
  AprobacionClienteEntrada,
  AprobarOtEntrada,
  ArchivosOtEntrada,
  OtCrearEntrada,
  OtEditarEntrada,
  OtResumen,
  OtSalida,
  OtsQuery,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de estos esquemas: se infieren aquí.
export type OtResumenDatos = z.infer<typeof OtResumen>;
export type OtSalidaDatos = z.infer<typeof OtSalida>;
export type OtsQueryDatos = z.infer<typeof OtsQuery>;
export type OtCrearEntradaDatos = z.infer<typeof OtCrearEntrada>;
export type OtEditarEntradaDatos = z.infer<typeof OtEditarEntrada>;
export type AprobarOtEntradaDatos = z.infer<typeof AprobarOtEntrada>;
export type AprobacionClienteEntradaDatos = z.infer<typeof AprobacionClienteEntrada>;
export type ArchivosOtEntradaDatos = z.infer<typeof ArchivosOtEntrada>;
