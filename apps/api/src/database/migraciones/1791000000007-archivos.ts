import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Archivos1791000000007 implements MigrationInterface {
  name = 'Archivos1791000000007';

  async up(q: QueryRunner): Promise<void> {
    // entidad NULL = pendiente (subida en dos pasos, ADR 0009); mensaje_id y la FK de origen_correo_id
    // se agregan en las migraciones 9 y 8 para evitar referencias circulares.
    await q.query(`CREATE TABLE archivo (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entidad text NULL CHECK (entidad IN ('ticket')),
      entidad_id integer NULL,
      categoria text NOT NULL CHECK (categoria IN ('foto','documento','correo')),
      nombre_original text NOT NULL,
      tipo_mime text NOT NULL,
      tamano integer NOT NULL CHECK (tamano > 0),
      clave text NOT NULL UNIQUE,
      origen_correo_id integer NULL,
      subido_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      subido_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX archivo_entidad_idx ON archivo (entidad, entidad_id)`);
    await q.query(`CREATE INDEX archivo_subido_por_idx ON archivo (subido_por, subido_en)`);
    await q.query(
      `CREATE INDEX archivo_pendiente_idx ON archivo (subido_en) WHERE entidad IS NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS archivo`);
  }
}
