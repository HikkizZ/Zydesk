import request from 'supertest';
import { ROLES } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import {
  crearIndicadorUf,
  crearUsuario,
  ingresarComo,
  ingresarComoBot,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { metadatosRutas } from '../../core/http/openapi.js';
import { hoyEnSantiago } from '../../core/fechas.js';

const app = () => crearApp({ comprobarBd: async () => true });

const dia = (dias: number): string => {
  const d = new Date(`${hoyEnSantiago()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

describe('prueba 1: permisos de GET /api/indicadores/uf', () => {
  it('sin sesión → 401 con X-Request-Id', async () => {
    const r = await request(app()).get('/api/indicadores/uf');
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('NO_AUTENTICADO');
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it.each(ROLES)('rol %s → 200', async (rol) => {
    const { agente } = await ingresarComo(app(), await crearUsuario({ rol }));
    expect((await agente.get('/api/indicadores/uf')).status).toBe(200);
  });

  it('Bearer del bot → 200', async () => {
    const { agente } = await ingresarComoBot(app(), await crearUsuario());
    expect((await agente.get('/api/indicadores/uf')).status).toBe(200);
  });
});

describe('prueba 7: lectura del indicador', () => {
  const leer = async () => {
    const { agente } = await ingresarComo(app(), await crearUsuario());
    return agente.get('/api/indicadores/uf');
  };

  it('sin filas → 200 null', async () => {
    const r = await leer();
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it('con filas de ayer y de hoy → la de hoy, al día', async () => {
    await crearIndicadorUf({ fecha: dia(-1), valor: 41000, fuente: 'boostr' });
    await crearIndicadorUf({ fecha: dia(0), valor: 41098.15, fuente: 'mindicador' });
    const r = await leer();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      fecha: dia(0),
      valor: 41098.15,
      fuente: 'mindicador',
      hoy: hoyEnSantiago(),
      desactualizado: false,
    });
    expect(Object.keys(r.body).sort()).toEqual(
      ['desactualizado', 'fecha', 'fuente', 'hoy', 'obtenido_en', 'valor'].sort(),
    );
    expect(new Date(r.body.obtenido_en).toString()).not.toBe('Invalid Date');
  });

  it('solo una fila de hace 3 días → desactualizado, con la fecha de Santiago como hoy', async () => {
    await crearIndicadorUf({ fecha: dia(-3), valor: 40900, fuente: 'boostr' });
    const r = await leer();
    expect(r.body).toMatchObject({
      fecha: dia(-3),
      valor: 40900,
      hoy: hoyEnSantiago(),
      desactualizado: true,
    });
  });
});

describe('prueba 9: sin vía de escritura', () => {
  it('no existe ruta distinta de GET bajo /api/indicadores', () => {
    app();
    const rutas = metadatosRutas().filter((r) => r.path.startsWith('/api/indicadores'));
    expect(rutas.map((r) => `${r.metodo} ${r.path}`)).toEqual(['get /api/indicadores/uf']);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    '%s /api/indicadores/uf → 404',
    async (m) => {
      const { agente } = await ingresarComo(app(), await crearUsuario({ rol: 'admin' }));
      const r = await agente[m]('/api/indicadores/uf').send({
        valor: 1,
        fecha: hoyEnSantiago(),
        fuente: 'manual',
      });
      expect(r.status).toBe(404);
    },
  );
});
