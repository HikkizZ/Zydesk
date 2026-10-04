import { createHash, randomBytes } from 'node:crypto';
import type { OrigenSesion } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { registrarAuditoria } from '../historial/auditoria.js';

// ADR 0013: inactividad 12 h (30 días con `mantener`); absoluta 7 días (90 con `mantener`).
export const INTERVALOS_SESION = {
  normal: { inactividad: '12 hours', absoluta: '7 days' },
  mantener: { inactividad: '30 days', absoluta: '90 days' },
} as const;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SesionCreada {
  token: string;
  id: string;
  mantener: boolean;
  expira_en: Date;
  expira_max_en: Date;
}

export async function crearSesion(
  tx: EntityManager,
  o: {
    usuario_id: number;
    origen?: OrigenSesion;
    mantener: boolean;
    ip: string | null;
    user_agent: string | null;
  },
): Promise<SesionCreada> {
  const token = randomBytes(32).toString('base64url');
  const i = o.mantener ? INTERVALOS_SESION.mantener : INTERVALOS_SESION.normal;
  const filas: { id: string; expira_en: Date; expira_max_en: Date }[] = await tx.query(
    `INSERT INTO sesion (token_hash, usuario_id, origen, mantener, ip, user_agent, expira_en, expira_max_en)
     VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval, now() + $8::interval)
     RETURNING id, expira_en, expira_max_en`,
    [
      hashToken(token),
      o.usuario_id,
      o.origen ?? 'web',
      o.mantener,
      o.ip || null,
      o.user_agent ? o.user_agent.slice(0, 300) : null,
      i.inactividad,
      i.absoluta,
    ],
  );
  const fila = filas[0]!;
  return { token, mantener: o.mantener, ...fila };
}

// Borra las sesiones del usuario (salvo `excepto`; solo las de `origen` si se indica) y audita un
// `sesion_cerrada` por cada una.
export async function cerrarSesionesDeUsuario(
  tx: EntityManager,
  usuario_id: number,
  motivo: string,
  excepto?: string,
  origen?: OrigenSesion,
): Promise<string[]> {
  // TypeORM devuelve [filas, cantidad] en DELETE ... RETURNING
  const [filas] = (await tx.query(
    `DELETE FROM sesion WHERE usuario_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
        AND ($3::text IS NULL OR origen = $3) RETURNING id`,
    [usuario_id, excepto ?? null, origen ?? null],
  )) as [{ id: string }[], number];
  for (const f of filas) {
    await registrarAuditoria(tx, {
      accion: 'sesion_cerrada',
      usuario_id,
      detalle: { sesion_id: f.id, motivo },
    });
  }
  return filas.map((f) => f.id);
}
