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
}
export type NombreEventoDominio = keyof EventosDominio;
