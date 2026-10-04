import { describe, expect, it } from 'vitest';
import { ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { QUERY_BASE, descargar, montarEscenario } from './reportes.escenario.js';

const app = () => crearApp({ comprobarBd: async () => true });

const contar = async (tabla: string): Promise<number> =>
  (await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n;

// Cobertura de la spec fase 7 §6 (ADR 0003): ver reportes no deja rastro; exportar deja una auditoría.
describe('eventos y auditoría de los reportes', () => {
  it('GET /api/reportes no deja evento ni auditoría', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const [ev, aud] = [await contar('evento'), await contar('auditoria')];
    const r = await agente.get(`/api/reportes?${QUERY_BASE}`);
    expect(r.status).toBe(200);
    expect(await contar('evento')).toBe(ev);
    expect(await contar('auditoria')).toBe(aud);
  });

  it('exportar.xlsx deja exactamente una auditoría de reportes y ningún evento', async () => {
    const e = await montarEscenario();
    const { agente } = await ingresarComo(app(), e.lect);
    const [ev, aud] = [await contar('evento'), await contar('auditoria')];
    const r = await descargar(agente, `/api/reportes/exportar.xlsx?${QUERY_BASE}`);
    expect(r.status).toBe(200);
    expect(await contar('evento')).toBe(ev);
    expect(await contar('auditoria')).toBe(aud + 1);
    const filas: { detalle: { entidad: string } }[] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'exportacion'`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]!.detalle.entidad).toBe('reportes');
  });
});
