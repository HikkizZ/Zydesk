import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Ots1791000000010 implements MigrationInterface {
  name = 'Ots1791000000010';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE ot (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      numero integer NOT NULL UNIQUE,
      codigo text NOT NULL UNIQUE,
      ticket_id integer NOT NULL REFERENCES ticket(id) ON DELETE RESTRICT,
      tipo text NOT NULL CHECK (tipo IN ('facturable','interna')),
      etapa text NOT NULL CHECK (etapa IN ('borrador','cotizada','aprobada','en_ejecucion','cerrada','cancelada')),
      titulo text NOT NULL,
      alcance text NULL,
      responsable_tecnico_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      cliente_id integer NULL REFERENCES cliente(id) ON DELETE SET NULL,
      contacto_id integer NULL REFERENCES contacto(id) ON DELETE SET NULL,
      inicio date NULL,
      termino date NULL,
      oc_cliente text NULL,
      condicion_pago text NULL,
      contrato_id integer NULL REFERENCES contrato_bolsa(id) ON DELETE SET NULL,
      centro_costo text NULL,
      area_solicitante text NULL,
      aprobador_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      aprobada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      aprobada_en timestamptz NULL,
      estado_facturacion text NOT NULL CHECK (estado_facturacion IN ('no_aplica','pendiente','por_facturar','facturada')),
      n_factura text NULL,
      facturada_en timestamptz NULL,
      facturada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      resolvio_ticket boolean NULL,
      resumen_cierre text NULL,
      cerrada_en timestamptz NULL,
      cerrada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      motivo_cancelacion text NULL,
      cancelada_en timestamptz NULL,
      creado_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      CHECK (tipo = 'facturable' OR estado_facturacion = 'no_aplica'),
      CHECK (etapa <> 'cerrada' OR (resumen_cierre IS NOT NULL AND resolvio_ticket IS NOT NULL AND cerrada_en IS NOT NULL)),
      CHECK (etapa <> 'cancelada' OR (motivo_cancelacion IS NOT NULL AND cancelada_en IS NOT NULL)),
      CHECK (estado_facturacion <> 'facturada' OR (n_factura IS NOT NULL AND facturada_en IS NOT NULL)),
      CHECK (termino IS NULL OR inicio IS NULL OR termino >= inicio)
    )`);
    await q.query(`CREATE INDEX ot_ticket_idx ON ot (ticket_id)`);
    await q.query(`CREATE INDEX ot_etapa_idx ON ot (etapa)`);
    await q.query(`CREATE INDEX ot_estado_facturacion_idx ON ot (estado_facturacion)`);
    await q.query(`CREATE INDEX ot_cliente_idx ON ot (cliente_id)`);
    await q.query(`CREATE INDEX ot_responsable_tecnico_idx ON ot (responsable_tecnico_id)`);
    await q.query(`CREATE INDEX ot_aprobador_idx ON ot (aprobador_id)`);
    await q.query(`CREATE INDEX ot_creado_en_idx ON ot (creado_en DESC)`);

    await q.query(`CREATE TABLE aprobacion_cliente (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ot_id integer NOT NULL UNIQUE REFERENCES ot(id) ON DELETE CASCADE,
      contacto_id integer NOT NULL REFERENCES contacto(id) ON DELETE RESTRICT,
      fecha date NOT NULL,
      forma text NOT NULL CHECK (forma IN ('orden_de_compra','correo','cotizacion_firmada')),
      archivo_id integer NOT NULL REFERENCES archivo(id) ON DELETE RESTRICT,
      registrada_por integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
      registrada_en timestamptz NOT NULL DEFAULT now()
    )`);

    await q.query(`ALTER TABLE tarea ALTER COLUMN ticket_id DROP NOT NULL`);
    await q.query(`ALTER TABLE tarea
      ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE CASCADE,
      ADD COLUMN horas_estimadas numeric(6,2) NULL CHECK (horas_estimadas >= 0),
      ADD COLUMN horas_reales numeric(6,2) NULL CHECK (horas_reales >= 0),
      ADD CONSTRAINT tarea_destino_chk CHECK ((ticket_id IS NULL) <> (ot_id IS NULL)),
      ADD CONSTRAINT tarea_horas_solo_ot_chk CHECK (ot_id IS NOT NULL OR (horas_estimadas IS NULL AND horas_reales IS NULL))`);
    await q.query(`CREATE INDEX tarea_ot_orden_idx ON tarea (ot_id, orden)`);

    await q.query(`ALTER TABLE mensaje ALTER COLUMN ticket_id DROP NOT NULL`);
    await q.query(`ALTER TABLE mensaje
      ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE CASCADE,
      ADD COLUMN copiado_desde_id integer NULL REFERENCES mensaje(id) ON DELETE SET NULL,
      ADD CONSTRAINT mensaje_destino_chk CHECK ((ticket_id IS NULL) <> (ot_id IS NULL))`);
    await q.query(`CREATE INDEX mensaje_ot_creado_idx ON mensaje (ot_id, creado_en)`);
    await q.query(
      `CREATE UNIQUE INDEX mensaje_copiado_desde_uq ON mensaje (copiado_desde_id) WHERE copiado_desde_id IS NOT NULL`,
    );

    await q.query(`ALTER TABLE registro_horas
      ADD COLUMN ot_id integer NULL REFERENCES ot(id) ON DELETE SET NULL,
      ADD CONSTRAINT registro_horas_destino_chk CHECK (ticket_id IS NULL OR ot_id IS NULL)`);
    await q.query(`CREATE INDEX registro_horas_ot_idx ON registro_horas (ot_id)`);

    await q.query(`ALTER TABLE archivo DROP CONSTRAINT archivo_entidad_check`);
    await q.query(
      `ALTER TABLE archivo ADD CONSTRAINT archivo_entidad_chk CHECK (entidad IN ('ticket','ot'))`,
    );
  }

  // Falla si ya hay filas con `ot_id` u `entidad = 'ot'`: aceptable, `db:revertir` es de desarrollo.
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE archivo DROP CONSTRAINT IF EXISTS archivo_entidad_chk`);
    await q.query(
      `ALTER TABLE archivo ADD CONSTRAINT archivo_entidad_check CHECK (entidad IN ('ticket'))`,
    );

    await q.query(`DROP INDEX IF EXISTS registro_horas_ot_idx`);
    await q.query(`ALTER TABLE registro_horas
      DROP CONSTRAINT IF EXISTS registro_horas_destino_chk,
      DROP COLUMN IF EXISTS ot_id`);

    await q.query(`DROP INDEX IF EXISTS mensaje_copiado_desde_uq`);
    await q.query(`DROP INDEX IF EXISTS mensaje_ot_creado_idx`);
    await q.query(`ALTER TABLE mensaje
      DROP CONSTRAINT IF EXISTS mensaje_destino_chk,
      DROP COLUMN IF EXISTS copiado_desde_id,
      DROP COLUMN IF EXISTS ot_id`);
    await q.query(`ALTER TABLE mensaje ALTER COLUMN ticket_id SET NOT NULL`);

    await q.query(`DROP INDEX IF EXISTS tarea_ot_orden_idx`);
    await q.query(`ALTER TABLE tarea
      DROP CONSTRAINT IF EXISTS tarea_horas_solo_ot_chk,
      DROP CONSTRAINT IF EXISTS tarea_destino_chk,
      DROP COLUMN IF EXISTS horas_reales,
      DROP COLUMN IF EXISTS horas_estimadas,
      DROP COLUMN IF EXISTS ot_id`);
    await q.query(`ALTER TABLE tarea ALTER COLUMN ticket_id SET NOT NULL`);

    await q.query(`DROP TABLE IF EXISTS aprobacion_cliente`);
    await q.query(`DROP TABLE IF EXISTS ot`);
  }
}
