import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Usuarios1791000000004 implements MigrationInterface {
  name = 'Usuarios1791000000004';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE usuario (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre text NOT NULL,
      correo citext NOT NULL UNIQUE,
      contrasena_hash text NOT NULL,
      rol text NOT NULL CHECK (rol IN ('admin','coordinacion','tecnico','lectura')),
      departamento_id integer NULL REFERENCES departamento(id) ON DELETE SET NULL,
      activo boolean NOT NULL DEFAULT true,
      color_avatar text NOT NULL,
      debe_cambiar_contrasena boolean NOT NULL DEFAULT false,
      terminos_version text NULL,
      terminos_aceptados_en timestamptz NULL,
      ultimo_ingreso timestamptz NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE sesion (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash text NOT NULL UNIQUE,
      usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      origen text NOT NULL CHECK (origen IN ('web','bot')),
      mantener boolean NOT NULL DEFAULT false,
      ip inet NULL,
      user_agent text NULL,
      creada_en timestamptz NOT NULL DEFAULT now(),
      ultimo_uso timestamptz NOT NULL DEFAULT now(),
      expira_en timestamptz NOT NULL,
      expira_max_en timestamptz NOT NULL
    )`);
    await q.query(`CREATE INDEX sesion_usuario_idx ON sesion (usuario_id)`);
    await q.query(`CREATE INDEX sesion_expira_idx ON sesion (expira_en)`);
    await q.query(
      `ALTER TABLE evento ADD CONSTRAINT evento_autor_fk FOREIGN KEY (autor_id) REFERENCES usuario(id) ON DELETE SET NULL`,
    );
    await q.query(
      `ALTER TABLE auditoria ADD CONSTRAINT auditoria_usuario_fk FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_usuario_fk`);
    await q.query(`ALTER TABLE evento DROP CONSTRAINT IF EXISTS evento_autor_fk`);
    await q.query(`DROP TABLE IF EXISTS sesion`);
    await q.query(`DROP TABLE IF EXISTS usuario`);
  }
}
