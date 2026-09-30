import { Writable } from 'node:stream';
import { ROLES, tienePermiso, type Permiso, type Rol } from '@zydesk/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CONTRASENA_PRUEBA, crearUsuario, ingresarComo } from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { crearLogger } from '../../config/logger.js';
import { dataSource } from '../../config/db.js';
import { dataSourceOwner } from '../../database/data-source-owner.js';
import { versionTerminosVigente } from '../../modulos/legal/legal.service.js';
import { metadatosRutas } from '../http/openapi.js';

const app = () => crearApp({ comprobarBd: async () => true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function conOwner(sql: string, valores: unknown[] = []): Promise<void> {
  await dataSourceOwner.initialize();
  try {
    await dataSourceOwner.query(sql, valores);
  } finally {
    await dataSourceOwner.destroy();
  }
}

const ingresar = (a: ReturnType<typeof app>, correo: string, contrasena: string, extra = {}) =>
  request(a)
    .post('/api/auth/ingresar')
    .set('X-Requested-With', 'Zydesk')
    .send({ correo, contrasena, ...extra });

const tokenDe = (cookie: string): string => cookie.split('=')[1]!;

describe('1. permisos por rol en cada endpoint (genérico sobre el registro de ruta())', () => {
  it('rol sin el permiso → 403 SIN_PERMISO (antes de validar); sin sesión → 401', async () => {
    const a = app();
    const sesiones = {} as Record<Rol, Awaited<ReturnType<typeof ingresarComo>>>;
    for (const rol of ROLES) sesiones[rol] = await ingresarComo(a, await crearUsuario({ rol }));

    const protegidas = metadatosRutas().filter((r) => r.permiso !== 'publico');
    expect(protegidas.length).toBeGreaterThan(10);
    let comprobadas = 0;
    for (const r of protegidas) {
      const url = r.path.replace(/:\w+/g, '1');
      const enviar = (cookie?: string) => {
        const p = request(a)[r.metodo](url).set('X-Requested-With', 'Zydesk');
        return (cookie ? p.set('Cookie', cookie) : p).send({});
      };
      const sin = await enviar();
      expect(sin.status, `${r.metodo} ${r.path} sin sesión`).toBe(401);
      expect(sin.body.error.codigo).toBe('NO_AUTENTICADO');

      const aceptados = Array.isArray(r.permiso) ? r.permiso : [r.permiso];
      if (aceptados.includes('sesion')) continue;
      for (const rol of ROLES) {
        const ok = aceptados.some((p) => tienePermiso(rol, p as Permiso));
        if (ok) continue;
        const res = await enviar(sesiones[rol].cookie);
        expect(res.status, `${r.metodo} ${r.path} como ${rol}`).toBe(403);
        expect(res.body.error.codigo).toBe('SIN_PERMISO');
        comprobadas++;
      }
    }
    expect(comprobadas).toBeGreaterThan(10);
  });
});

describe('2. rutas críticas para el rol técnico', () => {
  it('técnico → PUT /api/config/numeracion, POST /api/usuarios, PUT /api/departamentos/:id → 403', async () => {
    const a = app();
    const { agente } = await ingresarComo(a, await crearUsuario({ rol: 'tecnico' }));
    // Las rutas de configuración y departamentos las declaran los bloques 1D/1E: mientras no existan
    // responden 404; cuando existan el test genérico (1) las cubre y aquí se exige 403.
    for (const [metodo, url] of [
      ['put', '/api/config/numeracion'],
      ['post', '/api/usuarios'],
      ['put', '/api/departamentos/1'],
    ] as const) {
      const res = await agente[metodo](url).send({});
      const existe = metadatosRutas().some(
        (r) => r.metodo === metodo && r.path.replace(/:\w+/g, '1') === url,
      );
      expect(res.status, `${metodo} ${url}`).toBe(existe ? 403 : 404);
    }
    expect((await agente.post('/api/usuarios').send({})).body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('4-6, 12, 13. sesiones', () => {
  it('4. sesión revocada → 401', async () => {
    const a = app();
    const u = await crearUsuario();
    const s1 = await ingresarComo(a, u);
    const s2 = await ingresarComo(a, u);
    const lista = await s2.agente.get('/api/yo/sesiones');
    const propia = lista.body.find((s: { actual: boolean }) => !s.actual);
    expect((await s2.agente.delete(`/api/yo/sesiones/${propia.id}`)).status).toBe(204);
    const res = await request(a).get('/api/yo').set('Cookie', s1.cookie);
    expect(res.status).toBe(401);
    expect((await s2.agente.get('/api/yo')).status).toBe(200);
  });

  it('5. usuario desactivado no entra: cookies → 401 y ingreso → CREDENCIALES_INVALIDAS', async () => {
    const a = app();
    const admin = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const u = await crearUsuario();
    const s = await ingresarComo(a, u);
    const r = await admin.agente.post(`/api/usuarios/${u.id}/desactivar`).send();
    expect(r.status).toBe(200);
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(401);
    const res = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('5b. una sesión de un usuario desactivado directamente en BD tampoco vale', async () => {
    const a = app();
    const u = await crearUsuario();
    const s = await ingresarComo(a, u);
    await dataSource.query(`UPDATE usuario SET activo = false WHERE id = $1`, [u.id]);
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(401);
  });

  it('6. cambio de contraseña y de rol cierran las demás sesiones', async () => {
    const a = app();
    const u = await crearUsuario();
    const otra = await ingresarComo(a, u);
    const actual = await ingresarComo(a, u);
    const cambio = await actual.agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: CONTRASENA_PRUEBA, nueva: 'Otra.Contrasena.22' });
    expect(cambio.status).toBe(204);
    expect((await request(a).get('/api/yo').set('Cookie', otra.cookie)).status).toBe(401);
    // la petición actual recibe una cookie nueva y sigue autenticada
    expect((await actual.agente.get('/api/yo')).status).toBe(200);

    const admin = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const objetivo = await crearUsuario({ rol: 'tecnico' });
    const s = await ingresarComo(a, objetivo);
    const r = await admin.agente.patch(`/api/usuarios/${objetivo.id}`).send({ rol: 'lectura' });
    expect(r.status).toBe(200);
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(401);
  });

  it('12. anti fijación: dos ingresos dan tokens distintos y ambos siguen válidos', async () => {
    const a = app();
    const u = await crearUsuario();
    const s1 = await ingresarComo(a, u);
    const s2 = await ingresarComo(a, u);
    expect(tokenDe(s1.cookie)).not.toBe(tokenDe(s2.cookie));
    expect((await request(a).get('/api/yo').set('Cookie', s1.cookie)).status).toBe(200);
    expect((await request(a).get('/api/yo').set('Cookie', s2.cookie)).status).toBe(200);
  });

  it('13. expiración por inactividad y absoluta → 401 y la fila se borra (la inactiva)', async () => {
    const a = app();
    const u = await crearUsuario();
    const s1 = await ingresarComo(a, u);
    const s2 = await ingresarComo(a, u);
    const [{ id: id1 }, { id: id2 }] = await dataSource.query(
      `SELECT id FROM sesion ORDER BY creada_en, id`,
    );
    await conOwner(`UPDATE sesion SET expira_en = now() - interval '1 minute' WHERE id = $1`, [
      id1,
    ]);
    await conOwner(`UPDATE sesion SET expira_max_en = now() - interval '1 minute' WHERE id = $1`, [
      id2,
    ]);
    expect((await request(a).get('/api/yo').set('Cookie', s1.cookie)).status).toBe(401);
    expect((await request(a).get('/api/yo').set('Cookie', s2.cookie)).status).toBe(401);
    const restantes = await dataSource.query(`SELECT id FROM sesion`);
    expect(restantes).toEqual([]);
  });

  it('la expiración se desliza solo si ultimo_uso tiene más de 5 minutos', async () => {
    const a = app();
    const u = await crearUsuario();
    const s = await ingresarComo(a, u);
    const leer = async () =>
      (await dataSource.query(`SELECT ultimo_uso, expira_en FROM sesion`))[0] as {
        ultimo_uso: Date;
        expira_en: Date;
      };
    const antes = await leer();
    await s.agente.get('/api/yo');
    expect((await leer()).ultimo_uso).toEqual(antes.ultimo_uso);
    await conOwner(
      `UPDATE sesion SET ultimo_uso = now() - interval '10 minutes', expira_en = now() + interval '1 hour'`,
    );
    const viejo = await leer();
    await s.agente.get('/api/yo');
    const despues = await leer();
    expect(despues.ultimo_uso.getTime()).toBeGreaterThan(viejo.ultimo_uso.getTime());
    expect(despues.expira_en.getTime()).toBeGreaterThan(viejo.expira_en.getTime());
  });

  it('Bearer autentica cuando no hay cookie', async () => {
    const a = app();
    const s = await ingresarComo(a, await crearUsuario());
    const res = await request(a)
      .get('/api/yo')
      .set('Authorization', `Bearer ${tokenDe(s.cookie)}`);
    expect(res.status).toBe(200);
    expect((await request(a).get('/api/yo').set('Authorization', 'Bearer falso')).status).toBe(401);
  });
});

describe('7-9. límites de intentos', () => {
  it('7. 5 fallos → el 6.º, aun con la contraseña correcta, es 429 con reintentar_en', async () => {
    const a = app();
    const u = await crearUsuario();
    for (let i = 0; i < 5; i++) {
      const r = await ingresar(a, u.correo, 'incorrecta.123');
      expect(r.status).toBe(401);
    }
    const res = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    expect(res.status).toBe(429);
    expect(res.body.error.codigo).toBe('INGRESO_BLOQUEADO');
    expect(res.body.error.detalles.reintentar_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const [r] = await dataSource.query(
      `SELECT count(*) FILTER (WHERE accion = 'ingreso_fallido')::int AS fallidos,
              count(*) FILTER (WHERE accion = 'cuenta_bloqueada')::int AS bloqueos FROM auditoria`,
    );
    expect(r).toEqual({ fallidos: 5, bloqueos: 1 });
  });

  it('7b. segundo bloqueo de 30 minutos con un cuenta_bloqueada previo', async () => {
    const a = app();
    const u = await crearUsuario();
    await conOwner(
      `INSERT INTO auditoria (accion, detalle, creado_en) VALUES
         ('cuenta_bloqueada', jsonb_build_object('correo', $1::text, 'bloqueo_n', 1, 'hasta', (now() - interval '1 minute')::text), now() - interval '20 minutes'),
         ('ingreso_fallido', jsonb_build_object('correo', $1::text), now() - interval '19 minutes'),
         ('ingreso_fallido', jsonb_build_object('correo', $1::text), now() - interval '18 minutes'),
         ('ingreso_fallido', jsonb_build_object('correo', $1::text), now() - interval '17 minutes'),
         ('ingreso_fallido', jsonb_build_object('correo', $1::text), now() - interval '16 minutes')`,
      [u.correo],
    );
    expect((await ingresar(a, u.correo, 'incorrecta.123')).status).toBe(401);
    const res = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    expect(res.status).toBe(429);
    const minutos =
      (new Date(res.body.error.detalles.reintentar_en).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThanOrEqual(30);
  });

  it('8. 20 intentos en 15 min desde la misma IP → 429 para cualquier correo', async () => {
    const a = app();
    const u = await crearUsuario();
    await ingresar(a, 'nadie@zydesk.test', 'x'); // deja una fila con la IP real de Supertest
    const [{ ip }] = await dataSource.query(`SELECT host(ip) AS ip FROM auditoria LIMIT 1`);
    await conOwner(
      `INSERT INTO auditoria (accion, ip, detalle, creado_en)
       SELECT 'ingreso_fallido', $1::inet, jsonb_build_object('correo', 'r' || g || '@zydesk.test'), now() - interval '5 minutes'
         FROM generate_series(1, 20) g`,
      [ip],
    );
    const res = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    expect(res.status).toBe(429);
    expect(res.body.error.codigo).toBe('INGRESO_BLOQUEADO');
  });

  it('9. sin revelar existencia: correo inexistente y contraseña errónea responden igual', async () => {
    const a = app();
    const u = await crearUsuario();
    const a1 = await ingresar(a, 'no-existe@zydesk.test', 'Cualquiera.123');
    const a2 = await ingresar(a, u.correo, 'Cualquiera.123');
    expect(a1.status).toBe(401);
    expect(a2.status).toBe(a1.status);
    expect(a2.body).toEqual(a1.body);
    expect(a1.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(a1.body.error.mensaje).toBe('Correo o contraseña incorrectos');
    // el usuario inactivo tampoco se distingue
    const inactivo = await crearUsuario({ activo: false });
    const a3 = await ingresar(a, inactivo.correo, CONTRASENA_PRUEBA);
    expect(a3.status).toBe(401);
    expect(a3.body).toEqual(a1.body);
  });

  it('9b. el 429 es idéntico exista o no la cuenta (mismo código y mensaje)', async () => {
    const a = app();
    const u = await crearUsuario();
    for (let i = 0; i < 5; i++) {
      await ingresar(a, u.correo, 'mala.contrasena.1');
      await ingresar(a, 'fantasma@zydesk.test', 'mala.contrasena.1');
    }
    const real = await ingresar(a, u.correo, 'mala.contrasena.1');
    const falso = await ingresar(a, 'fantasma@zydesk.test', 'mala.contrasena.1');
    expect(real.status).toBe(429);
    expect(falso.status).toBe(429);
    expect(falso.body.error.codigo).toBe(real.body.error.codigo);
    expect(falso.body.error.mensaje).toBe(real.body.error.mensaje);
  });
});

describe('10-11. CSRF y cookie', () => {
  it('10. POST con cookie y sin X-Requested-With → 403 CSRF; con Bearer y sin cabecera pasa', async () => {
    const a = app();
    const s = await ingresarComo(a, await crearUsuario());
    const sin = await request(a).post('/api/auth/salir').set('Cookie', s.cookie);
    expect(sin.status).toBe(403);
    expect(sin.body.error.codigo).toBe('CSRF');
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(200);
    const bearer = await request(a)
      .post('/api/auth/salir')
      .set('Authorization', `Bearer ${tokenDe(s.cookie)}`);
    expect(bearer.status).toBe(204);
  });

  it('10b. el ingreso sin X-Requested-With también es 403 CSRF', async () => {
    const u = await crearUsuario();
    const res = await request(app())
      .post('/api/auth/ingresar')
      .send({ correo: u.correo, contrasena: CONTRASENA_PRUEBA });
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CSRF');
  });

  it('11. atributos de la cookie: HttpOnly, SameSite=Lax, Path=/, sin Domain; Max-Age solo con mantener', async () => {
    const a = app();
    const u = await crearUsuario();
    const normal = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    const c1 = (normal.headers['set-cookie'] as unknown as string[])[0]!;
    expect(c1).toMatch(/^sesion=/);
    expect(c1).toContain('HttpOnly');
    expect(c1).toContain('SameSite=Lax');
    expect(c1).toContain('Path=/');
    expect(c1).not.toContain('Domain');
    expect(c1).not.toContain('Max-Age');
    expect(c1).not.toContain('Secure');

    const mantener = await ingresar(a, u.correo, CONTRASENA_PRUEBA, { mantener: true });
    const c2 = (mantener.headers['set-cookie'] as unknown as string[])[0]!;
    const maxAge = Number(/Max-Age=(\d+)/.exec(c2)?.[1]);
    expect(maxAge).toBeGreaterThan(89 * 86400);
    expect(maxAge).toBeLessThanOrEqual(90 * 86400);
  });

  it('11b. en producción el nombre es __Host-sesion y trae Secure', async () => {
    const a = crearApp({ comprobarBd: async () => true, entorno: 'production' });
    const u = await crearUsuario();
    const res = await ingresar(a, u.correo, CONTRASENA_PRUEBA);
    const c = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(c).toMatch(/^__Host-sesion=/);
    expect(c).toContain('Secure');
    expect(c).toContain('Path=/');
    expect(c).not.toContain('Domain');
    // y la autentica con ese nombre
    const token = c.split(';')[0]!;
    expect((await request(a).get('/api/yo').set('Cookie', token)).status).toBe(200);
  });

  it('cerrar sesión borra la cookie y la sesión', async () => {
    const a = app();
    const s = await ingresarComo(a, await crearUsuario());
    const res = await s.agente.post('/api/auth/salir');
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^sesion=;/);
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(401);
  });
});

describe('14. redacción en logs', () => {
  it('no deja la contraseña en ninguna línea y redacta contrasena_hash y token_hash', async () => {
    const lineas: string[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        lineas.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    const a = crearApp({ comprobarBd: async () => true, logger });
    const u = await crearUsuario();
    await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .send({ correo: u.correo, contrasena: 'secreta' });
    await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .send({ correo: u.correo, contrasena: CONTRASENA_PRUEBA });
    expect(lineas.length).toBeGreaterThan(0);
    expect(lineas.some((l) => l.includes('secreta'))).toBe(false);
    expect(lineas.some((l) => l.includes(CONTRASENA_PRUEBA))).toBe(false);

    lineas.length = 0;
    logger.error({ contrasena_hash: 'hash-secreto', token_hash: 'token-secreto' }, 'prueba');
    const linea = JSON.parse(lineas[0]!);
    expect(linea.contrasena_hash).toBe('[Redactado]');
    expect(linea.token_hash).toBe('[Redactado]');
    expect(lineas[0]).not.toContain('secreto');
  });
});

describe('16-17. contraseña y términos pendientes; política', () => {
  it('16. restablecida → 403 CONTRASENA_PENDIENTE (GET /api/yo 200); luego términos viejos → TERMINOS_PENDIENTES; al aceptar → 200', async () => {
    const a = app();
    const admin = await ingresarComo(a, await crearUsuario({ rol: 'admin' }));
    const u = await crearUsuario({ terminos_version: 'version-vieja' });
    const s = await ingresarComo(a, u);
    const reset = await admin.agente.post(`/api/usuarios/${u.id}/restablecer-contrasena`).send();
    expect(reset.status).toBe(200);
    const temporal = reset.body.contrasena_temporal as string;

    // las sesiones previas se cerraron: ingresar con la temporal
    expect((await request(a).get('/api/yo').set('Cookie', s.cookie)).status).toBe(401);
    const nueva = await ingresarComo(a, u, temporal);
    const yo = await nueva.agente.get('/api/yo');
    expect(yo.status).toBe(200);
    expect(yo.body.debe_cambiar_contrasena).toBe(true);
    const bloqueada = await nueva.agente.get('/api/usuarios');
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body.error.codigo).toBe('CONTRASENA_PENDIENTE');
    // la contraseña se comprueba antes que los términos
    expect(yo.body.debe_aceptar_terminos).toBe(true);

    const cambio = await nueva.agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: temporal, nueva: 'Contrasena.Nueva.77' });
    expect(cambio.status).toBe(204);
    const pendiente = await nueva.agente.get('/api/usuarios');
    expect(pendiente.status).toBe(403);
    expect(pendiente.body.error.codigo).toBe('TERMINOS_PENDIENTES');
    expect((await nueva.agente.get('/api/yo/sesiones')).status).toBe(200);
    expect((await nueva.agente.get('/api/legal/terminos')).status).toBe(200);

    const mala = await nueva.agente.post('/api/yo/aceptar-terminos').send({ version: 'otra' });
    expect(mala.status).toBe(409);
    expect(mala.body.error.codigo).toBe('CONFLICTO');
    expect(mala.body.error.detalles.version_vigente).toBe(versionTerminosVigente());
    const ok = await nueva.agente
      .post('/api/yo/aceptar-terminos')
      .send({ version: versionTerminosVigente() });
    expect(ok.status).toBe(200);
    expect(ok.body.debe_aceptar_terminos).toBe(false);
    expect((await nueva.agente.get('/api/usuarios')).status).toBe(200);
  });

  it('17. política: correo, 9 caracteres y password123 → 400 CONTRASENA_DEBIL con el motivo', async () => {
    const a = app();
    const u = await crearUsuario();
    const { agente } = await ingresarComo(a, u);
    const casos: [string, string][] = [
      [u.correo, 'igual_correo'],
      ['Abcdef123', 'corta'],
      ['password123', 'comun'],
    ];
    for (const [nueva, motivo] of casos) {
      const res = await agente
        .post('/api/yo/cambiar-contrasena')
        .send({ actual: CONTRASENA_PRUEBA, nueva });
      expect(res.status, nueva).toBe(400);
      expect(res.body.error.codigo).toBe('CONTRASENA_DEBIL');
      expect(res.body.error.detalles.motivo).toBe(motivo);
    }
    const incorrecta = await agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: 'no-es-la-actual', nueva: 'Contrasena.Nueva.77' });
    expect(incorrecta.status).toBe(400);
    expect(incorrecta.body.error.codigo).toBe('CONTRASENA_ACTUAL_INCORRECTA');
  });
});

describe('19. X-Request-Id y auditoría', () => {
  it('X-Request-Id está en 401, 403 y 429, y las filas de auditoría llevan ese req_id', async () => {
    const a = app();
    const u = await crearUsuario({ rol: 'tecnico' });
    const id = (n: number) => `123e4567-e89b-12d3-a456-42661417400${n}`;

    const r401 = await request(a).get('/api/yo').set('X-Request-Id', id(1));
    expect(r401.status).toBe(401);
    expect(r401.headers['x-request-id']).toMatch(UUID);
    expect(r401.headers['x-request-id']).toBe(id(1));

    const s = await ingresarComo(a, u);
    const r403 = await s.agente.post('/api/usuarios').set('X-Request-Id', id(2)).send({});
    expect(r403.status).toBe(403);
    expect(r403.headers['x-request-id']).toBe(id(2));

    for (let i = 0; i < 5; i++) await ingresar(a, 'otro@zydesk.test', 'mala.contrasena.1');
    const r429 = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .set('X-Request-Id', id(3))
      .send({ correo: 'otro@zydesk.test', contrasena: 'mala.contrasena.1' });
    expect(r429.status).toBe(429);
    expect(r429.headers['x-request-id']).toBe(id(3));

    const fallo = await request(a)
      .post('/api/auth/ingresar')
      .set('X-Requested-With', 'Zydesk')
      .set('X-Request-Id', id(4))
      .send({ correo: u.correo, contrasena: 'mala.contrasena.1' });
    expect(fallo.status).toBe(401);
    const filas = await dataSource.query(
      `SELECT accion, host(ip) AS ip FROM auditoria WHERE req_id = $1`,
      [id(4)],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].accion).toBe('ingreso_fallido');
    expect(filas[0].ip).not.toBeNull();
  });
});
