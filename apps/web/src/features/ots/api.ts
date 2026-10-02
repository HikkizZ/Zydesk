import type { QueryClient } from '@tanstack/react-query';
import type {
  AprobacionClienteEntrada,
  AprobarOtEntrada,
  ArchivosOtEntrada,
  CambioEtapaOtDatos,
  CancelarOtDatos,
  CierreOtDatos,
  FacturarOtDatos,
  IndicadoresOtsSalida,
  OtCrearEntrada,
  OtEditarEntrada,
  OtResumen,
  OtSalida,
} from '@zydesk/shared';
import type { z } from 'zod';
import {
  type ActividadDatos,
  type ArchivoDatos,
  type MensajeDatos,
  type MensajeEntradaDatos,
  type TareaDatos,
  type TareaEntradaDatos,
  type TipoActividad,
} from '@/features/tickets/api';
import { conQuery, enviar, obtener } from '@/lib/api';

export type OtCrearEntradaDatos = z.input<typeof OtCrearEntrada>;
export type OtEditarEntradaDatos = z.input<typeof OtEditarEntrada>;
export type AprobarOtEntradaDatos = z.input<typeof AprobarOtEntrada>;
export type AprobacionClienteEntradaDatos = z.input<typeof AprobacionClienteEntrada>;
export type ArchivosOtEntradaDatos = z.input<typeof ArchivosOtEntrada>;
export type OtResumenDatos = z.infer<typeof OtResumen>;
export type OtDatos = z.infer<typeof OtSalida>;
export type IndicadoresOtsDatos = z.infer<typeof IndicadoresOtsSalida>;
export type { CambioEtapaOtDatos, CancelarOtDatos, CierreOtDatos, FacturarOtDatos };

export interface PaginaOts {
  datos: OtResumenDatos[];
  total: number;
  pagina: number;
  por_pagina: number;
}

// Filtros de `GET /api/ots` (listas separadas por comas en `tipo`, `etapa` y `estado_facturacion`).
export interface ConsultaOts {
  pagina?: number;
  por_pagina?: number;
  q?: string;
  ticket_id?: number;
  cliente_id?: number;
  tipo?: string;
  etapa?: string;
  estado_facturacion?: string;
  abiertas?: boolean;
  responsable_id?: number;
  aprobador_id?: number;
  orden?: '-actualizado_en' | '-creado_en' | 'termino';
}

// Claves de TanStack Query (spec fase 3 §10.1).
export const clavesOt = {
  ots: (consulta: ConsultaOts) => ['ots', consulta] as const,
  ot: (id: number) => ['ot', id] as const,
  actividad: (id: number, tipo: TipoActividad) => ['ot', id, 'actividad', tipo] as const,
  tareas: (id: number) => ['ot', id, 'tareas'] as const,
  indicadores: ['ots', 'indicadores'] as const,
};

export const STALE_OTS = 30_000;

// Lectura ---------------------------------------------------------------------------------
export const ots = (consulta: ConsultaOts) =>
  obtener<PaginaOts>(conQuery('/api/ots', { ...consulta }));

export const ot = (id: number) => obtener<OtDatos>(`/api/ots/${id}`);

export const indicadoresOts = () => obtener<IndicadoresOtsDatos>('/api/ots/indicadores');

// Exportación para facturación (.xlsx): mismos filtros que la lista, sin paginar.
export const urlExportarOts = (consulta: Omit<ConsultaOts, 'pagina' | 'por_pagina'>) =>
  conQuery('/api/ots/exportar.xlsx', { ...consulta });

// Escritura -------------------------------------------------------------------------------
export const convertirEnOt = (ticketId: number, entrada: OtCrearEntradaDatos) =>
  enviar<OtDatos>('POST', `/api/tickets/${ticketId}/convertir-en-ot`, entrada);

export const editarOt = (id: number, entrada: OtEditarEntradaDatos) =>
  enviar<OtDatos>('PATCH', `/api/ots/${id}`, entrada);

export const cambiarEtapa = (id: number, entrada: CambioEtapaOtDatos) =>
  enviar<OtDatos>('POST', `/api/ots/${id}/cambiar-etapa`, entrada);

export const aprobarOt = (id: number, entrada: AprobarOtEntradaDatos = {}) =>
  enviar<OtDatos>('POST', `/api/ots/${id}/aprobar`, entrada);

export const registrarAprobacion = (id: number, entrada: AprobacionClienteEntradaDatos) =>
  enviar<OtDatos>('PUT', `/api/ots/${id}/aprobacion`, entrada);

export const cancelarOt = (id: number, entrada: CancelarOtDatos) =>
  enviar<OtDatos>('POST', `/api/ots/${id}/cancelar`, entrada);

export const facturarOt = (id: number, entrada: FacturarOtDatos) =>
  enviar<OtDatos>('POST', `/api/ots/${id}/facturar`, entrada);

export const cerrarOt = (id: number, entrada: CierreOtDatos) =>
  enviar<OtDatos>('POST', `/api/ots/${id}/cerrar`, entrada);

// Asocia archivos ya subidos (pendientes) a la OT (ADR 0009, dos pasos).
export const agregarArchivos = (id: number, entrada: ArchivosOtEntradaDatos) =>
  enviar<ArchivoDatos[]>('POST', `/api/ots/${id}/archivos`, entrada);

// Actividad, mensajes y tareas -------------------------------------------------------------
export const actividadOt = (id: number, tipo: TipoActividad) =>
  obtener<ActividadDatos>(conQuery(`/api/ots/${id}/actividad`, { tipo }));

export const crearMensajeOt = (id: number, entrada: MensajeEntradaDatos) =>
  enviar<MensajeDatos>('POST', `/api/ots/${id}/mensajes`, entrada);

export const copiarAlTicket = (mensajeId: number) =>
  enviar<MensajeDatos>('POST', `/api/mensajes/${mensajeId}/copiar-al-ticket`);

export const tareasOt = (id: number) => obtener<TareaDatos[]>(`/api/ots/${id}/tareas`);

export const crearTareaOt = (id: number, entrada: TareaEntradaDatos) =>
  enviar<TareaDatos>('POST', `/api/ots/${id}/tareas`, entrada);

// (`editarTarea` y `quitarTarea` se reutilizan de `features/tickets/api`.)

// Tras cualquier mutación de una OT: su detalle (con actividad y tareas), las listas de OT, el
// ticket de origen y las listas de tickets. Sin `ticketId` se invalidan todos los tickets.
export async function invalidarOt(queryClient: QueryClient, id: number, ticketId?: number) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ot', id] }),
    queryClient.invalidateQueries({ queryKey: ['ots'] }),
    queryClient.invalidateQueries({
      queryKey: ticketId === undefined ? ['ticket'] : ['ticket', ticketId],
    }),
    queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    queryClient.invalidateQueries({ queryKey: ['tablero'] }),
  ]);
}
