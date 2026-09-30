import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { crearTicket } from '../../../test/fabricas.js';
import { dataSource } from '../../config/db.js';
import { archivarCerrados } from './archivar.js';
import { iniciarJobs } from './boss.js';

const hace = (dias: number): Date => new Date(Date.now() - dias * 86_400_000);

const eventos = (id: number) =>
  dataSource.query(
    `SELECT accion, autor_id, campo FROM evento WHERE entidad = 'ticket' AND entidad_id = $1`,
    [String(id)],
  );

describe('tickets.archivar', () => {
  it('archiva el cerrado hace 8 días con un evento; no toca el de hace 2 días, abiertos ni archivados', async () => {
    const viejo = await crearTicket({ estado: 'resuelto', cerrado_en: hace(8) });
    const descartado = await crearTicket({ estado: 'descartado', cerrado_en: hace(30) });
    const reciente = await crearTicket({ estado: 'resuelto', cerrado_en: hace(2) });
    const abierto = await crearTicket({ estado: 'en_curso' });
    const yaArchivado = await crearTicket({
      estado: 'resuelto',
      cerrado_en: hace(20),
      archivado_en: hace(13),
    });

    const r = await archivarCerrados('job-1');
    expect(r).toEqual({ archivados: 2 });

    const filas = await dataSource.query(`SELECT id, archivado_en FROM ticket`);
    const por = new Map<number, Date | null>(
      filas.map((f: { id: number; archivado_en: Date | null }) => [f.id, f.archivado_en]),
    );
    expect(por.get(viejo.id)).not.toBeNull();
    expect(por.get(descartado.id)).not.toBeNull();
    expect(por.get(reciente.id)).toBeNull();
    expect(por.get(abierto.id)).toBeNull();
    expect(por.get(yaArchivado.id)?.getTime()).toBe(yaArchivado.archivado_en!.getTime());

    expect(await eventos(viejo.id)).toEqual([{ accion: 'archivado', autor_id: null, campo: null }]);
    expect(await eventos(reciente.id)).toEqual([]);
    expect(await eventos(abierto.id)).toEqual([]);
    expect(await eventos(yaArchivado.id)).toEqual([]);

    // idempotente
    expect(await archivarCerrados()).toEqual({ archivados: 0 });
    expect(await eventos(viejo.id)).toHaveLength(1);
  });

  it('un ticket reabierto después de archivado vuelve a ser elegible solo al cerrarse de nuevo', async () => {
    const t = await crearTicket({ estado: 'resuelto', cerrado_en: hace(10) });
    await archivarCerrados();
    await dataSource.query(
      `UPDATE ticket SET estado = 'en_curso', cerrado_en = NULL, archivado_en = NULL WHERE id = $1`,
      [t.id],
    );
    expect(await archivarCerrados()).toEqual({ archivados: 0 });
  });
});

describe('iniciarJobs', () => {
  it('registra las 3 colas con sus programaciones en America/Santiago', async () => {
    const colas: string[] = [];
    const trabajadores: string[] = [];
    const programaciones: [string, string, string | undefined][] = [];
    const boss = {
      createQueue: async (n: string) => void colas.push(n),
      work: async (n: string) => void trabajadores.push(n),
      schedule: async (n: string, cron: string, _datos: unknown, opc: { tz?: string }) =>
        void programaciones.push([n, cron, opc.tz]),
    } as unknown as PgBoss;
    await iniciarJobs(boss);
    const esperadas = ['mantencion.limpiar', 'tickets.archivar', 'archivos.limpiar_huerfanos'];
    expect([...colas].sort()).toEqual([...esperadas].sort());
    expect([...trabajadores].sort()).toEqual([...esperadas].sort());
    expect(programaciones.find((p) => p[0] === 'tickets.archivar')).toEqual([
      'tickets.archivar',
      '10 3 * * *',
      'America/Santiago',
    ]);
    expect(programaciones).toHaveLength(3);
  });
});
