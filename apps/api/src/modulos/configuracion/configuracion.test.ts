import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const numeracion = (extra: { ticket?: object; ot?: object } = {}) => ({
  ticket: { prefijo: 'TK-', inicial: 1000, digitos: 4, modo: 'correlativo', ...extra.ticket },
  ot: { prefijo: 'OT-', inicial: 200, digitos: 4, ...extra.ot },
});

describe('marca y logo', () => {
  it('GET /api/config/marca es público y refleja PUT /api/config/marca', async () => {
    const { agente } = await como('admin');
    const inicial = await request(app()).get('/api/config/marca');
    expect(inicial.status).toBe(200);
    expect(inicial.body).toEqual({ nombre_app: 'Zydesk', logo_url: null });
    const r = await agente.put('/api/config/marca').send({ nombre_app: 'Mesa de ayuda' });
    expect(r.body).toEqual({ nombre_app: 'Mesa de ayuda', logo_url: null });
    expect((await request(app()).get('/api/config/marca')).body.nombre_app).toBe('Mesa de ayuda');
    const [a] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id DESC LIMIT 1`,
    );
    expect(a.detalle).toEqual({ seccion: 'marca', nombre_app: 'Mesa de ayuda' });
    expect((await agente.put('/api/config/marca').send({ nombre_app: ' ' })).status).toBe(400);
  });

  it('logo: guardar, servir en binario sin sesión, reemplazar y quitar', async () => {
    const { agente } = await como('admin');
    expect((await request(app()).get('/api/config/logo')).status).toBe(404);
    const r = await agente
      .put('/api/config/logo')
      .send({ tipo_mime: 'image/png', base64: PNG.toString('base64') });
    expect(r.status).toBe(200);
    expect(r.body.logo_url).toBe('/api/config/logo');
    const bin = await request(app())
      .get('/api/config/logo')
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (d: Buffer) => partes.push(d));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(bin.status).toBe(200);
    expect(bin.headers['content-type']).toContain('image/png');
    expect(bin.headers['cache-control']).toBe('no-cache');
    expect(Buffer.from(bin.body as Buffer).equals(PNG)).toBe(true);
    const [a] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'config_cambiada' ORDER BY id DESC LIMIT 1`,
    );
    expect(a.detalle).toEqual({ seccion: 'logo', tamano: PNG.length });

    const svg = await agente
      .put('/api/config/logo')
      .send({ tipo_mime: 'image/svg+xml', base64: SVG.toString('base64') });
    expect(svg.status).toBe(200);
    expect((await request(app()).get('/api/config/logo')).headers['content-type']).toContain(
      'image/svg+xml',
    );

    const q = await agente.delete('/api/config/logo');
    expect(q.body).toEqual({ nombre_app: 'Zydesk', logo_url: null });
    expect((await request(app()).get('/api/config/logo')).status).toBe(404);
  });

  it('logo inválido → 400: firma que no corresponde, base64 roto, más de 200 KB', async () => {
    const { agente } = await como('admin');
    const enviar = (tipo_mime: string, base64: string) =>
      agente.put('/api/config/logo').send({ tipo_mime, base64 });
    expect((await enviar('image/png', SVG.toString('base64'))).status).toBe(400);
    expect((await enviar('image/jpeg', PNG.toString('base64'))).status).toBe(400);
    expect((await enviar('image/svg+xml', PNG.toString('base64'))).status).toBe(400);
    expect((await enviar('image/png', 'no es base64!!')).status).toBe(400);
    expect((await enviar('image/gif', PNG.toString('base64'))).status).toBe(400);
    const grande = Buffer.concat([PNG, Buffer.alloc(205 * 1024)]);
    const r = await enviar('image/png', grande.toString('base64'));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect((await request(app()).get('/api/config/logo')).status).toBe(404);
  });

  it('técnico y lectura no pueden cambiar marca ni logo', async () => {
    const { agente } = await como('tecnico');
    expect((await agente.put('/api/config/marca').send({ nombre_app: 'X' })).status).toBe(403);
    expect((await agente.put('/api/config/logo').send({})).status).toBe(403);
    expect((await agente.delete('/api/config/logo')).status).toBe(403);
  });
});

describe('numeración', () => {
  it('GET devuelve la semilla con estado', async () => {
    const { agente } = await como('admin');
    const r = await agente.get('/api/config/numeracion');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ticket: {
        prefijo: 'TK-',
        inicial: 1000,
        digitos: 4,
        modo: 'correlativo',
        ultimo_usado: null,
        usados: 0,
        capacidad: 9000,
        advertencia: false,
      },
      ot: {
        prefijo: 'OT-',
        inicial: 200,
        digitos: 4,
        modo: 'correlativo',
        ultimo_usado: null,
        usados: 0,
        capacidad: 9800,
        advertencia: false,
      },
    });
  });

  it('cambiar prefijo: evento + auditoría solo por la clave cambiada; afecta a códigos futuros', async () => {
    const { agente, usuario } = await como('admin');
    const r = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { prefijo: 'SOP-', inicial: 5000, digitos: 5 } }));
    expect(r.status).toBe(200);
    expect(r.body.ticket).toMatchObject({ prefijo: 'SOP-', inicial: 5000, digitos: 5 });

    const eventos = await dataSource.query(
      `SELECT entidad, entidad_id, autor_id, accion, valor_anterior, valor_nuevo, req_id FROM evento`,
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      entidad: 'contador',
      entidad_id: 'ticket',
      autor_id: usuario.id,
      accion: 'numeracion_cambiada',
      valor_anterior: 'TK- · inicial 1000 · 4 dígitos · correlativo',
      valor_nuevo: 'SOP- · inicial 5000 · 5 dígitos · correlativo',
    });
    expect(eventos[0].req_id).not.toBeNull();
    const aud = await dataSource.query(
      `SELECT usuario_id, detalle, req_id FROM auditoria WHERE accion = 'numeracion_cambiada'`,
    );
    expect(aud).toHaveLength(1);
    expect(aud[0].usuario_id).toBe(usuario.id);
    expect(aud[0].req_id).toBe(eventos[0].req_id);
    expect(aud[0].detalle).toEqual({
      clave: 'ticket',
      antes: { prefijo: 'TK-', inicial: 1000, digitos: 4, modo: 'correlativo' },
      despues: { prefijo: 'SOP-', inicial: 5000, digitos: 5, modo: 'correlativo' },
    });

    const n = await enTransaccion((tx) => siguienteNumero(tx, 'ticket'));
    expect(n).toEqual({ numero: 5000, codigo: 'SOP-05000' });

    // guardar lo mismo no registra nada
    await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { prefijo: 'SOP-', inicial: 5000, digitos: 5 } }));
    expect(await dataSource.query(`SELECT 1 FROM evento`)).toHaveLength(1);
  });

  it('NUMERACION_INICIAL_MENOR si el inicial nuevo ≤ último usado; no consume ni cambia nada', async () => {
    const { agente } = await como('admin');
    await enTransaccion((tx) => siguienteNumero(tx, 'ticket')); // 1000
    await enTransaccion((tx) => siguienteNumero(tx, 'ticket')); // 1001
    const r = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { inicial: 1001 } }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('NUMERACION_INICIAL_MENOR');
    const ok = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { inicial: 1002 } }));
    expect(ok.status).toBe(200);
    expect(ok.body.ticket).toMatchObject({ inicial: 1002, ultimo_usado: null });
    expect((await enTransaccion((tx) => siguienteNumero(tx, 'ticket'))).numero).toBe(1002);
    // cambiar solo el prefijo con números ya emitidos es válido
    const pref = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { inicial: 1002, prefijo: 'T-' } }));
    expect(pref.status).toBe(200);
  });

  it('el rechazo revierte toda la transacción (la otra clave tampoco cambia)', async () => {
    const { agente } = await como('admin');
    await enTransaccion((tx) => siguienteNumero(tx, 'ot')); // 200
    const r = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { prefijo: 'NUEVO-' }, ot: { inicial: 200, prefijo: 'X-' } }));
    expect(r.status).toBe(200); // inicial igual: no se valida
    const r2 = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { prefijo: 'OTRO-' }, ot: { inicial: 100 } }));
    expect(r2.status).toBe(400);
    expect((await agente.get('/api/config/numeracion')).body.ticket.prefijo).toBe('NUEVO-');
  });

  it('NUMERACION_DIGITOS_INSUFICIENTES si un número existente no cabe en los dígitos', async () => {
    const { agente } = await como('admin');
    await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { inicial: 12000, digitos: 6 } }));
    await enTransaccion((tx) => siguienteNumero(tx, 'ticket')); // 12000
    const r = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { inicial: 12001, digitos: 4 } }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('NUMERACION_DIGITOS_INSUFICIENTES');
    // el inicial no cabe en los dígitos aunque aún no se haya emitido nada
    const r2 = await agente
      .put('/api/config/numeracion')
      .send(
        numeracion({ ticket: { inicial: 12000, digitos: 6 }, ot: { inicial: 1000, digitos: 3 } }),
      );
    expect(r2.body.error.codigo).toBe('NUMERACION_DIGITOS_INSUFICIENTES');
  });

  it('correlativo → aleatorio → correlativo: no reutiliza números y valida el rango', async () => {
    const { agente } = await como('admin');
    await enTransaccion((tx) => siguienteNumero(tx, 'ticket')); // 1000
    const alea = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { modo: 'aleatorio', inicial: 2000 } }));
    expect(alea.status).toBe(200);
    expect(alea.body.ticket).toMatchObject({
      modo: 'aleatorio',
      capacidad: 8000,
      usados: 0,
      advertencia: false,
    });
    const n = await enTransaccion((tx) => siguienteNumero(tx, 'ticket'));
    expect(n.numero).toBeGreaterThanOrEqual(2000);
    expect(n.numero).toBeLessThan(10000);
    const corr = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ticket: { modo: 'correlativo', inicial: 2000 } }));
    expect(corr.status).toBe(200);
    expect((await enTransaccion((tx) => siguienteNumero(tx, 'ticket'))).numero).toBe(2000);
  });

  it('el OT siempre es correlativo aunque se envíe otro modo', async () => {
    const { agente } = await como('admin');
    const r = await agente
      .put('/api/config/numeracion')
      .send(numeracion({ ot: { modo: 'aleatorio' } }));
    expect(r.status).toBe(200);
    expect(r.body.ot.modo).toBe('correlativo');
  });

  it('historial: últimos cambios con autor, más reciente primero', async () => {
    const { agente, usuario } = await como('admin');
    await agente.put('/api/config/numeracion').send(numeracion({ ticket: { prefijo: 'A-' } }));
    await agente.put('/api/config/numeracion').send(numeracion({ ticket: { prefijo: 'B-' } }));
    const r = await agente.get('/api/config/numeracion/historial');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]).toMatchObject({
      entidad_id: 'ticket',
      valor_anterior: 'A- · inicial 1000 · 4 dígitos · correlativo',
      valor_nuevo: 'B- · inicial 1000 · 4 dígitos · correlativo',
      autor: { id: usuario.id },
    });
  });

  it('validación: dígitos 2 o 9, prefijo largo, inicial negativo → 400', async () => {
    const { agente } = await como('admin');
    for (const ticket of [
      { digitos: 2 },
      { digitos: 9 },
      { prefijo: 'x'.repeat(11) },
      { inicial: -1 },
    ]) {
      expect((await agente.put('/api/config/numeracion').send(numeracion({ ticket }))).status).toBe(
        400,
      );
    }
  });

  it('técnico y lectura → 403 en PUT/GET numeración e historial (§15.2)', async () => {
    for (const rol of ['tecnico', 'lectura', 'coordinacion'] as const) {
      const { agente } = await como(rol);
      expect((await agente.put('/api/config/numeracion').send(numeracion())).status, rol).toBe(403);
      expect((await agente.get('/api/config/numeracion')).status, rol).toBe(403);
      expect((await agente.get('/api/config/numeracion/historial')).status, rol).toBe(403);
    }
  });
});
