import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Tickets1791000000008 implements MigrationInterface {
  name = 'Tickets1791000000008';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE ticket (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      numero integer NOT NULL UNIQUE,
      codigo text NOT NULL UNIQUE,
      asunto text NOT NULL,
      descripcion text NULL,
      cliente_id integer NULL REFERENCES cliente(id) ON DELETE SET NULL,
      solicitante_nombre text NULL,
      solicitante_correo citext NULL,
      origen text NOT NULL CHECK (origen IN ('externo','interno')),
      prioridad text NOT NULL CHECK (prioridad IN ('urgente','alta','media','baja')),
      categoria_id integer NULL REFERENCES categoria(id) ON DELETE SET NULL,
      estado text NOT NULL CHECK (estado IN ('nuevo','en_curso','en_espera','resuelto','descartado','duplicado')),
      espera_de text NULL CHECK (espera_de IN ('cliente','proveedor','repuesto','aprobacion')),
      espera_detalle text NULL,
      motivo_cierre text NULL,
      duplicado_de_id integer NULL REFERENCES ticket(id) ON DELETE SET NULL,
      inicio_planificado timestamptz NULL,
      fecha_limite timestamptz NULL,
      respuesta_limite timestamptz NULL,
      primera_respuesta_en timestamptz NULL,
      horas_estimadas numeric(6,2) NULL CHECK (horas_estimadas >= 0),
      creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      cerrado_en timestamptz NULL,
      archivado_en timestamptz NULL,
      CHECK (estado <> 'en_espera' OR espera_de IS NOT NULL),
      CHECK (estado <> 'descartado' OR motivo_cierre IS NOT NULL),
      CHECK (estado <> 'duplicado' OR duplicado_de_id IS NOT NULL),
      CHECK ((estado IN ('resuelto','descartado','duplicado')) = (cerrado_en IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX ticket_estado_archivado_idx ON ticket (estado, archivado_en)`);
    await q.query(`CREATE INDEX ticket_fecha_limite_idx ON ticket (fecha_limite)`);
    await q.query(`CREATE INDEX ticket_cliente_idx ON ticket (cliente_id)`);
    await q.query(`CREATE INDEX ticket_creado_en_idx ON ticket (creado_en DESC)`);
    await q.query(`CREATE TABLE ticket_responsable (
      ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
      usuario_id integer NOT NULL REFERENCES usuario(id),
      principal boolean NOT NULL DEFAULT false,
      PRIMARY KEY (ticket_id, usuario_id)
    )`);
    await q.query(
      `CREATE UNIQUE INDEX ticket_responsable_principal_uq ON ticket_responsable (ticket_id) WHERE principal`,
    );
    await q.query(`CREATE TABLE ticket_seguidor (
      ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
      usuario_id integer NOT NULL REFERENCES usuario(id),
      PRIMARY KEY (ticket_id, usuario_id)
    )`);
    await q.query(`CREATE TABLE correo_adjunto (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id integer NOT NULL UNIQUE REFERENCES ticket(id) ON DELETE CASCADE,
      archivo_id integer NULL REFERENCES archivo(id) ON DELETE SET NULL,
      origen text NOT NULL CHECK (origen IN ('eml','msg','texto')),
      de text NULL,
      para text NULL,
      fecha timestamptz NULL,
      asunto text NULL,
      cuerpo text NOT NULL DEFAULT ''
    )`);
    await q.query(`ALTER TABLE archivo ADD CONSTRAINT archivo_origen_correo_fk
      FOREIGN KEY (origen_correo_id) REFERENCES correo_adjunto(id) ON DELETE SET NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE archivo DROP CONSTRAINT IF EXISTS archivo_origen_correo_fk`);
    await q.query(`DROP TABLE IF EXISTS correo_adjunto`);
    await q.query(`DROP TABLE IF EXISTS ticket_seguidor`);
    await q.query(`DROP TABLE IF EXISTS ticket_responsable`);
    await q.query(`DROP TABLE IF EXISTS ticket`);
  }
}
