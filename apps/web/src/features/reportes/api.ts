import type { ReporteSalida } from '@zydesk/shared';
import type { z } from 'zod';
import { conQuery, obtener } from '@/lib/api';

export type ReporteSalidaDatos = z.infer<typeof ReporteSalida>;
export type SemanaHorasDatos = ReporteSalidaDatos['horas_por_semana'][number];
export type CargaPersonaDatos = ReporteSalidaDatos['carga'][number];
export type ResolucionPrioridadDatos = ReporteSalidaDatos['resolucion_por_prioridad'][number];
export type FilaClienteDatos = ReporteSalidaDatos['por_cliente'][number];

// Mismos nombres que la query de la API; sin `desde`/`hasta` la API usa el mes actual.
export interface ConsultaReportes {
  desde?: string;
  hasta?: string;
  departamento_id?: number;
  cliente_id?: number;
  usuario_id?: number;
}

// Un reporte no es un tablero: sin `refetchInterval` (spec fase 7 §8.1).
export const STALE_REPORTES = 60_000;

export const clavesReportes = {
  reporte: (consulta: ConsultaReportes) => ['reportes', consulta] as const,
};

export const reporte = (consulta: ConsultaReportes) =>
  obtener<ReporteSalidaDatos>(conQuery('/api/reportes', { ...consulta }));

export const urlExportarReportes = (consulta: ConsultaReportes) =>
  conQuery('/api/reportes/exportar.xlsx', { ...consulta });
