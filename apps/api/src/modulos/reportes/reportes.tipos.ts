import type { ReporteSalida, ReportesQuery } from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de los esquemas: se infieren aquí.
export type ReportesQueryDatos = z.infer<typeof ReportesQuery>;
export type ReporteSalidaDatos = z.infer<typeof ReporteSalida>;
export type FiltrosReporteDatos = ReporteSalidaDatos['filtros'];
export type IndicadoresReporteDatos = ReporteSalidaDatos['indicadores'];
export type SemanaHorasDatos = ReporteSalidaDatos['horas_por_semana'][number];
export type CargaPersonaDatos = ReporteSalidaDatos['carga'][number];
export type ResolucionPrioridadDatos = ReporteSalidaDatos['resolucion_por_prioridad'][number];
export type FilaClienteDatos = ReporteSalidaDatos['por_cliente'][number];

// Filtros ya resueltos (defectos aplicados, ids comprobados) tal como los usan las consultas.
export interface FiltrosConsulta {
  desde: string;
  hasta: string;
  departamento_id: number | null;
  cliente_id: number | null;
  usuario_id: number | null;
}
