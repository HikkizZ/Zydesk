import { describe, expect, it } from 'vitest';
import { crearFetchFalso, errorApi } from '../../test/api-fake.js';
import { ClienteZydesk, ErrorApi } from './cliente.js';

const crear = (tabla: Parameters<typeof crearFetchFalso>[0]) => {
  const { fetch, peticiones } = crearFetchFalso(tabla);
  return { api: new ClienteZydesk({ apiUrl: 'http://api:3000/', botKey: 'K', fetch }), peticiones };
};

describe('ClienteZydesk', () => {
  it('traduce { error: { codigo } } a ErrorApi', async () => {
    const { api } = crear({ 'GET /api/mi-dia': errorApi(409, 'TICKET_CERRADO', 'Cerrado') });
    const err = await api.miDia('t').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorApi);
    expect(err).toMatchObject({ status: 409, codigo: 'TICKET_CERRADO', mensajeApi: 'Cerrado' });
  });

  it('un fallo de red es ErrorApi 0 NO_DISPONIBLE', async () => {
    const { api } = crear({
      'GET /api/mi-dia': () => {
        throw new Error('red');
      },
    });
    const err = (await api.miDia('t').catch((e: unknown) => e)) as ErrorApi;
    expect(err.noDisponible).toBe(true);
    expect(err.codigo).toBe('NO_DISPONIBLE');
  });

  it('solo vincular envía X-Bot-Key; el resto, Bearer', async () => {
    const { api, peticiones } = crear({
      'POST /api/bot/vincular': {
        status: 201,
        body: {
          token: 'T',
          usuario: { id: 1, nombre: 'A', iniciales: 'A', color_avatar: '#000000', rol: 'tecnico' },
          expira_en: '2027-01-01T00:00:00Z',
        },
      },
      'GET /api/yo': { status: 200, body: { id: 1 } },
    });
    await api.vincular({ codigo: 'ABC23DEF', chat_id: 1, telegram_usuario: null });
    await api.yo('TOK');
    expect(peticiones[0]?.cabeceras['x-bot-key']).toBe('K');
    expect(peticiones[0]?.cabeceras['authorization']).toBeUndefined();
    expect(peticiones[1]?.cabeceras['authorization']).toBe('Bearer TOK');
    expect(peticiones[1]?.cabeceras['x-bot-key']).toBeUndefined();
  });

  it('204 devuelve sin cuerpo', async () => {
    const { api } = crear({ 'DELETE /api/yo/telegram': { status: 204 } });
    await expect(api.desvincular('t')).resolves.toBeUndefined();
  });
});
