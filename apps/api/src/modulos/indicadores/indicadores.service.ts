import type { EntityManager } from 'typeorm';
import type { IndicadorUfSalidaDatos } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { hoyEnSantiago } from '../../core/fechas.js';

export type FuenteIndicador = 'boostr' | 'mindicador' | 'semilla';

export interface UfVigente {
  fecha: string;
  valor: number;
  fuente: FuenteIndicador;
  obtenido_en: Date;
}

// Indicador vigente = la fila de mayor `fecha` (puede ser de días atrás). Lectura sin bloqueo (spec fase-8b §1.2).
export async function leerUfVigente(
  m: EntityManager = dataSource.manager,
): Promise<UfVigente | null> {
  const filas: UfVigente[] = await m.query(
    `SELECT fecha::text AS fecha, valor::float8 AS valor, fuente, obtenido_en
       FROM indicador_uf ORDER BY fecha DESC LIMIT 1`,
  );
  return filas[0] ?? null;
}

export async function obtenerUf(): Promise<IndicadorUfSalidaDatos | null> {
  const uf = await leerUfVigente();
  if (!uf) return null;
  const hoy = hoyEnSantiago();
  return {
    fecha: uf.fecha,
    valor: uf.valor,
    fuente: uf.fuente,
    obtenido_en: uf.obtenido_en.toISOString(),
    hoy,
    desactualizado: uf.fecha < hoy,
  };
}

// Única escritura de `indicador_uf` (junto con las semillas): nunca actualiza una fila existente.
export async function registrarUf(
  m: EntityManager,
  uf: { fecha: string; valor: number; fuente: FuenteIndicador },
): Promise<boolean> {
  const filas: unknown[] = await m.query(
    `INSERT INTO indicador_uf (fecha, valor, fuente) VALUES ($1, $2, $3)
       ON CONFLICT (fecha) DO NOTHING RETURNING fecha`,
    [uf.fecha, uf.valor, uf.fuente],
  );
  return filas.length > 0;
}
