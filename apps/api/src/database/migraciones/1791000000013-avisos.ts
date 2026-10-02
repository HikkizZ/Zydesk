import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Avisos1791000000013 implements MigrationInterface {
  name = 'Avisos1791000000013';

  async up(q: QueryRunner): Promise<void> {
    // Preferencias explícitas; sin fila rige el valor por defecto de `shared`. `correo` se acepta pero no se usa (ADR 0013).
    await q.query(`CREATE TABLE preferencia_aviso (
      usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      evento text NOT NULL CHECK (evento IN ('asignacion','mencion','vence_pronto','vencio','estado_ticket','seguimiento','cotizacion','por_facturar','resumen_diario')),
      canal text NOT NULL CHECK (canal IN ('app','telegram','correo')),
      activo boolean NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, evento, canal),
      CHECK (evento <> 'resumen_diario' OR canal <> 'app')
    )`);

    // Una fila por persona destinataria (ADR 0008). `texto` nunca lleva contenido de mensajes ni montos.
    await q.query(`CREATE TABLE aviso (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      evento text NOT NULL CHECK (evento IN ('asignacion','mencion','vence_pronto','vencio','estado_ticket','seguimiento','cotizacion','por_facturar')),
      tipo text NOT NULL CHECK (tipo IN ('ticket_asignado','seguidor_agregado','tarea_asignada','ot_por_aprobar','mencion','vence_pronto','vencio','estado_ticket','ot_cerrada','ot_cancelada','seguimiento','cotizacion_aprobada','cotizacion_rechazada','por_facturar')),
      clave text NULL,
      texto text NOT NULL CHECK (length(texto) <= 300),
      enlace text NOT NULL,
      entidad text NOT NULL CHECK (entidad IN ('ticket','ot')),
      entidad_id integer NOT NULL,
      datos jsonb NOT NULL DEFAULT '{}',
      actor_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      en_app boolean NOT NULL DEFAULT true,
      leido_en timestamptz NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE UNIQUE INDEX aviso_clave_uq ON aviso (usuario_id, clave) WHERE clave IS NOT NULL`,
    );
    await q.query(`CREATE INDEX aviso_usuario_creado_idx ON aviso (usuario_id, creado_en DESC)`);
    await q.query(
      `CREATE INDEX aviso_no_leido_idx ON aviso (usuario_id) WHERE leido_en IS NULL AND en_app`,
    );
    await q.query(`CREATE INDEX aviso_entidad_idx ON aviso (entidad, entidad_id)`);

    // Estado del envío por canal externo (el canal `app` es la fila `aviso`).
    await q.query(`CREATE TABLE aviso_envio (
      aviso_id bigint NOT NULL REFERENCES aviso(id) ON DELETE CASCADE,
      canal text NOT NULL CHECK (canal IN ('telegram','correo')),
      estado text NOT NULL CHECK (estado IN ('pendiente','enviado','fallido','omitido')),
      intentos integer NOT NULL DEFAULT 0,
      error text NULL,
      enviado_en timestamptz NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (aviso_id, canal)
    )`);

    // Código de un solo uso (ADR 0008): se guarda solo el hash; expira a los 10 min.
    await q.query(`CREATE TABLE codigo_vinculo (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo_hash text NOT NULL UNIQUE,
      usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      expira_en timestamptz NOT NULL,
      usado_en timestamptz NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX codigo_vinculo_usuario_idx ON codigo_vinculo (usuario_id)`);

    // Un chat por persona y una persona por chat. `sesion_id` = la sesión `origen = bot` vigente.
    await q.query(`CREATE TABLE vinculo_telegram (
      usuario_id integer PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
      chat_id bigint NOT NULL UNIQUE,
      telegram_usuario text NULL,
      sesion_id uuid NULL REFERENCES sesion(id) ON DELETE SET NULL,
      vinculado_en timestamptz NOT NULL DEFAULT now(),
      ultimo_envio_en timestamptz NULL
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS vinculo_telegram`);
    await q.query(`DROP TABLE IF EXISTS codigo_vinculo`);
    await q.query(`DROP TABLE IF EXISTS aviso_envio`);
    await q.query(`DROP TABLE IF EXISTS aviso`);
    await q.query(`DROP TABLE IF EXISTS preferencia_aviso`);
  }
}
