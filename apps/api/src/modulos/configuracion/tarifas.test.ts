import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  crearCotizacion,
  crearOt,
  crearTicket,
  crearUsuario,
  fijarTarifas,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { leerTarifas } from './configuracion.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const entrada = (extra: object = {}) => ({
  hora_normal: { moneda: 'CLP', valor: 38000 },
  hora_extendida: { moneda: 'CLP', valor: 45000 },
  hora_urgencia: null,
  traslado_km: { moneda: 'CLP', valor: 500 },
  costo_interno: 12000,
  iva_pct: 19,
  validez_dias_defecto: 30,
  condiciones_defecto: 'Pago a 30 días',
  ...extra,
});

describe('leerTarifas', () => {
  it('la semilla base trae los valores por defecto', async () => {
    expect(await leerTarifas()).toEqual({
      hora_normal: null,
      hora_extendida: null,
      hora_urgencia: null,
      traslado_km: null,
      costo_interno: null,
      iva_pct: 19,
      validez_dias_defecto: 30,
      condiciones_defecto: null,
    });
  });

  it('sin la clave (base antigua) devuelve los valores por defecto', async () => {
    await dataSource.query(`DELETE FROM configuracion WHERE clave = 'tarifas'`);
    expect(await leerTarifas()).toMatchObject({
      hora_normal: null,
      iva_pct: 19,
      validez_dias_defecto: 30,
    });
  });

  it('lee lo guardado', async () => {
    await fijarTarifas({ hora_normal: { moneda: 'CLP', valor: 40000 } });
    expect((await leerTarifas()).hora_normal).toEqual({ moneda: 'CLP', valor: 40000 });
  });
});

describe('/api/config/tarifas', () => {
  it('sin sesión → 401 en GET y PUT', async () => {
    expect((await request(app()).get('/api/config/tarifas')).status).toBe(401);
    const r = await request(app())
      .put('/api/config/tarifas')
      .set('X-Requested-With', 'Zydesk')
      .send(entrada());
    expect(r.status).toBe(401);
  });

  it('roles: todos leen; solo admin escribe (técnico, coordinación y lectura → 403)', async () => {
    for (const rol of ['admin', 'coordinacion', 'tecnico', 'lectura'] as const) {
      const { agente } = await como(rol);
      expect((await agente.get('/api/config/tarifas')).status, rol).toBe(200);
    }
    for (const rol of ['coordinacion', 'tecnico', 'lectura'] as const) {
      const { agente } = await como(rol);
      expect((await agente.put('/api/config/tarifas').send(entrada())).status, rol).toBe(403);
    }
    const { agente } = await como('admin');
    expect((await agente.put('/api/config/tarifas').send(entrada())).status).toBe(200);
  });

  it('PUT guarda y GET lo devuelve; auditoría con los campos cambiados y sin montos', async () => {
    const { agente, usuario } = await como('admin');
    const r = await agente.put('/api/config/tarifas').send(entrada());
    expect(r.status).toBe(200);
    expect(r.body).toEqual(entrada());
    expect((await agente.get('/api/config/tarifas')).body).toEqual(entrada());
    const [a] = await dataSource.query(
      `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id DESC LIMIT 1`,
    );
    expect(a.usuario_id).toBe(usuario.id);
    expect(a.detalle).toEqual({
      seccion: 'tarifas',
      campos: [
        'hora_normal',
        'hora_extendida',
        'traslado_km',
        'costo_interno',
        'condiciones_defecto',
      ],
    });
    expect(JSON.stringify(a.detalle)).not.toContain('38000');
    const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM evento`);
    expect(n).toBe(0);

    await agente.put('/api/config/tarifas').send(entrada({ iva_pct: 10 }));
    const [b] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id DESC LIMIT 1`,
    );
    expect(b.detalle).toEqual({ seccion: 'tarifas', campos: ['iva_pct'] });
  });

  it('valida: decimales, negativos, IVA fuera de rango y validez distinta de 15/30 → 400', async () => {
    const { agente } = await como('admin');
    for (const malo of [
      { hora_normal: 38000.5 },
      { hora_normal: -1 },
      { iva_pct: 101 },
      { validez_dias_defecto: 20 },
    ]) {
      const r = await agente.put('/api/config/tarifas').send(entrada(malo));
      expect(r.status, JSON.stringify(malo)).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
    }
  });

  it('cambiar iva_pct no altera cotizaciones existentes (snapshot)', async () => {
    const { agente } = await como('admin');
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id);
    const cot = await crearCotizacion(ot.id, {
      lineas: [{ cantidad: 1, precio_unitario: 100000 }],
    });
    expect(cot.total).toBe(119000);
    const r = await agente.put('/api/config/tarifas').send(entrada({ iva_pct: 0 }));
    expect(r.status).toBe(200);
    const [fila] = await dataSource.query(
      `SELECT iva_pct::float AS iva_pct, total::float AS total FROM cotizacion WHERE id = $1`,
      [cot.id],
    );
    expect(fila).toEqual({ iva_pct: 19, total: 119000 });
    expect((await leerTarifas()).iva_pct).toBe(0);
  });
});
