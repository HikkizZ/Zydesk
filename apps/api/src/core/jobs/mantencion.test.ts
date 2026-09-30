import { describe, expect, it } from 'vitest';
import { crearUsuario } from '../../../test/fabricas.js';
import { dataSource } from '../../config/db.js';
import { dataSourceOwner } from '../../database/data-source-owner.js';
import { mantencionLimpiar } from './mantencion.js';

async function insertarSesion(
  usuarioId: number,
  nombre: string,
  expira: string,
  expiraMax: string,
) {
  await dataSource.query(
    `INSERT INTO sesion (token_hash, usuario_id, origen, expira_en, expira_max_en)
     VALUES ($1, $2, 'web', now() + $3::interval, now() + $4::interval)`,
    [nombre, usuarioId, expira, expiraMax],
  );
}

describe('mantencion.limpiar', () => {
  it('borra sesiones vencidas (por inactividad o absolutas), respeta las vigentes y limpia la auditoría', async () => {
    const u = await crearUsuario();
    await insertarSesion(u.id, 'vigente', '1 hour', '1 day');
    await insertarSesion(u.id, 'inactiva', '-1 hour', '1 day');
    await insertarSesion(u.id, 'absoluta', '1 hour', '-1 minute');
    await insertarSesion(u.id, 'inactiva-2', '-2 hours', '1 day');
    await dataSourceOwner.initialize();
    try {
      await dataSourceOwner.query(
        `INSERT INTO auditoria (accion, creado_en) VALUES ('ingreso_ok', now() - interval '2 years')`,
      );
    } finally {
      await dataSourceOwner.destroy();
    }

    const r = await mantencionLimpiar('job-1');
    expect(r.sesiones_borradas).toBe(3);
    const restantes = await dataSource.query(`SELECT token_hash FROM sesion`);
    expect(restantes).toEqual([{ token_hash: 'vigente' }]);
    const [a] = await dataSource.query(`SELECT count(*)::int AS n FROM auditoria`);
    expect(a.n).toBe(0);
  });
});
