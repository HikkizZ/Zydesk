import type { EntityManager } from 'typeorm';
import type { EventoPendiente } from '../core/eventos/dominio.js';

const unicos = (ids: readonly number[]): number[] => [...new Set(ids)];

// Responsables y seguidores de un ticket.
async function equipoDelTicket(m: EntityManager, ticket_id: number): Promise<number[]> {
  const filas: { usuario_id: number }[] = await m.query(
    `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1
      UNION SELECT usuario_id FROM ticket_seguidor WHERE ticket_id = $1`,
    [ticket_id],
  );
  return filas.map((f) => f.usuario_id);
}

// Responsable principal del ticket (glosario de la spec §3; fase 6 §25.5).
async function principalDelTicket(m: EntityManager, ticket_id: number): Promise<number[]> {
  const filas: { usuario_id: number }[] = await m.query(
    `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1 AND principal`,
    [ticket_id],
  );
  return filas.map((f) => f.usuario_id);
}

// Quien factura: usuarios con el permiso `ots.facturar` (Administración y Coordinación).
async function conPermisoDeFacturar(m: EntityManager): Promise<number[]> {
  const filas: { id: number }[] = await m.query(
    `SELECT id FROM usuario WHERE rol IN ('admin', 'coordinacion') AND activo`,
  );
  return filas.map((f) => f.id);
}

async function candidatos(m: EntityManager, [nombre, datos]: EventoPendiente): Promise<number[]> {
  switch (nombre) {
    case 'ticket.asignado':
    case 'ticket.seguidor_agregado':
    case 'mencion':
      return datos.usuario_ids;
    case 'tarea.asignada':
      return [datos.usuario_id];
    case 'ot.por_aprobar':
      return [datos.aprobador_id];
    case 'ticket.vence_pronto':
    case 'ticket.vencio':
      return principalDelTicket(m, datos.ticket_id);
    case 'ticket.estado_cambiado':
    case 'ticket.seguimiento_nuevo':
      return equipoDelTicket(m, datos.ticket_id);
    case 'ot.cerrada':
    case 'ot.cancelada':
    case 'cotizacion.respondida':
      return datos.destinatarios_ids;
    case 'ot.por_facturar':
      return conPermisoDeFacturar(m);
  }
}

// Destinatarios del evento (fase 6 §4.1): sin repetidos, sin el actor (nadie se avisa de lo que hizo)
// y solo usuarios activos.
export async function resolverDestinatarios(
  m: EntityManager,
  evento: EventoPendiente,
): Promise<number[]> {
  const datos = evento[1];
  const actor = 'actor_id' in datos ? datos.actor_id : null;
  const ids = unicos(await candidatos(m, evento)).filter((id) => id !== actor);
  if (ids.length === 0) return [];
  const activos: { id: number }[] = await m.query(
    `SELECT id FROM usuario WHERE id = ANY($1::int[]) AND activo ORDER BY id`,
    [ids],
  );
  return activos.map((a) => a.id);
}
