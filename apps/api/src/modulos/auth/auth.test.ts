import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CONTRASENA_PRUEBA,
  crearDepartamento,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { versionTerminosVigente } from '../legal/legal.service.js';

const app = () => crearApp({ comprobarBd: async () => true });

describe('POST /api/auth/ingresar y GET /api/yo', () => {
  it('devuelve YoSalida con permisos, iniciales y marca; registra ingreso_ok con la IP', async () => {
    const a = app();
    const depto = await crearDepartamento({ nombre: 'Soporte TI' });
    const u = await crearUsuario({
      nombre: 'Sebastián Díaz',
      rol: 'tecnico',
      departamento_id: depto.id,
    });
    const res = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .set('User-Agent', 'Vitest/1.0')
      .send({ correo: u.correo.toUpperCase(), contrasena: CONTRASENA_PRUEBA });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: u.id,
      nombre: 'Sebastián Díaz',
      correo: u.correo,
      rol: 'tecnico',
      departamento: { id: depto.id, nombre: 'Soporte TI' },
      iniciales: 'SD',
      permisos: ['tickets.editar'],
      debe_cambiar_contrasena: false,
      debe_aceptar_terminos: false,
      terminos_version_vigente: versionTerminosVigente(),
      nombre_app: 'Zydesk',
      logo_url: null,
    });
    const [ev] = await dataSource.query(
      `SELECT usuario_id, host(ip) AS ip, detalle FROM auditoria WHERE accion = 'ingreso_ok'`,
    );
    expect(ev.usuario_id).toBe(u.id);
    expect(ev.ip).toBeTruthy();
    expect(ev.detalle).toMatchObject({
      correo: u.correo,
      user_agent: 'Vitest/1.0',
      mantener: false,
    });
    const [{ ultimo_ingreso }] = await dataSource.query(`SELECT ultimo_ingreso FROM usuario`);
    expect(ultimo_ingreso).not.toBeNull();
  });

  it('valida el cuerpo (400) y GET /api/yo sin sesión es 401', async () => {
    const a = app();
    const res = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .send({ correo: 'no-es-correo', contrasena: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    const yo = await request(a).get('/api/yo');
    expect(yo.status).toBe(401);
    expect(yo.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('yo refleja la marca configurada y el flag de términos pendientes', async () => {
    const a = app();
    const u = await crearUsuario({ terminos_version: null });
    await dataSource.query(
      `UPDATE configuracion SET valor = '"Trazo"'::jsonb WHERE clave = 'nombre_app'`,
    );
    await dataSource.query(
      `UPDATE configuracion SET valor = '{"tipo_mime":"image/png","base64":"AA=="}'::jsonb WHERE clave = 'logo'`,
    );
    const { agente } = await ingresarComo(a, u);
    const yo = await agente.get('/api/yo');
    expect(yo.body).toMatchObject({
      nombre_app: 'Trazo',
      logo_url: '/api/config/logo',
      debe_aceptar_terminos: true,
    });
  });
});

describe('sesiones activas', () => {
  it('lista la actual primero y permite cerrar otras', async () => {
    const a = app();
    const u = await crearUsuario();
    const otra = await ingresarComo(a, u);
    const actual = await ingresarComo(a, u);
    const lista = await actual.agente.get('/api/yo/sesiones');
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(2);
    expect(lista.body[0].actual).toBe(true);
    expect(lista.body[1].actual).toBe(false);
    expect(lista.body[0]).toMatchObject({ origen: 'web', mantener: false });
    expect(lista.body[0].ip).toBeTruthy();

    const cierre = await actual.agente.delete('/api/yo/sesiones');
    expect(cierre.status).toBe(200);
    expect(cierre.body).toEqual({ cerradas: 1 });
    expect((await request(a).get('/api/yo').set('Cookie', otra.cookie)).status).toBe(401);
    expect((await actual.agente.get('/api/yo')).status).toBe(200);
    const motivos = await dataSource.query(
      `SELECT detalle->>'motivo' AS motivo FROM auditoria WHERE accion = 'sesion_cerrada'`,
    );
    expect(motivos).toEqual([{ motivo: 'usuario' }]);
  });

  it('no permite cerrar la sesión de otra persona (404)', async () => {
    const a = app();
    const s1 = await ingresarComo(a, await crearUsuario());
    const s2 = await ingresarComo(a, await crearUsuario());
    const ajena = (await s2.agente.get('/api/yo/sesiones')).body[0].id;
    const res = await s1.agente.delete(`/api/yo/sesiones/${ajena}`);
    expect(res.status).toBe(404);
    expect((await s2.agente.get('/api/yo')).status).toBe(200);
    const malo = await s1.agente.delete('/api/yo/sesiones/no-es-uuid');
    expect(malo.status).toBe(400);
  });
});

describe('cambiar contraseña', () => {
  it('audita contrasena_cambiada y un sesion_cerrada por sesión borrada, y limpia el flag', async () => {
    const a = app();
    const u = await crearUsuario({ debe_cambiar_contrasena: true });
    await ingresarComo(a, u);
    const { agente } = await ingresarComo(a, u);
    const r = await agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: CONTRASENA_PRUEBA, nueva: 'Contrasena.Nueva.77' });
    expect(r.status).toBe(204);
    const yo = await agente.get('/api/yo');
    expect(yo.body.debe_cambiar_contrasena).toBe(false);
    const acciones = await dataSource.query(
      `SELECT accion, detalle->>'motivo' AS motivo FROM auditoria WHERE accion IN ('contrasena_cambiada','sesion_cerrada') ORDER BY id`,
    );
    expect(
      acciones.filter((x: { accion: string }) => x.accion === 'contrasena_cambiada'),
    ).toHaveLength(1);
    expect(
      acciones.filter((x: { motivo: string }) => x.motivo === 'cambio_contrasena'),
    ).toHaveLength(2);
    // la nueva contraseña sirve y la vieja no
    expect((await ingresarComo(a, u, 'Contrasena.Nueva.77')).cookie).toBeTruthy();
    const vieja = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .send({ correo: u.correo, contrasena: CONTRASENA_PRUEBA });
    expect(vieja.status).toBe(401);
  });

  it('nueva igual a la actual → 400 VALIDACION', async () => {
    const { agente } = await ingresarComo(app(), await crearUsuario());
    const res = await agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: CONTRASENA_PRUEBA, nueva: CONTRASENA_PRUEBA });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });
});

describe('aceptar términos', () => {
  it('guarda versión y fecha y audita terminos_aceptados', async () => {
    const a = app();
    const u = await crearUsuario({ terminos_version: 'vieja' });
    const { agente } = await ingresarComo(a, u);
    const res = await agente
      .post('/api/yo/aceptar-terminos')
      .send({ version: versionTerminosVigente() });
    expect(res.status).toBe(200);
    const [fila] = await dataSource.query(
      `SELECT terminos_version, terminos_aceptados_en FROM usuario`,
    );
    expect(fila.terminos_version).toBe(versionTerminosVigente());
    expect(fila.terminos_aceptados_en).not.toBeNull();
    const [ev] = await dataSource.query(
      `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'terminos_aceptados'`,
    );
    expect(ev).toEqual({ usuario_id: u.id, detalle: { version: versionTerminosVigente() } });
  });
});
