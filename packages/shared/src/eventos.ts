import type { EstadoTicket, TipoMensaje } from './enums/ticket.js';

// Eventos de dominio que publica la API tras el commit (ADR 0008). El despachador llega en la Fase 6.
export interface EventosDominio {
  'ot.cerrada': {
    ot_id: number;
    ticket_id: number;
    resolvio_ticket: boolean;
    destinatarios_ids: number[]; // responsables ∪ seguidores del ticket
  };
  'ot.por_facturar': { ot_id: number };
  'ot.por_aprobar': { ot_id: number; aprobador_id: number };
  'ot.cancelada': { ot_id: number; ticket_id: number; destinatarios_ids: number[] };
  'cotizacion.respondida': {
    ot_id: number;
    cotizacion_id: number;
    resultado: 'aprobada' | 'rechazada';
    destinatarios_ids: number[]; // responsables ∪ seguidores del ticket
  };
  'ticket.asignado': {
    ticket_id: number;
    usuario_ids: number[]; // nuevos responsables
    actor_id: number | null;
  };
  'ticket.seguidor_agregado': {
    ticket_id: number;
    usuario_ids: number[]; // nuevos seguidores
    actor_id: number | null;
  };
  'tarea.asignada': {
    tarea_id: number;
    ticket_id: number | null;
    ot_id: number | null;
    usuario_id: number;
    actor_id: number | null;
  };
  mencion: {
    mensaje_id: number;
    ticket_id: number | null;
    ot_id: number | null;
    tipo: TipoMensaje;
    usuario_ids: number[];
    actor_id: number;
  };
  'ticket.estado_cambiado': {
    ticket_id: number;
    estado_anterior: EstadoTicket;
    estado: EstadoTicket;
    actor_id: number | null;
  };
  'ticket.seguimiento_nuevo': {
    ticket_id: number;
    mensaje_id: number;
    actor_id: number;
    copiado: boolean;
  };
  'ticket.vence_pronto': { ticket_id: number; fecha_limite: string }; // ISO
  'ticket.vencio': { ticket_id: number; fecha_limite: string };
}
export type NombreEventoDominio = keyof EventosDominio;
