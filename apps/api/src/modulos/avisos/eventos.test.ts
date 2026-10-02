import { describe, expect, it } from 'vitest';
import { crearAviso, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const n = async (tabla: 'evento' | 'auditoria'): Promise<number> =>
  Number((await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla}`))[0].n);

// Cobertura de eventos (ADR 0003, spec fase 6 §13): leer avisos, marcarlos y cambiar preferencias no
// dejan `evento` ni `auditoria`.
describe('avisos y preferencias no dejan evento ni auditoria', () => {
  it('GET y POST de avisos y GET/PUT de preferencias', async () => {
    const usuario = await crearUsuario();
    const { agente } = await ingresarComo(crearApp({ comprobarBd: async () => true }), usuario);
    const a = await crearAviso(usuario.id);
    const eventos = await n('evento');
    const auditorias = await n('auditoria');

    expect((await agente.get('/api/avisos')).status).toBe(200);
    expect((await agente.get('/api/avisos/no-leidos')).status).toBe(200);
    expect((await agente.post(`/api/avisos/${a.id}/leer`)).status).toBe(200);
    expect((await agente.post('/api/avisos/leer-todos')).status).toBe(200);
    expect((await agente.get('/api/yo/avisos/preferencias')).status).toBe(200);
    expect(
      (
        await agente
          .put('/api/yo/avisos/preferencias')
          .send({ filas: [{ evento: 'mencion', app: false, telegram: false }] })
      ).status,
    ).toBe(200);

    expect(await n('evento')).toBe(eventos);
    expect(await n('auditoria')).toBe(auditorias);
  });
});
