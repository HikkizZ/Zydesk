import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Clientes1791000000005 implements MigrationInterface {
  name = 'Clientes1791000000005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE cliente (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      rut text NULL UNIQUE,
      direccion text NULL,
      es_interno boolean NOT NULL DEFAULT false,
      condicion_pago text NULL,
      exige_oc boolean NOT NULL DEFAULT false,
      notas text NULL,
      activo boolean NOT NULL DEFAULT true,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX cliente_nombre_uq ON cliente (lower(nombre))`);
    await q.query(`CREATE TABLE contacto (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cliente_id integer NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
      nombre text NOT NULL,
      area text NULL,
      correo citext NULL,
      telefono text NULL,
      aprueba_cotizaciones boolean NOT NULL DEFAULT false,
      activo boolean NOT NULL DEFAULT true,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX contacto_cliente_idx ON contacto (cliente_id)`);
    await q.query(`CREATE TABLE contrato_bolsa (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cliente_id integer NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
      horas_mes numeric(6,1) NOT NULL CHECK (horas_mes > 0),
      vigente_desde date NOT NULL,
      vigente_hasta date NULL,
      fecha_renovacion date NULL,
      notas text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX contrato_bolsa_cliente_idx ON contrato_bolsa (cliente_id)`);
    await q.query(`CREATE TABLE tarifa_cliente (
      cliente_id integer NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
      concepto text NOT NULL CHECK (concepto IN ('hora_normal','hora_extendida','hora_urgencia','traslado_km')),
      valor numeric(14,2) NOT NULL CHECK (valor >= 0),
      PRIMARY KEY (cliente_id, concepto)
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS tarifa_cliente`);
    await q.query(`DROP TABLE IF EXISTS contrato_bolsa`);
    await q.query(`DROP TABLE IF EXISTS contacto`);
    await q.query(`DROP TABLE IF EXISTS cliente`);
  }
}
