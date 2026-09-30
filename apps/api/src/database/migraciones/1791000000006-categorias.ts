import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Categorias1791000000006 implements MigrationInterface {
  name = 'Categorias1791000000006';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE categoria (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      responsable_defecto_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      plazo_respuesta jsonb NOT NULL,
      plazo_resolucion jsonb NOT NULL,
      activo boolean NOT NULL DEFAULT true,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX categoria_nombre_uq ON categoria (lower(nombre))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS categoria`);
  }
}
