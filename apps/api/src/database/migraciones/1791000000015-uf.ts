import type { MigrationInterface, QueryRunner } from 'typeorm';

const CONCEPTOS = `'hora_normal','hora_extendida','hora_urgencia','traslado_km'`;

export class Uf1791000000015 implements MigrationInterface {
  name = 'Uf1791000000015';

  async up(q: QueryRunner): Promise<void> {
    // Indicador diario de la UF: una fila por fecha; nunca se actualiza una fila existente.
    await q.query(`CREATE TABLE indicador_uf (
      fecha date PRIMARY KEY,
      valor numeric(12,2) NOT NULL CHECK (valor > 0),
      fuente text NOT NULL CHECK (fuente IN ('boostr','mindicador','semilla')),
      obtenido_en timestamptz NOT NULL DEFAULT now()
    )`);

    // Tarifas por cliente con moneda (las filas existentes son pesos).
    await q.query(
      `ALTER TABLE tarifa_cliente ADD COLUMN moneda text NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP','UF'))`,
    );

    // Procedencia del valor UF guardado en la cotización.
    await q.query(`ALTER TABLE cotizacion
      ADD COLUMN valor_uf_fecha date NULL,
      ADD COLUMN valor_uf_fuente text NULL CHECK (valor_uf_fuente IN ('boostr','mindicador','semilla','manual'))`);
    await q.query(`UPDATE cotizacion SET valor_uf_fuente = 'manual' WHERE valor_uf IS NOT NULL`);
    await q.query(`ALTER TABLE cotizacion
      ADD CONSTRAINT cotizacion_valor_uf_fuente_chk CHECK ((valor_uf IS NULL) = (valor_uf_fuente IS NULL)),
      ADD CONSTRAINT cotizacion_valor_uf_fecha_chk CHECK (valor_uf_fuente IS DISTINCT FROM 'manual' OR valor_uf_fecha IS NULL)`);

    // Tarifas globales: cada concepto numérico pasa a { moneda: 'CLP', valor }; el resto no cambia.
    await q.query(`UPDATE configuracion SET valor = (
      SELECT jsonb_object_agg(e.k,
               CASE WHEN e.k IN (${CONCEPTOS}) AND jsonb_typeof(e.v) = 'number'
                    THEN jsonb_build_object('moneda', 'CLP', 'valor', e.v) ELSE e.v END)
        FROM jsonb_each(valor) AS e(k, v))
     WHERE clave = 'tarifas'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE configuracion SET valor = (
      SELECT jsonb_object_agg(e.k,
               CASE WHEN e.k IN (${CONCEPTOS}) AND jsonb_typeof(e.v) = 'object'
                    THEN e.v->'valor' ELSE e.v END)
        FROM jsonb_each(valor) AS e(k, v))
     WHERE clave = 'tarifas'`);
    await q.query(`ALTER TABLE cotizacion
      DROP CONSTRAINT cotizacion_valor_uf_fecha_chk,
      DROP CONSTRAINT cotizacion_valor_uf_fuente_chk`);
    await q.query(`ALTER TABLE cotizacion DROP COLUMN valor_uf_fecha, DROP COLUMN valor_uf_fuente`);
    await q.query(`ALTER TABLE tarifa_cliente DROP COLUMN moneda`);
    await q.query(`DROP TABLE indicador_uf`);
  }
}
