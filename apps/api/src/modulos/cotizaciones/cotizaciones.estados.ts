import { formatearMonto, type EstadoCotizacion, type Moneda } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import type { EventoPendiente } from '../../core/eventos/dominio.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarEvento } from '../../core/historial/evento.js';
import type { OtBloqueada } from '../ots/ots.acceso.js';

// Cambios de estado de la cotización vigente que dispara la OT (spec fase 4 §6.2). Este archivo solo
// depende de `shared`, `core` y `ots.acceso`: `ots.etapas.service` lo importa sin ciclo. Reciben el `tx`
// y la OT ya bloqueada (orden §1.2: la cotización se bloquea después de la OT).

interface VigenteBloqueada {
  id: number;
  codigo: string;
  version: number;
  estado: EstadoCotizacion;
  moneda: Moneda;
  neto: number;
  total: number;
}

async function bloquearVigente(tx: EntityManager, ot_id: number): Promise<VigenteBloqueada | null> {
  const [v]: VigenteBloqueada[] = await tx.query(
    `SELECT id, codigo, version, estado, moneda, neto::float8 AS neto, total::float8 AS total
       FROM cotizacion WHERE ot_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
    [ot_id],
  );
  return v ?? null;
}

// Responsables ∪ seguidores del ticket de la OT.
async function destinatariosDe(tx: EntityManager, ticket_id: number): Promise<number[]> {
  const filas: { usuario_id: number }[] = await tx.query(
    `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1
     UNION SELECT usuario_id FROM ticket_seguidor WHERE ticket_id = $1`,
    [ticket_id],
  );
  return filas.map((f) => f.usuario_id);
}

// "Volver a borrador" (rechazo del cliente, ADR 0004): la vigente `enviada` pasa a `rechazada`. Si la
// vigente es un borrador (v2 en preparación) o no hay cotización, no toca nada.
export async function rechazarVigenteEnTx(
  tx: EntityManager,
  actor: UsuarioSesion,
  ot: OtBloqueada,
): Promise<EventoPendiente | null> {
  const vigente = await bloquearVigente(tx, ot.id);
  if (vigente?.estado !== 'enviada') return null;
  await tx.query(
    `UPDATE cotizacion SET estado = 'rechazada', rechazada_en = now(), actualizado_en = now() WHERE id = $1`,
    [vigente.id],
  );
  await registrarEvento(tx, {
    entidad: 'ot',
    entidad_id: ot.id,
    actor,
    accion: 'cotizacion_rechazada',
    valor_nuevo: `${vigente.codigo} v${vigente.version}`,
    datos: { cotizacion_id: vigente.id, codigo: vigente.codigo, version: vigente.version },
  });
  return [
    'cotizacion.respondida',
    {
      ot_id: ot.id,
      cotizacion_id: vigente.id,
      resultado: 'rechazada',
      destinatarios_ids: await destinatariosDe(tx, ot.ticket_id),
    },
  ];
}

// Aprobación del cliente: exige una vigente `enviada`, que queda `aprobada` (congelada).
export async function aprobarVigenteEnTx(
  tx: EntityManager,
  actor: UsuarioSesion,
  ot: OtBloqueada,
): Promise<{ cotizacion_id: number; pendiente: EventoPendiente }> {
  const vigente = await bloquearVigente(tx, ot.id);
  if (vigente?.estado !== 'enviada') {
    throw new ErrorApp('COTIZACION_REQUERIDA', 'La OT necesita una cotización enviada', {
      cotizacion: vigente
        ? { id: vigente.id, version: vigente.version, estado: vigente.estado }
        : null,
    });
  }
  await tx.query(
    `UPDATE cotizacion SET estado = 'aprobada', aprobada_en = now(), actualizado_en = now() WHERE id = $1`,
    [vigente.id],
  );
  await registrarEvento(tx, {
    entidad: 'ot',
    entidad_id: ot.id,
    actor,
    accion: 'cotizacion_aprobada',
    valor_nuevo: `${vigente.codigo} v${vigente.version} · ${formatearMonto(vigente.total, vigente.moneda)}`,
    datos: {
      cotizacion_id: vigente.id,
      codigo: vigente.codigo,
      version: vigente.version,
      moneda: vigente.moneda,
      neto: vigente.neto,
      total: vigente.total,
    },
  });
  return {
    cotizacion_id: vigente.id,
    pendiente: [
      'cotizacion.respondida',
      {
        ot_id: ot.id,
        cotizacion_id: vigente.id,
        resultado: 'aprobada',
        destinatarios_ids: await destinatariosDe(tx, ot.ticket_id),
      },
    ],
  };
}
