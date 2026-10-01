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
  // Tarifas globales, IVA y validez por defecto (ADR 0007, spec fase 4 §8.1); los valores del diseño van en la semilla de desarrollo.
  await manager.query(
    `INSERT INTO configuracion (clave, valor) VALUES ('tarifas', $1::jsonb) ON CONFLICT (clave) DO NOTHING`,
    [
      JSON.stringify({
        hora_normal: null,
        hora_extendida: null,
        hora_urgencia: null,
        traslado_km: null,
        costo_interno: null,
        iva_pct: 19,
        validez_dias_defecto: 30,
        condiciones_defecto: null,
      }),
    ],
  );
  // Feriados generales (departamento_id NULL); la unicidad (fecha, departamento_id) trata NULL como igual.
  await manager.query(
    `INSERT INTO feriado (fecha, nombre, departamento_id)
     SELECT f.fecha::date, f.nombre, NULL FROM unnest($1::text[], $2::text[]) AS f(fecha, nombre)
     ON CONFLICT (fecha, departamento_id) DO NOTHING`,
    [feriados.map((f) => f.fecha), feriados.map((f) => f.nombre)],
  );
}
