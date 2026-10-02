import type PgBoss from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { crearAviso, crearUsuario } from '../../../test/fabricas.js';
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

describe('mantencion.limpiar (fase 6)', () => {
  it('borra códigos de vinculación vencidos hace más de un día y avisos leídos de más de 90 días', async () => {
    const u = await crearUsuario();
    const codigo = (hash: string, expira: string) =>
      dataSource.query(
        `INSERT INTO codigo_vinculo (codigo_hash, usuario_id, expira_en) VALUES ($1, $2, now() + $3::interval)`,
        [hash, u.id, expira],
      );
    await codigo('viejo', '-2 days');
    await codigo('reciente', '-1 hour');
    await codigo('vigente', '5 minutes');

    const viejoLeido = await crearAviso(u.id, { leido: true });
    const viejoNoLeido = await crearAviso(u.id);
    const recienteLeido = await crearAviso(u.id, { leido: true });
    await dataSource.query(`UPDATE aviso SET leido_en = now() - interval '91 days' WHERE id = $1`, [
      viejoLeido.id,
    ]);
    await dataSource.query(
      `UPDATE aviso SET creado_en = now() - interval '200 days' WHERE id = $1`,
      [viejoNoLeido.id],
    );

    const r = await mantencionLimpiar('job-2');
    expect(r).toMatchObject({ codigos_borrados: 1, avisos_borrados: 1, reencolados: 0 });
    const codigos = await dataSource.query(`SELECT codigo_hash FROM codigo_vinculo ORDER BY id`);
    expect(codigos.map((c: { codigo_hash: string }) => c.codigo_hash)).toEqual([
      'reciente',
      'vigente',
    ]);
    const avisos = await dataSource.query(`SELECT id FROM aviso ORDER BY id`);
    expect(avisos.map((a: { id: string }) => Number(a.id))).toEqual([
      Number(viejoNoLeido.id),
      Number(recienteLeido.id),
    ]);
  });

  it('reencola los envíos de Telegram pendientes hace más de 1 hora, una sola vez', async () => {
    const u = await crearUsuario();
    const viejo = await crearAviso(u.id);
    const reciente = await crearAviso(u.id);
    const enviado = await crearAviso(u.id);
    for (const a of [viejo, reciente, enviado]) {
      await dataSource.query(
        `INSERT INTO aviso_envio (aviso_id, canal, estado) VALUES ($1, 'telegram', $2)`,
        [a.id, a === enviado ? 'enviado' : 'pendiente'],
      );
    }
    await dataSource.query(
      `UPDATE aviso_envio SET actualizado_en = now() - interval '2 hours' WHERE aviso_id = ANY($1::bigint[])`,
      [[viejo.id, enviado.id]],
    );
    const send = vi.fn().mockResolvedValue('job');
    const boss = { send } as unknown as PgBoss;

    expect((await mantencionLimpiar('job-3', boss)).reencolados).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      'aviso.enviar',
      { aviso_id: Number(viejo.id), canal: 'telegram' },
      { singletonKey: `${viejo.id}:telegram` },
    );
    // `actualizado_en` se renovó: la siguiente mantención no lo vuelve a encolar
    expect((await mantencionLimpiar('job-4', boss)).reencolados).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
