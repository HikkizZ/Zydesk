import type PgBoss from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { crearArchivoPendiente, crearTicket, crearUsuario } from '../../../test/fabricas.js';
import { dataSource } from '../../config/db.js';
import { storage } from '../../integraciones/storage/storage.js';
import { Archivo } from '../../modulos/archivos/archivo.entity.js';
import { limpiarHuerfanos, registrarJobArchivos } from './archivos.js';

async function envejecer(id: number, horas: number): Promise<void> {
  await dataSource.query(
    `UPDATE archivo SET subido_en = now() - make_interval(hours => $2) WHERE id = $1`,
    [id, horas],
  );
}

describe('archivos.limpiar_huerfanos', () => {
  it('borra fila y disco del pendiente de 25 h; conserva el de 1 h y los asociados aunque sean viejos', async () => {
    const u = await crearUsuario();
    const viejo = await crearArchivoPendiente(u.id);
    const reciente = await crearArchivoPendiente(u.id);
    const asociado = await crearArchivoPendiente(u.id);
    await envejecer(viejo.id, 25);
    await envejecer(reciente.id, 1);
    await envejecer(asociado.id, 72);
    await dataSource.manager.update(
      Archivo,
      { id: asociado.id },
      { entidad: 'ticket', entidad_id: (await crearTicket()).id },
    );

    expect(await limpiarHuerfanos('job-1')).toEqual({ borrados: 1 });

    const ids = (await dataSource.manager.find(Archivo, { order: { id: 'ASC' } })).map((a) => a.id);
    expect(ids).toEqual([reciente.id, asociado.id]);
    expect(await storage.existe(viejo.clave)).toBe(false);
    expect(await storage.existe(reciente.clave)).toBe(true);
    expect(await storage.existe(asociado.clave)).toBe(true);
  });

  it('si el archivo ya no está en disco igualmente borra la fila; sin huérfanos devuelve 0', async () => {
    const u = await crearUsuario();
    const viejo = await crearArchivoPendiente(u.id);
    await envejecer(viejo.id, 30);
    await storage.eliminar(viejo.clave);
    expect(await limpiarHuerfanos()).toEqual({ borrados: 1 });
    expect(await limpiarHuerfanos()).toEqual({ borrados: 0 });
  });
});

describe('registrarJobArchivos', () => {
  it('crea la cola, el worker y la programación diaria 04:00 America/Santiago', async () => {
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      work: vi.fn().mockResolvedValue('worker'),
      schedule: vi.fn().mockResolvedValue(undefined),
    };
    await registrarJobArchivos(boss as unknown as PgBoss);
    expect(boss.createQueue).toHaveBeenCalledWith('archivos.limpiar_huerfanos');
    expect(boss.work).toHaveBeenCalledWith('archivos.limpiar_huerfanos', expect.any(Function));
    expect(boss.schedule).toHaveBeenCalledWith(
      'archivos.limpiar_huerfanos',
      '0 4 * * *',
      {},
      { tz: 'America/Santiago' },
    );
  });
});
