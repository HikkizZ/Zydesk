import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Reportes1791000000014 implements MigrationInterface {
  name = 'Reportes1791000000014';

  // Solo índices para las consultas de la Fase 7 (sin tablas ni columnas nuevas).
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX ticket_cerrado_en_idx ON ticket (cerrado_en) WHERE cerrado_en IS NOT NULL`,
    );
    await q.query(`CREATE INDEX registro_horas_fecha_idx ON registro_horas (fecha)`);
    await q.query(
      `CREATE INDEX ot_facturada_en_idx ON ot (facturada_en) WHERE facturada_en IS NOT NULL`,
    );
    await q.query(`CREATE INDEX ticket_responsable_usuario_idx ON ticket_responsable (usuario_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ticket_responsable_usuario_idx`);
    await q.query(`DROP INDEX ot_facturada_en_idx`);
    await q.query(`DROP INDEX registro_horas_fecha_idx`);
    await q.query(`DROP INDEX ticket_cerrado_en_idx`);
  }
}
