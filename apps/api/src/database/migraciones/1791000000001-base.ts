import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Base1791000000001 implements MigrationInterface {
  name = 'Base1791000000001';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await q.query(`CREATE TABLE configuracion (
      clave text PRIMARY KEY,
      valor jsonb NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE contador (
      clave text PRIMARY KEY CHECK (clave IN ('ticket','ot')),
      prefijo text NOT NULL,
      inicial integer NOT NULL CHECK (inicial >= 0),
      digitos integer NOT NULL CHECK (digitos BETWEEN 3 AND 8),
      modo text NOT NULL CHECK (modo IN ('correlativo','aleatorio')),
      valor integer NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE evento (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entidad text NOT NULL,
      entidad_id text NOT NULL,
      autor_id integer NULL,
      accion text NOT NULL,
      campo text NULL,
      valor_anterior text NULL,
      valor_nuevo text NULL,
      datos jsonb NULL,
      req_id uuid NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX evento_entidad_idx ON evento (entidad, entidad_id, creado_en)`);
    await q.query(`CREATE INDEX evento_autor_idx ON evento (autor_id, creado_en)`);

    await q.query(`CREATE TABLE auditoria (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      req_id uuid NULL,
      usuario_id integer NULL,
      ip inet NULL,
      accion text NOT NULL,
      detalle jsonb NOT NULL DEFAULT '{}',
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX auditoria_creado_idx ON auditoria (creado_en)`);
    await q.query(`CREATE INDEX auditoria_usuario_idx ON auditoria (usuario_id, creado_en)`);
    await q.query(`CREATE INDEX auditoria_accion_idx ON auditoria (accion, creado_en)`);
    await q.query(`CREATE INDEX auditoria_ip_idx ON auditoria (ip, creado_en)`);
    await q.query(
      `CREATE INDEX auditoria_correo_idx ON auditoria ((detalle->>'correo'), creado_en)`,
    );

    await q.query(`CREATE FUNCTION limpiar_auditoria() RETURNS void LANGUAGE sql SECURITY DEFINER
      SET search_path = public AS $$ DELETE FROM auditoria WHERE creado_en < now() - interval '1 year' $$`);
    await q.query(`ALTER FUNCTION limpiar_auditoria() OWNER TO zydesk_owner`);
    await q.query(`REVOKE ALL ON FUNCTION limpiar_auditoria() FROM PUBLIC`);
    await q.query(`GRANT EXECUTE ON FUNCTION limpiar_auditoria() TO zydesk_app`);
    await q.query(`REVOKE UPDATE, DELETE ON evento, auditoria FROM zydesk_app`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP FUNCTION IF EXISTS limpiar_auditoria()`);
    await q.query(`DROP TABLE IF EXISTS auditoria`);
    await q.query(`DROP TABLE IF EXISTS evento`);
    await q.query(`DROP TABLE IF EXISTS contador`);
    await q.query(`DROP TABLE IF EXISTS configuracion`);
    await q.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
