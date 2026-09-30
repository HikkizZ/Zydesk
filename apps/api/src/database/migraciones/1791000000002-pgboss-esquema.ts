import type { MigrationInterface, QueryRunner } from 'typeorm';

// pg-boss corre como zydesk_app y crea sus tablas en este esquema (única excepción al "owner crea todo").
// El esquema pertenece al owner y se da ALL a zydesk_app: `AUTHORIZATION zydesk_app` exige que quien
// migra sea miembro de ese rol, y el owner no lo es (ver informe del bloque 1A).
export class PgbossEsquema1791000000002 implements MigrationInterface {
  name = 'PgbossEsquema1791000000002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS pgboss`);
    await q.query(`GRANT ALL ON SCHEMA pgboss TO zydesk_app`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS pgboss CASCADE`);
  }
}
