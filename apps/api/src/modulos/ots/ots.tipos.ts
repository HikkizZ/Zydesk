import type {
  AprobacionClienteEntrada,
  AprobarOtEntrada,
  ArchivosOtEntrada,
  IndicadoresOtsSalida,
  OtCrearEntrada,
  OtEditarEntrada,
  OtResumen,
  OtSalida,
  OtsQuery,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de estos esquemas: se infieren aquí.
export type IndicadoresOtsDatos = z.infer<typeof IndicadoresOtsSalida>;
export type OtResumenDatos = z.infer<typeof OtResumen>;
export type OtSalidaDatos = z.infer<typeof OtSalida>;
export type OtsQueryDatos = z.infer<typeof OtsQuery>;
export type OtCrearEntradaDatos = z.infer<typeof OtCrearEntrada>;
export type OtEditarEntradaDatos = z.infer<typeof OtEditarEntrada>;
export type AprobarOtEntradaDatos = z.infer<typeof AprobarOtEntrada>;
export type AprobacionClienteEntradaDatos = z.infer<typeof AprobacionClienteEntrada>;
export type ArchivosOtEntradaDatos = z.infer<typeof ArchivosOtEntrada>;

// Una fila de la planilla "Exportar para facturación" (spec fase 6 §12).
export interface FilaExportacionOt {
  codigo: string;
  titulo: string;
  cliente: string | null;
  ticket: string;
  tipo: OtResumenDatos['tipo'];
  etapa: OtResumenDatos['etapa'];
  estado_facturacion: OtResumenDatos['estado_facturacion'];
  n_factura: string | null;
  cotizacion: string | null; // 'COT-0218 v1'
  neto: number | null;
  horas: number;
  responsable: string | null;
  inicio: string | null; // AAAA-MM-DD
  termino: string | null;
  cerrada_en: Date | null;
}
