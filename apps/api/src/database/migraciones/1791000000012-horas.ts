import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Horas1791000000012 implements MigrationInterface {
  name = 'Horas1791000000012';

  async up(q: QueryRunner): Promise<void> {
    // una tarea solo con su OT (las tareas de ticket no tienen horas, spec §4.4); que la tarea sea de ESA OT lo valida el servicio
    // "Sin ticket" (ambos destinos nulos) exige descripción
    await q.query(`ALTER TABLE registro_horas
      ADD COLUMN tarea_id integer NULL REFERENCES tarea(id) ON DELETE SET NULL,
      ADD CONSTRAINT registro_horas_tarea_chk CHECK (tarea_id IS NULL OR ot_id IS NOT NULL),
      ADD CONSTRAINT registro_horas_sin_ticket_chk CHECK (ticket_id IS NOT NULL OR ot_id IS NOT NULL OR descripcion IS NOT NULL)`);
    await q.query(`CREATE INDEX registro_horas_tarea_idx ON registro_horas (tarea_id)`);
    // Una sola fila MANUAL (sin mensaje) por celda: persona + día + destino (+ tarea) (+ descripción en "Sin ticket").
    await q.query(`CREATE UNIQUE INDEX registro_horas_celda_manual_uq
      ON registro_horas (usuario_id, fecha, COALESCE(ticket_id, 0), COALESCE(ot_id, 0), COALESCE(tarea_id, 0), COALESCE(descripcion, ''))
      WHERE mensaje_id IS NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS registro_horas_celda_manual_uq`);
    await q.query(`DROP INDEX IF EXISTS registro_horas_tarea_idx`);
    await q.query(`ALTER TABLE registro_horas
      DROP CONSTRAINT IF EXISTS registro_horas_sin_ticket_chk,
      DROP CONSTRAINT IF EXISTS registro_horas_tarea_chk,
      DROP COLUMN IF EXISTS tarea_id`);
  }
}
