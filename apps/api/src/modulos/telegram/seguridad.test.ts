import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  comoBot,
  crearCodigoVinculo,
  crearOt,
  crearRegistroHoras,
  crearTicket,
  crearUsuario,
  crearVinculoTelegram,
  ingresarComo,
  ingresarComoBot,
} from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { esperarDespachos } from '../../avisos/despachador.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { crearLogger, logger as loggerGlobal } from '../../config/logger.js';
import { publicar } from '../../core/eventos/dominio.js';

// Pruebas 4–11, 19 y 21 de la spec fase 6 §14 (bloque 6C).

const app = () => crearApp({ comprobarBd: async () => true });
const conToken = (): void => fijarEnv('TELEGRAM_BOT_TOKEN', 'token-de-prueba');
const bearer = (token: string) => request.agent(app()).set('Authorization', `Bearer ${token}`);
const auditorias = (accion: string): Promise<{ detalle: Record<string, unknown> }[]> =>
  dataSource.query(`SELECT usuario_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id`, [
    accion,
  ]);

describe('prueba 4: el bot solo hace lo que su usuario puede en la web', () => {
  it('lectura: lee, pero no escribe ni aprueba', async () => {
    const u = await crearUsuario({ rol: 'lectura' });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'borrador' });
    const { agente } = await ingresarComoBot(app(), u);
    expect((await agente.get('/api/tickets')).status).toBe(200);
    expect(
      (await agente.post(`/api/tickets/${t.id}/mensajes`).send({ tipo: 'seguimiento', texto: 'x' }))
        .status,
    ).toBe(403);
    expect((await agente.post('/api/tickets').send({ asunto: 'x' })).status).toBe(403);
    expect((await agente.post(`/api/ots/${ot.id}/aprobar`).send({})).status).toBe(403);
  });

  it('tecnico: seguimiento y ticket con su autoría, pero no aprueba; no ve horas ajenas; tarifas sí (igual que la web)', async () => {
    const u = await crearUsuario({ rol: 'tecnico' });
    const otro = await crearUsuario();
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'borrador' });
    await crearRegistroHoras(otro.id, { ticket_id: t.id });
    const { agente } = await ingresarComoBot(app(), u);
    const seg = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'Desde el bot' });
    expect(seg.status).toBe(201);
    expect(seg.body.autor.id).toBe(u.id);
    const nuevo = await agente.post('/api/tickets').send({
      asunto: 'Creado desde el bot',
      descripcion: null,
      cliente_id: null,
      solicitante_nombre: null,
      solicitante_correo: null,
      origen: 'externo',
      prioridad: 'media',
      categoria_id: null,
      inicio_planificado: null,
      fecha_limite: null,
      horas_estimadas: null,
    });
    expect(nuevo.status).toBe(201);
    const [ev] = await dataSource.query(
      `SELECT autor_id FROM evento WHERE entidad = 'ticket' AND entidad_id = $1 AND accion = 'creado'`,
      [String(nuevo.body.id)],
    );
    expect(ev.autor_id).toBe(u.id);
    expect((await agente.post(`/api/ots/${ot.id}/aprobar`).send({})).status).toBe(403);
    expect((await agente.get(`/api/horas?usuario_id=${otro.id}`)).status).toBe(403);
    expect((await agente.get('/api/config/tarifas')).status).toBe(200);
  });

  it('coordinacion: aprueba una OT interna y el evento lleva su autor_id', async () => {
    const u = await crearUsuario({ rol: 'coordinacion' });
    const t = await crearTicket();
    const ot = await crearOt(t.id, { tipo: 'interna', etapa: 'borrador', aprobador_id: u.id });
    const { agente } = await ingresarComoBot(app(), u);
    const r = await agente.post(`/api/ots/${ot.id}/aprobar`).send({});
    expect(r.status).toBe(200);
    const [ev] = await dataSource.query(
      `SELECT autor_id FROM evento WHERE entidad = 'ot' AND entidad_id = $1 AND accion = 'cambio' AND campo = 'etapa'`,
      [String(ot.id)],
    );
    expect(ev.autor_id).toBe(u.id);
  });

  it('un usuario desactivado con sesión bot recibe 401 en todo', async () => {
    const u = await crearUsuario({ rol: 'admin' });
    const { agente } = await ingresarComoBot(app(), u);
    expect((await agente.get('/api/tickets')).status).toBe(200);
    await dataSource.query(`UPDATE usuario SET activo = false WHERE id = $1`, [u.id]);
    expect((await agente.get('/api/tickets')).status).toBe(401);
    expect((await agente.get('/api/yo')).status).toBe(401);
    expect((await agente.get('/api/avisos')).status).toBe(401);
  });
});

describe('prueba 5: Bearer sin CSRF, cookie con CSRF', () => {
  it('POST con Bearer y sin X-Requested-With → 201', async () => {
    const u = await crearUsuario();
    const t = await crearTicket();
    const { agente } = await ingresarComoBot(app(), u);
    const r = await agente
      .post(`/api/tickets/${t.id}/mensajes`)
      .send({ tipo: 'seguimiento', texto: 'x' });
    expect(r.status).toBe(201);
  });

  it('cookie y Bearer a la vez, sin la cabecera → 403 CSRF', async () => {
    const u = await crearUsuario();
    const t = await crearTicket();
    const web = await ingresarComo(app(), u);
    const bot = await ingresarComoBot(app(), u);
    const r = await request(app())
      .post(`/api/tickets/${t.id}/mensajes`)
      .set('Cookie', web.cookie)
      .set('Authorization', `Bearer ${bot.token}`)
      .send({ tipo: 'seguimiento', texto: 'x' });
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('CSRF');
  });
});

describe('prueba 6: código de un solo uso', () => {
  it('formato, hash, reuso, vencido igual que inexistente, invalidación del anterior, límite, Bearer y sin token', async () => {
    conToken();
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    const bot = comoBot(app());

    const primero = (await agente.post('/api/yo/telegram/codigo')).body.codigo as string;
    // el segundo código invalida el primero
    const segundo = (await agente.post('/api/yo/telegram/codigo')).body.codigo as string;
    const r1 = await bot.post('/api/bot/vincular').send({ codigo: primero, chat_id: 10 });
    expect(r1.status).toBe(400);
    expect(r1.body.error.codigo).toBe('CODIGO_INVALIDO');
    // usarlo → 201; reusarlo → 400
    expect(
      (await bot.post('/api/bot/vincular').send({ codigo: segundo, chat_id: 10 })).status,
    ).toBe(201);
    const reuso = await bot.post('/api/bot/vincular').send({ codigo: segundo, chat_id: 11 });
    expect(reuso.status).toBe(400);
    expect(reuso.body.error.codigo).toBe('CODIGO_INVALIDO');
    // vencido y usado/inexistente: mismo cuerpo
    const vencido = await crearCodigoVinculo(u.id, { expirado: true });
    const rVencido = await bot.post('/api/bot/vincular').send({ codigo: vencido, chat_id: 12 });
    const rInexistente = await bot
      .post('/api/bot/vincular')
      .send({ codigo: 'ZZZZZZZZ', chat_id: 13 });
    expect(rVencido.status).toBe(400);
    expect(rVencido.body).toEqual(rInexistente.body);
  });

  it('6 códigos seguidos → 409 CONFLICTO con espera_s', async () => {
    conToken();
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    for (let i = 0; i < 5; i++) {
      expect((await agente.post('/api/yo/telegram/codigo')).status).toBe(201);
    }
    const r = await agente.post('/api/yo/telegram/codigo');
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('CONFLICTO');
    expect(r.body.error.detalles.espera_s).toBeGreaterThan(0);
  });

  it('pedir código con sesión Bearer → 403; sin TELEGRAM_BOT_TOKEN → 503', async () => {
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    const sinToken = await agente.post('/api/yo/telegram/codigo');
    expect(sinToken.status).toBe(503);
    expect(sinToken.body.error.codigo).toBe('TELEGRAM_NO_DISPONIBLE');
    conToken();
    const bot = await ingresarComoBot(app(), u);
    const r = await bot.agente.post('/api/yo/telegram/codigo');
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('prueba 7: clave del bot', () => {
  const cuerpo = { codigo: 'ZZZZZZZZ', chat_id: 1 };

  it('sin clave → 401; incorrecta de igual longitud → 401; correcta → 201', async () => {
    const u = await crearUsuario();
    const sin = await request(app()).post('/api/bot/vincular').send(cuerpo);
    expect(sin.status).toBe(401);
    expect(sin.body.error.codigo).toBe('CLAVE_BOT_INVALIDA');
    const igualLargo = 'x'.repeat(env.BOT_API_KEY!.length);
    const mala = await request(app())
      .post('/api/bot/vincular')
      .set('X-Bot-Key', igualLargo)
      .send(cuerpo);
    expect(mala.status).toBe(401);
    const codigo = await crearCodigoVinculo(u.id);
    expect(
      (await comoBot(app()).post('/api/bot/vincular').send({ codigo, chat_id: 2 })).status,
    ).toBe(201);
  });

  it('la clave correcta en Authorization: Bearer no vale; en otra ruta no autentica a nadie', async () => {
    const r = await request(app())
      .post('/api/bot/vincular')
      .set('Authorization', `Bearer ${env.BOT_API_KEY}`)
      .send(cuerpo);
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('CLAVE_BOT_INVALIDA');
    const otra = await request(app()).get('/api/tickets').set('X-Bot-Key', env.BOT_API_KEY!);
    expect(otra.status).toBe(401);
    expect(otra.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('21 fallos de clave desde la misma IP → 429 VINCULACION_BLOQUEADA, aun con la clave correcta', async () => {
    const a = app();
    for (let i = 0; i < 20; i++) {
      const r = await request(a)
        .post('/api/bot/vincular')
        .set('X-Bot-Key', 'incorrecta')
        .send(cuerpo);
      expect(r.status).toBe(401);
    }
    const bloqueado = await request(a)
      .post('/api/bot/vincular')
      .set('X-Bot-Key', 'incorrecta')
      .send(cuerpo);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.codigo).toBe('VINCULACION_BLOQUEADA');
    // prueba 21: X-Request-Id en 401 y 429
    expect(bloqueado.headers['x-request-id']).toBeTruthy();
    const correcta = await comoBot(a).post('/api/bot/vincular').send(cuerpo);
    expect(correcta.status).toBe(429);
    expect(await auditorias('telegram_vinculacion_fallida')).toHaveLength(20);
  });
});

describe('límite por IP solo cuenta fallos de clave', () => {
  it('20 códigos inválidos desde 4 chats no bloquean la vinculación de un 5.º chat', async () => {
    const u = await crearUsuario();
    const bot = comoBot(app());
    for (let chat = 1; chat <= 4; chat++) {
      for (let i = 0; i < 5; i++) {
        const r = await bot.post('/api/bot/vincular').send({ codigo: 'ZZZZZZZZ', chat_id: chat });
        expect(r.status).toBe(400);
      }
    }
    expect(await auditorias('telegram_vinculacion_fallida')).toHaveLength(20);
    const codigo = await crearCodigoVinculo(u.id);
    const r = await bot.post('/api/bot/vincular').send({ codigo, chat_id: 5 });
    expect(r.status).toBe(201);
  });
});

describe('hash del código de vinculación', () => {
  it('no es el SHA-256 plano del código y la vinculación sigue funcionando', async () => {
    conToken();
    const u = await crearUsuario();
    const { agente } = await ingresarComo(app(), u);
    const codigo = (await agente.post('/api/yo/telegram/codigo')).body.codigo as string;
    const [fila] = await dataSource.query(`SELECT codigo_hash FROM codigo_vinculo`);
    expect(fila.codigo_hash).not.toBe(createHash('sha256').update(codigo).digest('hex'));
    const r = await comoBot(app()).post('/api/bot/vincular').send({ codigo, chat_id: 31 });
    expect(r.status).toBe(201);
  });
});

describe('prueba 8: fuerza bruta de códigos', () => {
  it('5 fallos del mismo chat_id → el sexto, aun con código correcto, es 429', async () => {
    const u = await crearUsuario();
    const bot = comoBot(app());
    for (let i = 0; i < 5; i++) {
      const r = await bot.post('/api/bot/vincular').send({ codigo: 'ZZZZZZZZ', chat_id: 77 });
      expect(r.status).toBe(400);
    }
    const codigo = await crearCodigoVinculo(u.id);
    const r = await bot.post('/api/bot/vincular').send({ codigo, chat_id: 77 });
    expect(r.status).toBe(429);
    expect(r.body.error.codigo).toBe('VINCULACION_BLOQUEADA');
    expect(await auditorias('telegram_vinculacion_fallida')).toHaveLength(5);
    // otro chat no está bloqueado
    expect((await bot.post('/api/bot/vincular').send({ codigo, chat_id: 78 })).status).toBe(201);
  });
});

describe('prueba 9: un chat, una persona', () => {
  it('chat ya vinculado a otra cuenta → 409 y la primera sigue vinculada; la misma cuenta con otro chat reemplaza', async () => {
    const u1 = await crearUsuario();
    const u2 = await crearUsuario();
    const bot = comoBot(app());
    const c1 = await crearCodigoVinculo(u1.id);
    const r1 = await bot.post('/api/bot/vincular').send({ codigo: c1, chat_id: 1 });
    expect(r1.status).toBe(201);
    const c2 = await crearCodigoVinculo(u2.id);
    const r2 = await bot.post('/api/bot/vincular').send({ codigo: c2, chat_id: 1 });
    expect(r2.status).toBe(409);
    expect(r2.body.error.codigo).toBe('TELEGRAM_CHAT_EN_USO');
    expect((await bearer(r1.body.token).get('/api/yo')).status).toBe(200);
    // el código de u2 no se consumió: sirve con otro chat
    expect((await bot.post('/api/bot/vincular').send({ codigo: c2, chat_id: 3 })).status).toBe(201);

    const c1b = await crearCodigoVinculo(u1.id);
    const r3 = await bot.post('/api/bot/vincular').send({ codigo: c1b, chat_id: 2 });
    expect(r3.status).toBe(201);
    expect((await bearer(r1.body.token).get('/api/yo')).status).toBe(401);
    const [v] = await dataSource.query(
      `SELECT chat_id FROM vinculo_telegram WHERE usuario_id = $1`,
      [u1.id],
    );
    expect(v.chat_id).toBe('2');
  });
});

describe('prueba 10: revocación', () => {
  it('DELETE /api/yo/telegram: token 401, vínculo vacío y auditoría', async () => {
    const u = await crearUsuario();
    const web = await ingresarComo(app(), u);
    const bot = await ingresarComoBot(app(), u);
    expect((await web.agente.delete('/api/yo/telegram')).status).toBe(204);
    expect((await bot.agente.get('/api/yo')).status).toBe(401);
    expect(await dataSource.query(`SELECT 1 FROM vinculo_telegram`)).toHaveLength(0);
    expect(await auditorias('telegram_desvinculado')).toHaveLength(1);
    const cerradas = await auditorias('sesion_cerrada');
    expect(cerradas.map((c) => c.detalle['motivo'])).toEqual(['telegram_desvinculado']);
  });

  it('cerrar la sesión bot desde Sesiones activas revoca comandos, no el vínculo ni los avisos', async () => {
    conToken();
    const u = await crearUsuario();
    const web = await ingresarComo(app(), u);
    const bot = await ingresarComoBot(app(), u);
    const sesiones = await web.agente.get('/api/yo/sesiones');
    const sesionBot = sesiones.body.find((s: { origen: string }) => s.origen === 'bot');
    expect(sesionBot).toBeTruthy();
    expect((await web.agente.delete(`/api/yo/sesiones/${sesionBot.id}`)).status).toBe(204);
    expect((await bot.agente.get('/api/yo')).status).toBe(401);
    const estado = await web.agente.get('/api/yo/telegram');
    expect(estado.body).toMatchObject({ vinculado: true, sesion_bot_activa: false });
    // un aviso nuevo sí encola Telegram
    const t = await crearTicket();
    publicar('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
    await esperarDespachos();
    const envios = await dataSource.query(
      `SELECT estado FROM aviso_envio WHERE canal = 'telegram'`,
    );
    expect(envios).toEqual([{ estado: 'pendiente' }]);
  });

  it('cambiar la contraseña cierra la sesión bot', async () => {
    const u = await crearUsuario();
    const web = await ingresarComo(app(), u);
    const bot = await ingresarComoBot(app(), u);
    const r = await web.agente
      .post('/api/yo/cambiar-contrasena')
      .send({ actual: 'Contrasena.Prueba.1', nueva: 'Contrasena.Nueva.77' });
    expect(r.status).toBe(204);
    expect((await bot.agente.get('/api/yo')).status).toBe(401);
  });

  it('desactivar a la persona: 401 y el despachador deja de crearle avisos', async () => {
    conToken();
    const admin = await crearUsuario({ rol: 'admin' });
    const u = await crearUsuario();
    const web = await ingresarComo(app(), admin);
    const bot = await ingresarComoBot(app(), u);
    expect((await web.agente.post(`/api/usuarios/${u.id}/desactivar`)).status).toBe(200);
    expect((await bot.agente.get('/api/yo')).status).toBe(401);
    const t = await crearTicket();
    publicar('ticket.asignado', { ticket_id: t.id, usuario_ids: [u.id], actor_id: null });
    await esperarDespachos();
    expect(
      await dataSource.query(`SELECT 1 FROM aviso WHERE usuario_id = $1`, [u.id]),
    ).toHaveLength(0);
    // el vínculo se conserva por si se reactiva
    expect(
      await dataSource.query(`SELECT 1 FROM vinculo_telegram WHERE usuario_id = $1`, [u.id]),
    ).toHaveLength(1);
  });

  it('la sesión bot aparece en GET /api/yo/sesiones con origen bot', async () => {
    const u = await crearUsuario();
    const web = await ingresarComo(app(), u);
    await crearVinculoTelegram(u.id);
    const r = await web.agente.get('/api/yo/sesiones');
    expect(r.body.map((s: { origen: string }) => s.origen).sort()).toEqual(['bot', 'web']);
  });
});

describe('prueba 11: token y código nunca en logs', () => {
  it('vincular y llamadas Bearer no dejan el token ni el código en ningún logger', async () => {
    conToken();
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
    const global: string[] = [];
    const espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
      vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
        global.push(JSON.stringify(args));
      }) as never),
    );
    try {
      const u = await crearUsuario();
      const a = crearApp({ comprobarBd: async () => true, logger });
      const web = await ingresarComo(a, u);
      const codigo = (await web.agente.post('/api/yo/telegram/codigo')).body.codigo as string;
      const r = await comoBot(a).post('/api/bot/vincular').send({ codigo, chat_id: 4242 });
      expect(r.status).toBe(201);
      const token = r.body.token as string;
      await request(a).get('/api/yo').set('Authorization', `Bearer ${token}`);
      await request(a).get('/api/avisos').set('Authorization', `Bearer ${token}`);
      await esperarDespachos();
      const todo = [...lineas, ...global].join('\n');
      expect(todo).not.toContain(token);
      expect(todo).not.toContain(codigo);
      expect(todo).not.toContain('token-de-prueba');
      expect(todo).not.toContain('4242');
    } finally {
      espias.forEach((e) => e.mockRestore());
    }
  });

  it('.env.example deja TELEGRAM_BOT_TOKEN vacío', async () => {
    const { readFileSync } = await import('node:fs');
    const ejemplo = readFileSync(new URL('../../../../../.env.example', import.meta.url), 'utf8');
    expect(ejemplo).toMatch(/^TELEGRAM_BOT_TOKEN=$/m);
  });
});

describe('prueba 19: rangos', () => {
  it('chat_id no entero y telegram_usuario de 65 caracteres → 400', async () => {
    const bot = comoBot(app());
    const a = await bot.post('/api/bot/vincular').send({ codigo: 'ZZZZZZZZ', chat_id: 1.5 });
    expect(a.status).toBe(400);
    const b = await bot
      .post('/api/bot/vincular')
      .send({ codigo: 'ZZZZZZZZ', chat_id: 1, telegram_usuario: 'x'.repeat(65) });
    expect(b.status).toBe(400);
    const c = await bot.post('/api/bot/vincular').send({ codigo: 'ABCDEFGI', chat_id: 1 });
    expect(c.status).toBe(400);
    expect(c.body.error.codigo).toBe('VALIDACION');
  });
});

describe('prueba 1 (rutas de Telegram): sin sesión → 401', () => {
  it('GET, POST codigo y DELETE de /api/yo/telegram', async () => {
    const a = app();
    expect((await request(a).get('/api/yo/telegram')).status).toBe(401);
    expect(
      (await request(a).post('/api/yo/telegram/codigo').set('X-Requested-With', 'Zydesk')).status,
    ).toBe(401);
    expect(
      (await request(a).delete('/api/yo/telegram').set('X-Requested-With', 'Zydesk')).status,
    ).toBe(401);
  });
});
