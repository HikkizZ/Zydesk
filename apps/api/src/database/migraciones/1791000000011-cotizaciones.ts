import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Cotizaciones1791000000011 implements MigrationInterface {
  name = 'Cotizaciones1791000000011';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE cotizacion (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ot_id integer NOT NULL REFERENCES ot(id) ON DELETE RESTRICT,
      version integer NOT NULL CHECK (version >= 1),
      codigo text NOT NULL,
      estado text NOT NULL CHECK (estado IN ('borrador','enviada','aprobada','rechazada','reemplazada')),
      contacto_id integer NULL REFERENCES contacto(id) ON DELETE SET NULL,
      fecha_emision date NOT NULL,
      validez_dias integer NOT NULL CHECK (validez_dias IN (15, 30)),
      moneda text NOT NULL CHECK (moneda IN ('CLP','UF')),
      valor_uf numeric(12,2) NULL CHECK (valor_uf > 0),
      aplica_iva boolean NOT NULL DEFAULT true,
      iva_pct numeric(5,2) NOT NULL CHECK (iva_pct >= 0 AND iva_pct <= 100),
      condiciones text NULL,
      nota_interna text NULL,
      subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
      descuentos numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuentos >= 0),
      neto numeric(14,2) NOT NULL DEFAULT 0 CHECK (neto >= 0),
      iva numeric(14,2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
      total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
      enviada_en timestamptz NULL,
      enviada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      aprobada_en timestamptz NULL,
      rechazada_en timestamptz NULL,
      creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ot_id, version),
      CHECK (moneda <> 'UF' OR valor_uf IS NOT NULL),
      CHECK (estado = 'borrador' OR enviada_en IS NOT NULL),
      CHECK (estado <> 'aprobada' OR aprobada_en IS NOT NULL)
    )`);
    await q.query(
      `CREATE UNIQUE INDEX cotizacion_borrador_uq ON cotizacion (ot_id) WHERE estado = 'borrador'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX cotizacion_aprobada_uq ON cotizacion (ot_id) WHERE estado = 'aprobada'`,
    );
    await q.query(`CREATE INDEX cotizacion_ot_version_idx ON cotizacion (ot_id, version DESC)`);
    await q.query(`CREATE INDEX cotizacion_estado_idx ON cotizacion (estado, actualizado_en DESC)`);

    await q.query(`CREATE TABLE linea_cotizacion (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cotizacion_id integer NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
      orden integer NOT NULL,
      tipo text NOT NULL CHECK (tipo IN ('mano_de_obra','material','servicio','traslado')),
      descripcion text NOT NULL,
      cantidad numeric(10,2) NOT NULL CHECK (cantidad > 0),
      unidad text NOT NULL CHECK (unidad IN ('h','un','km','gl')),
      precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
      descuento_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
      total numeric(14,2) NOT NULL CHECK (total >= 0),
      UNIQUE (cotizacion_id, orden)
    )`);

    await q.query(`CREATE TABLE plantilla_cotizacion (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      descripcion text NULL,
      condiciones text NULL,
      activo boolean NOT NULL DEFAULT true,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE UNIQUE INDEX plantilla_cotizacion_nombre_uq ON plantilla_cotizacion (lower(nombre))`,
    );

    await q.query(`CREATE TABLE plantilla_linea (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plantilla_id integer NOT NULL REFERENCES plantilla_cotizacion(id) ON DELETE CASCADE,
      orden integer NOT NULL,
      tipo text NOT NULL CHECK (tipo IN ('mano_de_obra','material','servicio','traslado')),
      descripcion text NOT NULL,
      cantidad numeric(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
      unidad text NOT NULL CHECK (unidad IN ('h','un','km','gl')),
      precio_unitario numeric(14,2) NULL CHECK (precio_unitario >= 0),
      descuento_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
      UNIQUE (plantilla_id, orden)
    )`);
  }

  // Las claves `tarifas` y `cotizacion` de `configuracion` quedan: son datos, no esquema.
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS plantilla_linea`);
    await q.query(`DROP TABLE IF EXISTS plantilla_cotizacion`);
    await q.query(`DROP TABLE IF EXISTS linea_cotizacion`);
    await q.query(`DROP TABLE IF EXISTS cotizacion`);
  }
}
