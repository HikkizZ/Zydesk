import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { iniciarJobs } from './boss.js';

describe('iniciarJobs', () => {
  it('registra las colas con sus programaciones en America/Santiago', async () => {
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
    // `avisos.resumen_diario` y `aviso.enviar` llegan con el bloque 6C
    const esperadas = [
      'mantencion.limpiar',
      'tickets.archivar',
      'archivos.limpiar_huerfanos',
      'tickets.vencimientos',
    ];
    expect([...colas].sort()).toEqual([...esperadas].sort());
    expect([...trabajadores].sort()).toEqual([...esperadas].sort());
    expect(programaciones.find((p) => p[0] === 'tickets.archivar')).toEqual([
      'tickets.archivar',
      '10 3 * * *',
      'America/Santiago',
    ]);
    expect(programaciones.find((p) => p[0] === 'tickets.vencimientos')).toEqual([
      'tickets.vencimientos',
      '*/30 * * * *',
      'America/Santiago',
    ]);
    expect(programaciones).toHaveLength(4);
  });
});
