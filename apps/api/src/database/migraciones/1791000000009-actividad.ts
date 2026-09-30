import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Actividad1791000000009 implements MigrationInterface {
  name = 'Actividad1791000000009';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE tarea (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
      titulo text NOT NULL,
      responsable_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      fecha date NULL,
      hecha boolean NOT NULL DEFAULT false,
      hecha_en timestamptz NULL,
      orden integer NOT NULL,
      creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX tarea_ticket_orden_idx ON tarea (ticket_id, orden)`);
    await q.query(`CREATE TABLE mensaje (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
      tipo text NOT NULL CHECK (tipo IN ('seguimiento','nota_interna')),
      autor_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      texto text NOT NULL,
      horas numeric(5,2) NULL CHECK (horas > 0),
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX mensaje_ticket_creado_idx ON mensaje (ticket_id, creado_en)`);
    await q.query(`CREATE TABLE mencion (
      mensaje_id integer NOT NULL REFERENCES mensaje(id) ON DELETE CASCADE,
      usuario_id integer NOT NULL REFERENCES usuario(id),
      PRIMARY KEY (mensaje_id, usuario_id)
    )`);
    await q.query(`CREATE TABLE registro_horas (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id integer NOT NULL REFERENCES usuario(id),
      fecha date NOT NULL,
      ticket_id integer NULL REFERENCES ticket(id) ON DELETE SET NULL,
      mensaje_id integer NULL REFERENCES mensaje(id) ON DELETE SET NULL,
      horas numeric(5,2) NOT NULL CHECK (horas > 0 AND horas <= 24),
      fuera_de_horario boolean NOT NULL DEFAULT false,
      descripcion text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE INDEX registro_horas_usuario_fecha_idx ON registro_horas (usuario_id, fecha)`,
    );
    await q.query(`CREATE INDEX registro_horas_ticket_idx ON registro_horas (ticket_id)`);
    await q.query(
      `ALTER TABLE archivo ADD COLUMN mensaje_id integer NULL REFERENCES mensaje(id) ON DELETE CASCADE`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE archivo DROP COLUMN IF EXISTS mensaje_id`);
    await q.query(`DROP TABLE IF EXISTS registro_horas`);
    await q.query(`DROP TABLE IF EXISTS mencion`);
    await q.query(`DROP TABLE IF EXISTS mensaje`);
    await q.query(`DROP TABLE IF EXISTS tarea`);
  }
}
