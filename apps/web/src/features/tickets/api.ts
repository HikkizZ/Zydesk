import type { QueryClient } from '@tanstack/react-query';
import type {
  ActividadSalida,
  ArchivoSalida,
  CambioEstadoTicketDatos,
  CorreoParsearEntrada,
  CorreoParseadoSalida,
  MensajeEntrada,
  MensajeSalida,
  ResponsablesEntrada,
  SeguidoresEntrada,
  TareaEditarEntrada,
  TareaEntrada,
  TareaSalida,
  TicketCrearEntrada,
  TicketEditarEntrada,
  TicketResumen,
  TicketSalida,
  UsuarioBreve as UsuarioBreveEsquema,
} from '@zydesk/shared';
import type { z } from 'zod';
import { conQuery, enviar, enviarMultipart, obtener } from '@/lib/api';

export type ActividadDatos = z.infer<typeof ActividadSalida>;
export type ArchivoDatos = z.infer<typeof ArchivoSalida>;
export type CorreoParsearEntradaDatos = z.input<typeof CorreoParsearEntrada>;
export type CorreoParseadoDatos = z.infer<typeof CorreoParseadoSalida>;
export type MensajeEntradaDatos = z.input<typeof MensajeEntrada>;
export type MensajeDatos = z.infer<typeof MensajeSalida>;
export type ResponsablesEntradaDatos = z.infer<typeof ResponsablesEntrada>;
export type SeguidoresEntradaDatos = z.infer<typeof SeguidoresEntrada>;
export type TareaDatos = z.infer<typeof TareaSalida>;
export type TareaEntradaDatos = z.input<typeof TareaEntrada>;
export type TareaEditarEntradaDatos = z.input<typeof TareaEditarEntrada>;
export type TicketCrearEntradaDatos = z.input<typeof TicketCrearEntrada>;
export type TicketEditarEntradaDatos = z.infer<typeof TicketEditarEntrada>;
export type TicketResumenDatos = z.infer<typeof TicketResumen>;
export type TicketDatos = z.infer<typeof TicketSalida>;
export type UsuarioBreveDatos = z.infer<typeof UsuarioBreveEsquema>;
export type { CambioEstadoTicketDatos };

export interface PaginaTickets {
  datos: TicketResumenDatos[];
  total: number;
  pagina: number;
  por_pagina: number;
}

// Filtros de `GET /api/tickets` (listas separadas por comas en `estado` y `prioridad`).
export interface ConsultaTickets {
  pagina?: number;
  por_pagina?: number;
  q?: string;
  estado?: string;
  prioridad?: string;
  responsable_id?: number;
  solo_mios?: boolean;
  sin_asignar?: boolean;
  cliente_id?: number;
  categoria_id?: number;
  archivados?: boolean;
  vencen_hoy?: boolean;
  vencidos?: boolean;
  con_ot?: boolean;
  tipo?: string;
  orden?: '-actualizado_en' | '-creado_en' | 'fecha_limite' | 'prioridad';
}

export type ConsultaTablero = Omit<
  ConsultaTickets,
  'pagina' | 'por_pagina' | 'estado' | 'archivados' | 'orden'
>;

export type TipoActividad = 'todo' | 'seguimiento' | 'nota_interna' | 'historial';

// Claves de TanStack Query (ADR 0011, spec fase 2 §8.1).
export const claves = {
  tickets: (consulta: ConsultaTickets) => ['tickets', consulta] as const,
  tablero: (consulta: ConsultaTablero) => ['tablero', consulta] as const,
  ticket: (id: number) => ['ticket', id] as const,
  actividad: (id: number, tipo: TipoActividad) => ['ticket', id, 'actividad', tipo] as const,
  tareas: (id: number) => ['ticket', id, 'tareas'] as const,
  usuariosActivos: ['usuarios', 'activos'] as const,
};

// `staleTime` de las consultas de tickets (ADR 0011).
export const STALE_TICKETS = 30_000;

// Tickets ---------------------------------------------------------------------------------
export const tickets = (consulta: ConsultaTickets) =>
  obtener<PaginaTickets>(conQuery('/api/tickets', { ...consulta }));

export const tablero = (consulta: ConsultaTablero) =>
  obtener<TicketResumenDatos[]>(conQuery('/api/tickets/tablero', { ...consulta }));

export const ticket = (id: number) => obtener<TicketDatos>(`/api/tickets/${id}`);

export const crearTicket = (entrada: TicketCrearEntradaDatos) =>
  enviar<TicketDatos>('POST', '/api/tickets', entrada);

export const editarTicket = (id: number, entrada: TicketEditarEntradaDatos) =>
  enviar<TicketDatos>('PATCH', `/api/tickets/${id}`, entrada);

export const cambiarEstado = (id: number, entrada: CambioEstadoTicketDatos) =>
  enviar<TicketDatos>('POST', `/api/tickets/${id}/cambiar-estado`, entrada);

export const guardarResponsables = (id: number, entrada: ResponsablesEntradaDatos) =>
  enviar<TicketDatos>('PUT', `/api/tickets/${id}/responsables`, entrada);

export const guardarSeguidores = (id: number, entrada: SeguidoresEntradaDatos) =>
  enviar<TicketDatos>('PUT', `/api/tickets/${id}/seguidores`, entrada);

// Actividad, mensajes y tareas --------------------------------------------------------------
export const actividad = (id: number, tipo: TipoActividad) =>
  obtener<ActividadDatos>(conQuery(`/api/tickets/${id}/actividad`, { tipo }));

export const crearMensaje = (id: number, entrada: MensajeEntradaDatos) =>
  enviar<MensajeDatos>('POST', `/api/tickets/${id}/mensajes`, entrada);

export const tareas = (id: number) => obtener<TareaDatos[]>(`/api/tickets/${id}/tareas`);

export const crearTarea = (id: number, entrada: TareaEntradaDatos) =>
  enviar<TareaDatos>('POST', `/api/tickets/${id}/tareas`, entrada);

export const editarTarea = (tareaId: number, entrada: TareaEditarEntradaDatos) =>
  enviar<TareaDatos>('PATCH', `/api/tareas/${tareaId}`, entrada);

export const quitarTarea = (tareaId: number) => enviar<void>('DELETE', `/api/tareas/${tareaId}`);

// Correo y archivos -------------------------------------------------------------------------
export const parsearCorreo = (entrada: CorreoParsearEntradaDatos) =>
  enviar<CorreoParseadoDatos>('POST', '/api/correos/parsear', entrada);

// Subida en dos pasos (ADR 0009): los archivos quedan pendientes hasta asociarlos al ticket o mensaje.
export function subirArchivos(archivos: File[]) {
  const formulario = new FormData();
  for (const archivo of archivos) formulario.append('archivos', archivo, archivo.name);
  return enviarMultipart<ArchivoDatos[]>('/api/archivos', formulario);
}

export const quitarArchivoPendiente = (id: number) => enviar<void>('DELETE', `/api/archivos/${id}`);

// Tras cualquier mutación de un ticket: detalle (con su actividad y tareas), listas y tablero.
export async function invalidarTicket(queryClient: QueryClient, id: number) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
    queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    queryClient.invalidateQueries({ queryKey: ['tablero'] }),
  ]);
}
