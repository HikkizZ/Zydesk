import type { EntityManager } from 'typeorm';
import feriados from './feriados-cl.json' with { type: 'json' };

// Semilla base idempotente (ADR 0005): se ejecuta al iniciar el servidor y en los tests; no como owner.
export async function sembrarBase(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO configuracion (clave, valor) VALUES ('nombre_app', '"Zydesk"'::jsonb), ('logo', 'null'::jsonb)
     ON CONFLICT (clave) DO NOTHING`,
  );
  await manager.query(
    `INSERT INTO contador (clave, prefijo, inicial, digitos, modo, valor) VALUES
       ('ticket', 'TK-', 1000, 4, 'correlativo', 999),
       ('ot', 'OT-', 200, 4, 'correlativo', 199)
     ON CONFLICT (clave) DO NOTHING`,
  );
  // Feriados generales (departamento_id NULL); la unicidad (fecha, departamento_id) trata NULL como igual.
  await manager.query(
    `INSERT INTO feriado (fecha, nombre, departamento_id)
     SELECT f.fecha::date, f.nombre, NULL FROM unnest($1::text[], $2::text[]) AS f(fecha, nombre)
     ON CONFLICT (fecha, departamento_id) DO NOTHING`,
    [feriados.map((f) => f.fecha), feriados.map((f) => f.nombre)],
  );
}
