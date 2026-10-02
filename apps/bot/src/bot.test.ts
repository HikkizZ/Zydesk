import { describe, expect, it } from 'vitest';
import { errorApi, listadoTicketsFalso } from '../test/api-fake.js';
import { armar, CHAT, CLAVE_BOT, TOKEN_BOT, TOKEN_PERSONA } from '../test/armar.js';
import {
  callback,
  mensajeEnGrupo,
  mensajePrivado,
  reenviado,
  reenviadoFoto,
  respuestaA,
  textos,
} from '../test/telegram-fake.js';

const ticket = (numero: number, over: Record<string, unknown> = {}) => ({
  id: numero + 100,
  numero,
  codigo: `TK-${numero}`,
  asunto: 'Error al emitir facturas',
  estado: 'en_curso',
  espera_de: null,
  prioridad: 'alta',
  cliente: { id: 1, nombre: 'Cliente <S.A.>', es_interno: false },
  responsables: [{ id: 5, nombre: 'Sebastián Díaz', principal: true }],
  fecha_limite: '2026-09-30T15:00:00Z',
  ots: [],
  ...over,
});

const pagina = (datos: unknown[], total = datos.length) => ({
  status: 200,
  body: { datos, total, pagina: 1, por_pagina: 10 },
});

const miDiaVacio = {
  fecha: '2026-10-01',
  vencen_hoy: [],
  vencidos: [],
  por_aprobar: [],
  menciones: [],
  tareas: [],
  detenidos: [],
  conteos: { vencen_hoy: 0, vencidos: 0, por_aprobar: 0, menciones: 0, tareas: 0, detenidos: 0 },
};

describe('vincular', () => {
  const tabla = {
    'POST /api/bot/vincular': {
      status: 201,
      body: {
        token: TOKEN_PERSONA,
        usuario: {
          id: 5,
          nombre: 'Sebastián Díaz',
          iniciales: 'SD',
          color_avatar: '#000000',
          rol: 'tecnico',
        },
        expira_en: '2027-01-01T00:00:00Z',
      },
    },
  };

  it('/vincular llama a la API con X-Bot-Key y chat_id, guarda el token y responde Listo', async () => {
    const t = armar(tabla, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/vincular abc23def'));
    const [p] = t.peticiones;
    expect(p?.metodo).toBe('POST');
    expect(p?.ruta).toBe('/api/bot/vincular');
    expect(p?.cabeceras['x-bot-key']).toBe(CLAVE_BOT);
    expect(p?.cabeceras['authorization']).toBeUndefined();
    expect(p?.cuerpo).toMatchObject({ codigo: 'ABC23DEF', chat_id: CHAT });
    expect(t.almacen.obtener(CHAT)).toEqual({
      token: TOKEN_PERSONA,
      usuario_id: 5,
      nombre: 'Sebastián Díaz',
    });
    expect(textos(t.llamadas).join('\n')).toContain('Listo, Sebastián');
    // el mensaje con el código se borra
    expect(t.llamadas.some((l) => l.method === 'deleteMessage')).toBe(true);
  });

  it('/start CÓDIGO (enlace profundo) también vincula', async () => {
    const t = armar(tabla, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/start ABC23DEF'));
    expect(t.peticiones[0]?.ruta).toBe('/api/bot/vincular');
    expect(t.almacen.obtener(CHAT)?.token).toBe(TOKEN_PERSONA);
  });

  it('/start sin código saluda y no llama a la API', async () => {
    const t = armar({}, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/start'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('Vincular Telegram');
  });

  it('un código con formato inválido no llama a la API', async () => {
    const t = armar(tabla, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/vincular 123'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('Código inválido o vencido');
  });

  it.each([
    [400, 'CODIGO_INVALIDO', 'Código inválido o vencido'],
    [409, 'TELEGRAM_CHAT_EN_USO', 'ya está vinculado a otra cuenta'],
    [429, 'VINCULACION_BLOQUEADA', 'espera 15 minutos'],
  ])('error %i de la API → mensaje, sin guardar token', async (status, codigo, esperado) => {
    const t = armar({ 'POST /api/bot/vincular': errorApi(status, codigo) }, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/vincular ABC23DEF'));
    expect(textos(t.llamadas).join('\n')).toContain(esperado);
    expect(t.almacen.obtener(CHAT)).toBeUndefined();
  });

  it('401 por X-Bot-Key inválida no se confunde con sesión caducada', async () => {
    const t = armar(
      { 'POST /api/bot/vincular': errorApi(401, 'CLAVE_BOT_INVALIDA') },
      { vinculado: false },
    );
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/vincular ABC23DEF'));
    const salida = textos(t.llamadas).join('\n');
    expect(salida).toContain('Zydesk no responde');
    expect(salida).not.toContain('caducó');
  });
});

describe('desvincular', () => {
  it('pregunta con botones y al confirmar llama DELETE /api/yo/telegram y borra el token', async () => {
    const t = armar({ 'DELETE /api/yo/telegram': { status: 204 } });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/desvincular'));
    const pregunta = t.llamadas.find((l) => l.method === 'sendMessage');
    expect(JSON.stringify(pregunta?.payload['reply_markup'])).toContain('desvincular:si');
    expect(t.peticiones).toHaveLength(0);

    await t.bot.handleUpdate(callback(CHAT, 'desvincular:si', { texto: 'pregunta' }));
    expect(t.peticiones[0]).toMatchObject({ metodo: 'DELETE', ruta: '/api/yo/telegram' });
    expect(t.peticiones[0]?.cabeceras['authorization']).toBe(`Bearer ${TOKEN_PERSONA}`);
    expect(t.almacen.obtener(CHAT)).toBeUndefined();
    expect(textos(t.llamadas).join('\n')).toContain('Cuenta desvinculada');
  });

  it('Cancelar no llama a la API', async () => {
    const t = armar();
    await t.bot.handleUpdate(callback(CHAT, 'desvincular:no', { texto: 'pregunta' }));
    expect(t.peticiones).toHaveLength(0);
    expect(t.almacen.obtener(CHAT)).toBeDefined();
  });
});

describe('sin vínculo', () => {
  it('/hoy recibe las instrucciones y no llama a la API', async () => {
    const t = armar({}, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('Avisos → Vincular Telegram');
  });

  it('un texto suelto recibe las instrucciones', async () => {
    const t = armar({}, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, 'hola'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('Vincular Telegram');
  });
});

describe('/hoy', () => {
  it('usa Bearer y nunca X-Bot-Key; formatea el resumen', async () => {
    const t = armar({
      'GET /api/mi-dia': {
        status: 200,
        body: {
          ...miDiaVacio,
          vencen_hoy: [ticket(1048), ticket(1051, { asunto: 'Servidor <b>de</b> archivos' })],
          por_aprobar: [{ codigo: 'OT-0219', titulo: 'Reemplazo de UPS' }],
          tareas: [{ titulo: 'Cargar CAF', destino: { codigo: 'OT-0218' } }],
          conteos: {
            ...miDiaVacio.conteos,
            vencen_hoy: 7,
            por_aprobar: 1,
            menciones: 3,
            tareas: 1,
          },
        },
      },
    });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(t.peticiones).toHaveLength(1);
    expect(t.peticiones[0]?.ruta).toBe('/api/mi-dia');
    expect(t.peticiones[0]?.cabeceras['authorization']).toBe(`Bearer ${TOKEN_PERSONA}`);
    expect(t.peticiones[0]?.cabeceras['x-bot-key']).toBeUndefined();
    const salida = textos(t.llamadas)[0] ?? '';
    expect(salida.split('\n')[0]).toBe('<b>Zydesk · Mi día</b> — jueves 1 de octubre');
    expect(salida).toContain('<b>Vencen hoy (7)</b>\n• TK-1048 · Error al emitir facturas');
    expect(salida).toContain('\ny 5 más\n');
    expect(salida).toContain('&lt;b&gt;de&lt;/b&gt;');
    expect(salida).toContain('<b>Por aprobar (1)</b>\n• OT-0219 · Reemplazo de UPS');
    expect(salida).toContain('<b>Menciones sin leer:</b> 3');
    expect(salida).toContain('<b>Tareas para hoy (1)</b>\n• Cargar CAF · OT-0218');
    expect(salida).toContain('<a href="https://desk.test/mi-dia">Abrir Mi día</a>');
    expect(t.llamadas[0]?.payload['parse_mode']).toBe('HTML');
  });

  it('sin nada pendiente lo dice', async () => {
    const t = armar({ 'GET /api/mi-dia': { status: 200, body: miDiaVacio } });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(textos(t.llamadas)[0]).toBe(
      '<b>Zydesk · Mi día</b> — jueves 1 de octubre\n\nNada pendiente.',
    );
  });
});

describe('/mis', () => {
  it('lista hasta 10 tickets, escapa HTML y enlaza «y N más»', async () => {
    const datos = Array.from({ length: 10 }, (_, i) =>
      ticket(1000 + i, { asunto: i === 0 ? '<img src=x onerror=alert(1)>' : 'Normal' }),
    );
    const t = armar({ 'GET /api/tickets': pagina(datos, 14) });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/mis'));
    expect(t.peticiones[0]?.query).toMatchObject({
      solo_mios: 'true',
      archivados: 'false',
      orden: 'fecha_limite',
      por_pagina: '10',
    });
    const salida = textos(t.llamadas)[0] ?? '';
    expect(salida.startsWith('<b>Tus tickets</b>\n\n')).toBe(true);
    expect(salida).toContain(
      '• <b>TK-1000</b> · Alta · En curso · vence 30 sep\n   &lt;img src=x onerror=alert(1)&gt;\n\n• <b>TK-1001</b>',
    );
    expect(salida).not.toContain('<img');
    expect(salida.match(/TK-10\d\d/g)).toHaveLength(10);
    expect(salida).toContain('y 4 más');
    expect(salida).toContain('https://desk.test/tickets/tabla?solo_mios=true');
  });

  it('sin tickets lo dice', async () => {
    const t = armar({ 'GET /api/tickets': pagina([]) });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/mis'));
    expect(textos(t.llamadas)[0]).toContain('No tienes tickets abiertos');
  });
});

describe('/ticket', () => {
  const tabla = (extra: Record<string, unknown> = {}, archivado_en: string | null = null) => ({
    'GET /api/tickets': listadoTicketsFalso([ticket(1048, { archivado_en })]),
    'GET /api/tickets/1148': {
      status: 200,
      body: { ...ticket(1048), ots: [{ codigo: 'OT-0218', etapa: 'en_ejecucion' }], ...extra },
    },
    'GET /api/tickets/1148/mensajes': {
      status: 200,
      body: [
        {
          tipo: 'seguimiento',
          autor: { nombre: 'Camila' },
          creado_en: '2026-09-29T15:00:00Z',
          texto: 'Probando CAF',
        },
        {
          tipo: 'nota_interna',
          autor: { nombre: 'Camila' },
          creado_en: '2026-09-30T15:00:00Z',
          texto: 'SECRETO-XYZ',
        },
      ],
    },
  });

  it('muestra la ficha sin texto de notas internas', async () => {
    const t = armar(tabla());
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ticket TK-1048'));
    expect(t.peticiones[0]?.query).toMatchObject({ q: '1048', archivados: 'false' });
    expect(t.peticiones[2]?.query).toMatchObject({ tipo: 'seguimiento' });
    const salida = textos(t.llamadas)[0] ?? '';
    expect(salida.split('\n')[0]).toBe('<b>TK-1048</b> · Error al emitir facturas');
    expect(salida).toContain('\nCliente: Cliente &lt;S.A.&gt;\n');
    expect(salida).toContain('\nOT: OT-0218 (En ejecución)\n');
    expect(salida).toContain('\n\n<b>Últimos seguimientos</b>\n• Camila · 29 sep · Probando CAF');
    expect(salida).toContain('\n\n<a href="https://desk.test/tickets/1148">Abrir en la web</a>');
    expect(salida).not.toContain('SECRETO-XYZ');
    expect(salida).toContain('https://desk.test/tickets/1148');
  });

  it('acepta solo dígitos', async () => {
    const t = armar(tabla());
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ticket 1048'));
    expect(textos(t.llamadas)[0]).toContain('TK-1048');
  });

  it('un ticket archivado se encuentra en el segundo intento', async () => {
    const t = armar(tabla({}, '2026-09-01T00:00:00Z'));
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ticket 1048'));
    expect(t.peticiones[0]?.query).toMatchObject({ q: '1048', archivados: 'false' });
    expect(t.peticiones[1]?.query).toMatchObject({ q: '1048', archivados: 'true' });
    expect(textos(t.llamadas)[0]).toContain('TK-1048');
  });

  it('sin resultado → «No encuentro TK-1048»', async () => {
    const t = armar({ 'GET /api/tickets': listadoTicketsFalso([]) });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ticket 1048'));
    expect(textos(t.llamadas)[0]).toBe('No encuentro TK-1048');
  });

  it('sin argumento válido explica el uso y no llama a la API', async () => {
    const t = armar();
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ticket hola'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas)[0]).toContain('/ticket 1048');
  });
});

describe('responder un aviso', () => {
  // Texto plano de un aviso con el formato de Telegram (Telegram entrega `text` sin etiquetas)
  const aviso = 'Zydesk\n\nTK-1048 · Camila te mencionó en TK-1048\n\nAbrir TK-1048';

  it('registra el seguimiento con el texto exacto', async () => {
    const t = armar({
      'GET /api/tickets': listadoTicketsFalso([ticket(1048)]),
      'POST /api/tickets/1148/mensajes': { status: 201, body: {} },
    });
    await t.bot.handleUpdate(respuestaA(CHAT, 'Listo, <ya lo vi> & lo reviso', aviso));
    const post = t.peticiones.find((p) => p.metodo === 'POST');
    expect(post?.ruta).toBe('/api/tickets/1148/mensajes');
    expect(post?.cuerpo).toEqual({ tipo: 'seguimiento', texto: 'Listo, <ya lo vi> & lo reviso' });
    expect(post?.cabeceras['authorization']).toBe(`Bearer ${TOKEN_PERSONA}`);
    expect(textos(t.llamadas)[0]).toContain('Seguimiento registrado en TK-1048');
  });

  it('responder a un aviso de un ticket archivado también registra el seguimiento', async () => {
    const t = armar({
      'GET /api/tickets': listadoTicketsFalso([
        ticket(1048, { archivado_en: '2026-09-01T00:00:00Z' }),
      ]),
      'POST /api/tickets/1148/mensajes': { status: 201, body: {} },
    });
    await t.bot.handleUpdate(respuestaA(CHAT, 'Gracias', aviso));
    expect(t.peticiones.some((p) => p.metodo === 'POST')).toBe(true);
  });

  it('un ticket inexistente → «No encuentro TK-1048»', async () => {
    const t = armar({ 'GET /api/tickets': listadoTicketsFalso([]) });
    await t.bot.handleUpdate(respuestaA(CHAT, 'Gracias', aviso));
    expect(t.peticiones.some((p) => p.metodo === 'POST')).toBe(false);
    expect(textos(t.llamadas)[0]).toContain('No encuentro TK-1048');
  });

  it('con OT-#### usa las rutas de OT', async () => {
    const t = armar({
      'GET /api/ots': {
        status: 200,
        body: { datos: [{ id: 7, numero: 219, codigo: 'OT-0219' }], total: 1 },
      },
      'POST /api/ots/7/mensajes': { status: 201, body: {} },
    });
    await t.bot.handleUpdate(respuestaA(CHAT, 'Aprobado', 'Te pidieron aprobar OT-0219'));
    expect(t.peticiones[0]?.query).toMatchObject({ q: '219' });
    expect(t.peticiones[1]).toMatchObject({ metodo: 'POST', ruta: '/api/ots/7/mensajes' });
  });

  it('recorta a 20 000 caracteres y avisa', async () => {
    const t = armar({
      'GET /api/tickets': listadoTicketsFalso([ticket(1048)]),
      'POST /api/tickets/1148/mensajes': { status: 201, body: {} },
    });
    await t.bot.handleUpdate(respuestaA(CHAT, 'a'.repeat(20_500), aviso));
    const post = t.peticiones.find((p) => p.metodo === 'POST');
    expect((post?.cuerpo as { texto: string }).texto).toHaveLength(20_000);
    expect(textos(t.llamadas)[0]).toContain('se recortó');
  });

  it('un mensaje citado sin código no llama a la API', async () => {
    const t = armar();
    await t.bot.handleUpdate(respuestaA(CHAT, 'hola', 'Un aviso sin código'));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas)[0]).toContain('Responde a un aviso de un ticket u OT');
  });

  it('si el mensaje citado no es del bot lo ignora como texto suelto', async () => {
    const t = armar();
    await t.bot.handleUpdate(respuestaA(CHAT, 'hola', 'TK-1048 de otra persona', false));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas)[0]).toContain('No entendí');
  });
});

describe('Aprobar OT', () => {
  it('llama POST /api/ots/7/aprobar y edita el mensaje sin botones', async () => {
    const t = armar({
      'POST /api/ots/7/aprobar': { status: 200, body: { id: 7, codigo: 'OT-0219' } },
    });
    await t.bot.handleUpdate(callback(CHAT, 'aprobar:ot:7', { texto: 'OT por aprobar' }));
    expect(t.peticiones[0]).toMatchObject({ metodo: 'POST', ruta: '/api/ots/7/aprobar' });
    expect(t.peticiones[0]?.cuerpo).toEqual({ iniciar: false });
    expect(t.peticiones[0]?.cabeceras['authorization']).toBe(`Bearer ${TOKEN_PERSONA}`);
    const edicion = t.llamadas.find((l) => l.method === 'editMessageText');
    expect(edicion?.payload['text']).toBe('✓ OT-0219 aprobada por ti el 1 oct 10:15');
    expect(JSON.stringify(edicion?.payload['reply_markup'])).toContain('[]');
    expect(t.llamadas.some((l) => l.method === 'answerCallbackQuery')).toBe(true);
  });

  it('403 → «No tienes permiso para aprobar»', async () => {
    const t = armar({ 'POST /api/ots/7/aprobar': errorApi(403, 'SIN_PERMISO') });
    await t.bot.handleUpdate(callback(CHAT, 'aprobar:ot:7', { texto: 'x' }));
    expect(textos(t.llamadas).join('\n')).toContain('No tienes permiso para aprobar');
    expect(t.llamadas.some((l) => l.method === 'editMessageText')).toBe(false);
  });

  it('409 TRANSICION_INVALIDA → «La OT ya no está en borrador»', async () => {
    const t = armar({ 'POST /api/ots/7/aprobar': errorApi(409, 'TRANSICION_INVALIDA') });
    await t.bot.handleUpdate(callback(CHAT, 'aprobar:ot:7', { texto: 'x' }));
    expect(textos(t.llamadas).join('\n')).toContain('La OT ya no está en borrador');
  });

  it('callback_data malformado se ignora', async () => {
    const t = armar();
    await t.bot.handleUpdate(callback(CHAT, 'aprobar:ot:7/../x', { texto: 'x' }));
    expect(t.peticiones).toHaveLength(0);
  });
});

describe('reenviar un mensaje', () => {
  const texto = `${'T'.repeat(250)}\nsegunda línea <con html>`;

  async function conPregunta() {
    const t = armar({
      'GET /api/yo': { status: 200, body: { id: 5 } },
      'POST /api/tickets': { status: 201, body: { id: 1154, codigo: 'TK-1054' } },
    });
    await t.bot.handleUpdate(reenviado(CHAT, texto, 'Ana'));
    const pregunta = t.llamadas.find((l) => l.method === 'sendMessage');
    const botones = JSON.stringify(pregunta?.payload['reply_markup']);
    const datos = /crear:[0-9a-f]{8}/.exec(botones)?.[0] ?? '';
    return { t, pregunta, botones, datos };
  }

  it('pregunta antes de crear y no llama a la API todavía', async () => {
    const { t, pregunta, botones } = await conPregunta();
    expect(String(pregunta?.payload['text'])).toContain('¿Crear un ticket con este texto?');
    expect(botones).toContain('Crear ticket');
    expect(botones).toContain('Cancelar');
    expect(t.peticiones).toHaveLength(0);
  });

  it('al confirmar crea el ticket con asunto recortado a 200 y responsable principal', async () => {
    const { t, datos } = await conPregunta();
    expect(datos).not.toBe('');
    await t.bot.handleUpdate(callback(CHAT, datos, { texto: 'pregunta' }));
    const post = t.peticiones.find((p) => p.ruta === '/api/tickets');
    expect(post?.metodo).toBe('POST');
    const cuerpo = post?.cuerpo as Record<string, unknown>;
    expect((cuerpo['asunto'] as string).length).toBe(200);
    expect(cuerpo['descripcion']).toBe(texto);
    expect(cuerpo).toMatchObject({
      origen: 'interno',
      prioridad: 'media',
      solicitante_nombre: 'Ana',
      responsable_principal_id: 5,
      cliente_id: null,
      fecha_limite: null,
    });
    const edicion = t.llamadas.find((l) => l.method === 'editMessageText');
    expect(String(edicion?.payload['text'])).toContain('Ticket TK-1054 creado');
    expect(String(edicion?.payload['text'])).toContain('https://desk.test/tickets/1154');
  });

  it('Cancelar descarta el texto pendiente', async () => {
    const { t, datos } = await conPregunta();
    const hash = datos.split(':')[1];
    await t.bot.handleUpdate(callback(CHAT, `cancelar:${hash}`, { texto: 'pregunta' }));
    await t.bot.handleUpdate(callback(CHAT, datos, { texto: 'pregunta' }));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('venció');
  });

  it('una confirmación desconocida o vencida no crea nada', async () => {
    const t = armar();
    await t.bot.handleUpdate(callback(CHAT, 'crear:deadbeef', { texto: 'x' }));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas).join('\n')).toContain('venció');
  });

  it('una foto reenviada no se soporta', async () => {
    const t = armar();
    await t.bot.handleUpdate(reenviadoFoto(CHAT));
    expect(t.peticiones).toHaveLength(0);
    expect(textos(t.llamadas)[0]).toContain('solo puedo crear tickets desde mensajes de texto');
  });
});

describe('errores de la API', () => {
  it('401 borra el token y pide re-vincular', async () => {
    const t = armar({ 'GET /api/mi-dia': errorApi(401, 'NO_AUTENTICADO') });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(t.almacen.obtener(CHAT)).toBeUndefined();
    expect(textos(t.llamadas)[0]).toContain('/vincular CÓDIGO');
    expect(textos(t.llamadas)[0]).toContain('desvinculaste la cuenta');
    expect(textos(t.llamadas)[0]).not.toContain('Sigues recibiendo avisos');
  });

  it.each([
    [403, 'SIN_PERMISO', 'No tienes permiso para esta acción'],
    [403, 'CONTRASENA_PENDIENTE', 'cambiar tu contraseña'],
    [403, 'TERMINOS_PENDIENTES', 'aceptar los términos'],
    [404, 'NO_ENCONTRADO', 'No encuentro eso'],
    [409, 'TICKET_CERRADO', 'mensaje de la API'],
    [500, 'INTERNO', 'Zydesk no responde ahora'],
  ])('%i %s', async (status, codigo, esperado) => {
    const t = armar({ 'GET /api/mi-dia': errorApi(status, codigo) });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(textos(t.llamadas)[0]).toContain(esperado);
    expect(t.almacen.obtener(CHAT)).toBeDefined();
  });

  it('400 VALIDACION muestra el primer detalle', async () => {
    const t = armar({
      'GET /api/mi-dia': {
        status: 400,
        body: {
          error: {
            codigo: 'VALIDACION',
            mensaje: 'x',
            detalles: [{ mensaje: 'texto demasiado largo' }],
          },
        },
      },
    });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(textos(t.llamadas)[0]).toBe('No pude registrarlo: texto demasiado largo');
  });

  it('un fallo de red responde «Zydesk no responde»', async () => {
    const t = armar({
      'GET /api/mi-dia': () => {
        throw new Error('red');
      },
    });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    expect(textos(t.llamadas)[0]).toContain('Zydesk no responde ahora');
  });
});

describe('grupos y otros mensajes', () => {
  it('un mensaje en un grupo no genera llamadas ni respuesta', async () => {
    const t = armar();
    await t.bot.handleUpdate(mensajeEnGrupo(CHAT, '/hoy'));
    expect(t.peticiones).toHaveLength(0);
    expect(t.llamadas).toHaveLength(0);
  });

  it('texto suelto con vínculo → «No entendí»', async () => {
    const t = armar();
    await t.bot.handleUpdate(mensajePrivado(CHAT, 'hola'));
    expect(textos(t.llamadas)[0]).toBe('No entendí. Escribe /ayuda');
  });

  it('/ayuda lista comandos y acciones', async () => {
    const t = armar({}, { vinculado: false });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/ayuda'));
    const salida = textos(t.llamadas)[0] ?? '';
    expect(salida).toContain('/hoy');
    expect(salida).toContain('Responde a un aviso');
    expect(salida).toContain('Reenvíame');
  });
});

describe('logs', () => {
  it('no contienen tokens, chat_id ni el texto de los mensajes', async () => {
    const t = armar({
      'GET /api/mi-dia': errorApi(500, 'INTERNO'),
      'GET /api/tickets': listadoTicketsFalso([ticket(1048)]),
      'POST /api/tickets/1148/mensajes': { status: 201, body: {} },
    });
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/hoy'));
    await t.bot.handleUpdate(respuestaA(CHAT, 'TEXTO-PRIVADO-123', 'Aviso TK-1048'));
    await t.bot.handleUpdate(reenviado(CHAT, 'TEXTO-REENVIADO-456', 'Ana'));
    await t.bot.handleUpdate(mensajePrivado(CHAT, '/vincular ABC23DEF'));
    const logs = t.logs();
    expect(logs).toContain('"comando":"hoy"');
    expect(logs).toContain('"usuario_id":5');
    for (const prohibido of [
      TOKEN_PERSONA,
      TOKEN_BOT,
      CLAVE_BOT,
      String(CHAT),
      'TEXTO-PRIVADO-123',
      'TEXTO-REENVIADO-456',
      'ABC23DEF',
    ]) {
      expect(logs).not.toContain(prohibido);
    }
  });
});
