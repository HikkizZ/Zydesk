import type { EntityManager } from 'typeorm';
import { contexto } from '../http/contexto.js';

export interface Actor {
  id: number | null; // null = sistema (CLI, jobs)
}

export interface DatosEvento {
  entidad: string;
  entidad_id: string | number;
  actor: Actor;
  accion: string;
  campo?: string;
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  datos?: unknown;
}

export async function registrarEvento(tx: EntityManager, e: DatosEvento): Promise<void> {
  await tx.query(
    `INSERT INTO evento (entidad, entidad_id, autor_id, accion, campo, valor_anterior, valor_nuevo, datos, req_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      e.entidad,
      String(e.entidad_id),
      e.actor.id,
      e.accion,
      e.campo ?? null,
      e.valor_anterior ?? null,
      e.valor_nuevo ?? null,
      e.datos === undefined || e.datos === null ? null : JSON.stringify(e.datos),
      contexto.getStore()?.req_id ?? null,
    ],
  );
}

export interface CambiosEntidad {
  entidad: string;
  entidad_id: string | number;
  actor: Actor;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
  campos: string[];
  etiquetas?: Record<string, (v: unknown) => string>;
}

function iguales(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const ordenar = (x: unknown[]) => x.map(String).sort();
    const oa = ordenar(a);
    const ob = ordenar(b);
    return oa.length === ob.length && oa.every((v, i) => v === ob[i]);
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

// Un evento 'cambio' por cada campo que difiere; devuelve cuántos insertó.
export async function registrarCambios(tx: EntityManager, c: CambiosEntidad): Promise<number> {
  let insertados = 0;
  for (const campo of c.campos) {
    const antes = c.antes[campo];
    const despues = c.despues[campo];
    if (iguales(antes, despues)) continue;
    const texto = (v: unknown): string | null =>
      v === null || v === undefined ? null : (c.etiquetas?.[campo] ?? String)(v);
    await registrarEvento(tx, {
      entidad: c.entidad,
      entidad_id: c.entidad_id,
      actor: c.actor,
      accion: 'cambio',
      campo,
      valor_anterior: texto(antes),
      valor_nuevo: texto(despues),
    });
    insertados++;
  }
  return insertados;
}
