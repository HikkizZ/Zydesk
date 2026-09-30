import { z } from 'zod';
import {
  ESPERA_DE,
  ESTADOS_TICKET,
  ESTADOS_TICKET_CERRADOS,
  type EstadoTicket,
} from '../enums/ticket.js';
import { id, texto } from '../esquemas/comunes.js';

// Máquina de estados del ticket (ADR 0004): desde un estado abierto se puede ir a cualquier otro;
// un cerrado solo se reabre, a En curso.
export function esCerrado(e: EstadoTicket): boolean {
  return (ESTADOS_TICKET_CERRADOS as readonly EstadoTicket[]).includes(e);
}

export function transicionesDesde(e: EstadoTicket): EstadoTicket[] {
  if (esCerrado(e)) return ['en_curso'];
  return ESTADOS_TICKET.filter((x) => x !== e);
}

export function puedeTransicionar(desde: EstadoTicket, hasta: EstadoTicket): boolean {
  return desde !== hasta && transicionesDesde(desde).includes(hasta);
}

export const CambioEstadoTicket = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('nuevo') }),
  z.object({ estado: z.literal('en_curso') }),
  z.object({
    estado: z.literal('en_espera'),
    espera_de: z.enum(ESPERA_DE),
    espera_detalle: texto(120).optional(),
  }),
  z.object({ estado: z.literal('resuelto') }),
  z.object({ estado: z.literal('descartado'), motivo: texto(500) }),
  z.object({ estado: z.literal('duplicado'), duplicado_de_id: id }),
]);
export type CambioEstadoTicketDatos = z.infer<typeof CambioEstadoTicket>;
