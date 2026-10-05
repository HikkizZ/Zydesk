import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { fijarEnv } from '../../../test/entorno.js';
import { iniciarJobs } from './boss.js';

function crearBossDoble() {
  const colas: string[] = [];
  const trabajadores: string[] = [];
  const programaciones: [string, string, string | undefined][] = [];
  const envios: [string, unknown][] = [];
  const boss = {
    createQueue: async (n: string) => void colas.push(n),
    work: async (n: string) => void trabajadores.push(n),
    schedule: async (n: string, cron: string, _datos: unknown, opc: { tz?: string }) =>
      void programaciones.push([n, cron, opc.tz]),
    send: async (n: string, _datos: unknown, opc: unknown) => void envios.push([n, opc]),
  } as unknown as PgBoss;
  return { boss, colas, trabajadores, programaciones, envios };
}

describe('iniciarJobs', () => {
  it('registra las colas con sus programaciones en America/Santiago', async () => {
    fijarEnv('UF_ACTUALIZAR', true);
    const { boss, colas, trabajadores, programaciones, envios } = crearBossDoble();
    await iniciarJobs(boss);
    const esperadas = [
      'mantencion.limpiar',
      'tickets.archivar',
      'archivos.limpiar_huerfanos',
      'tickets.vencimientos',
      'aviso.enviar',
      'avisos.resumen_diario',
      'indicadores.uf',
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
    expect(programaciones.find((p) => p[0] === 'avisos.resumen_diario')).toEqual([
      'avisos.resumen_diario',
      '30 8 * * 1-5',
      'America/Santiago',
    ]);
    // `aviso.enviar` es una cola sin programación
    expect(programaciones.find((p) => p[0] === 'aviso.enviar')).toBeUndefined();
    expect(programaciones.find((p) => p[0] === 'indicadores.uf')).toEqual([
      'indicadores.uf',
      '7 * * * *',
      'America/Santiago',
    ]);
    expect(programaciones).toHaveLength(6);
    expect(envios).toEqual([
      ['indicadores.uf', { singletonKey: 'arranque', singletonSeconds: 600 }],
    ]);
  });

  it('con UF_ACTUALIZAR=false registra la cola y el worker pero no programa ni envía', async () => {
    fijarEnv('UF_ACTUALIZAR', false);
    const { boss, colas, trabajadores, programaciones, envios } = crearBossDoble();
    await iniciarJobs(boss);
    expect(colas).toHaveLength(7);
    expect(trabajadores).toContain('indicadores.uf');
    expect(programaciones.find((p) => p[0] === 'indicadores.uf')).toBeUndefined();
    expect(programaciones).toHaveLength(5);
    expect(envios).toEqual([]);
  });
});
