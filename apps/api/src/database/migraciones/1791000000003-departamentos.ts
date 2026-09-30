import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Departamentos1791000000003 implements MigrationInterface {
  name = 'Departamentos1791000000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE departamento (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL UNIQUE,
      hora_extendida_desde text NOT NULL,
      capacidad_tickets_pct integer NOT NULL CHECK (capacidad_tickets_pct BETWEEN 0 AND 100),
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE horario_dia (
      departamento_id integer NOT NULL REFERENCES departamento(id) ON DELETE CASCADE,
      dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      activo boolean NOT NULL,
      entrada text NOT NULL,
      salida text NOT NULL,
      colacion_inicio text NOT NULL,
      colacion_min integer NOT NULL,
      PRIMARY KEY (departamento_id, dia_semana)
    )`);
    await q.query(`CREATE TABLE feriado (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      fecha date NOT NULL,
      nombre text NOT NULL,
      departamento_id integer NULL REFERENCES departamento(id) ON DELETE CASCADE,
      UNIQUE NULLS NOT DISTINCT (fecha, departamento_id)
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS feriado`);
    await q.query(`DROP TABLE IF EXISTS horario_dia`);
    await q.query(`DROP TABLE IF EXISTS departamento`);
  }
}
