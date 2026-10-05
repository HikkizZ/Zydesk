import { describe, expect, it, vi } from 'vitest';
import {
  ErrorFuenteUf,
  URL_BOOSTR,
  URL_MINDICADOR,
  consultarFuente,
  obtenerUfDelDia,
  type MotivoFallo,
} from './cliente.js';

const HOY = '2026-10-05';
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

const boostr = (value: unknown = 41098.15, date: unknown = HOY, extra: object = {}) => ({
  status: 'success',
  data: { date, value },
  ...extra,
});
const mindicador = (valor: unknown = 41098.15, fecha: unknown = '2026-10-05T03:00:00.000Z') => ({
  serie: [{ fecha, valor }],
});

const resp = (cuerpo: unknown, status = 200, headers: Record<string, string> = JSON_H) =>
  new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers });

type Doble = typeof globalThis.fetch;
const doble = (r: () => Response | Promise<Response>): Doble =>
  vi.fn(async () => r()) as unknown as Doble;

async function motivoDe(
  fuente: 'boostr' | 'mindicador',
  f: Doble,
  hoy = HOY,
): Promise<{ motivo: MotivoFallo; err: ErrorFuenteUf }> {
  try {
    await consultarFuente(fuente, hoy, f);
  } catch (err) {
    expect(err).toBeInstanceOf(ErrorFuenteUf);
    return { motivo: (err as ErrorFuenteUf).motivo, err: err as ErrorFuenteUf };
  }
  throw new Error('debía fallar');
}

describe('la petición saliente', () => {
  it.each([
    ['boostr', URL_BOOSTR, boostr()],
    ['mindicador', URL_MINDICADOR, mindicador()],
  ] as const)(
    '%s: URL fija, GET, sin cuerpo ni cookies ni Authorization, redirect error',
    async (fuente, url, cuerpo) => {
      const f = doble(() => resp(cuerpo));
      const uf = await consultarFuente(fuente, HOY, f);
      expect(uf).toEqual({ fecha: HOY, valor: 41098.15, fuente });
      const mock = vi.mocked(f);
      expect(mock).toHaveBeenCalledTimes(1);
      const [u, init] = mock.mock.calls[0]!;
      expect(u).toBe(url);
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({ Accept: 'application/json' });
      const claves = Object.keys(init?.headers as object).map((k) => k.toLowerCase());
      expect(claves).not.toContain('cookie');
      expect(claves).not.toContain('authorization');
      expect(init?.credentials).toBeUndefined();
    },
  );

  it('mindicador: la fecha se convierte al día de Santiago', async () => {
    const f = doble(() => resp(mindicador(41098.15, '2026-10-05T03:00:00.000Z')));
    expect((await consultarFuente('mindicador', HOY, f)).fecha).toBe('2026-10-05');
    // 02:00Z de verano es la noche del día anterior en Santiago
    const g = doble(() => resp(mindicador(41098.15, '2026-10-05T02:00:00.000Z')));
    expect((await consultarFuente('mindicador', HOY, g)).fecha).toBe('2026-10-04');
  });

  it('claves extra en el JSON se ignoran y el valor se redondea a 2 decimales', async () => {
    const f = doble(() => resp(boostr(41098.154, HOY, { extra: 'x', otro: { a: 1 } })));
    expect((await consultarFuente('boostr', HOY, f)).valor).toBe(41098.15);
  });

  it('acepta una fecha de hace 7 días y de hoy', async () => {
    const f = doble(() => resp(boostr(41098.15, '2026-09-28')));
    expect((await consultarFuente('boostr', HOY, f)).fecha).toBe('2026-09-28');
  });
});

describe('respuestas inválidas → ErrorFuenteUf con el motivo esperado', () => {
  const casos: [string, 'boostr' | 'mindicador', () => Response, MotivoFallo][] = [
    [
      'HTML con 200',
      'boostr',
      () => resp('<html>x</html>', 200, { 'Content-Type': 'text/html' }),
      'tipo',
    ],
    ['JSON truncado', 'boostr', () => resp('{"status":"succ'), 'json'],
    ['status error', 'boostr', () => resp({ status: 'error', message: 'x' }), 'estado'],
    ['sin data', 'boostr', () => resp({ status: 'success' }), 'formato'],
    ['serie vacía', 'mindicador', () => resp({ serie: [] }), 'formato'],
    ['value texto', 'boostr', () => resp(boostr('abc')), 'formato'],
    ['value null (NaN serializado)', 'boostr', () => resp(boostr(null)), 'formato'],
    ['valor texto mindicador', 'mindicador', () => resp(mindicador('abc')), 'formato'],
    ['value 1', 'boostr', () => resp(boostr(1)), 'rango'],
    ['value 1e9', 'boostr', () => resp(boostr(1e9)), 'rango'],
    ['value negativo', 'boostr', () => resp(boostr(-41098.15)), 'rango'],
    ['valor 19999.99', 'mindicador', () => resp(mindicador(19999.99)), 'rango'],
    ['fecha futura', 'boostr', () => resp(boostr(41098.15, '2026-10-06')), 'fecha'],
    ['fecha de hace 30 días', 'boostr', () => resp(boostr(41098.15, '2026-09-05')), 'fecha'],
    ['fecha de hace 8 días', 'boostr', () => resp(boostr(41098.15, '2026-09-27')), 'fecha'],
    ['fecha 2026-13-01', 'boostr', () => resp(boostr(41098.15, '2026-13-01')), 'formato'],
    [
      'fecha mindicador inválida',
      'mindicador',
      () => resp(mindicador(41098.15, 'ayer')),
      'formato',
    ],
    [
      'fecha mindicador futura',
      'mindicador',
      () => resp(mindicador(41098.15, '2026-10-09T03:00:00.000Z')),
      'fecha',
    ],
    ['status 301', 'boostr', () => resp('', 301, {}), 'http_301'],
    ['status 429', 'boostr', () => resp({}, 429), 'http_429'],
    ['status 500', 'mindicador', () => resp({}, 500), 'http_500'],
    ['status 204', 'boostr', () => new Response(null, { status: 204 }), 'http_204'],
    ['cuerpo de 70 KB', 'boostr', () => resp('{"x":"' + 'a'.repeat(70 * 1024) + '"}'), 'tamano'],
    [
      'Content-Length de 70 KB',
      'boostr',
      () => resp('{}', 200, { ...JSON_H, 'Content-Length': String(70 * 1024) }),
      'tamano',
    ],
  ];
  it.each(casos)('%s', async (_nombre, fuente, r, esperado) => {
    const { motivo, err } = await motivoDe(fuente, doble(r));
    expect(motivo).toBe(esperado);
    expect(err.fuente).toBe(fuente);
  });

  it('el error no contiene el cuerpo de la respuesta', async () => {
    const { err } = await motivoDe(
      'boostr',
      doble(() =>
        resp('<html><body>secreto-42</body></html>', 200, { 'Content-Type': 'text/html' }),
      ),
    );
    const texto = `${String(err)} ${err.message} ${JSON.stringify(err)}`;
    expect(texto).not.toContain('<html');
    expect(texto).not.toContain('secreto-42');
  });
});

describe('fallos de red', () => {
  it('timeout (TimeoutError)', async () => {
    const f = doble(() => Promise.reject(new DOMException('agotado', 'TimeoutError')));
    expect((await motivoDe('boostr', f)).motivo).toBe('timeout');
  });

  it('redirección (TypeError «redirect»), sin copiar el mensaje original', async () => {
    const f = doble(() =>
      Promise.reject(new TypeError(`fetch failed: unexpected redirect ${URL_BOOSTR}`)),
    );
    const { motivo, err } = await motivoDe('boostr', f);
    expect(motivo).toBe('redireccion');
    expect(`${err.message} ${String(err)}`).not.toContain('https://');
  });

  it('redirección informada en la causa (undici)', async () => {
    const f = doble(() =>
      Promise.reject(new TypeError('fetch failed', { cause: new Error('unexpected redirect') })),
    );
    expect((await motivoDe('boostr', f)).motivo).toBe('redireccion');
  });

  it('error de red genérico', async () => {
    const f = doble(() => Promise.reject(new TypeError('fetch failed https://x.test/secreto')));
    const { motivo, err } = await motivoDe('mindicador', f);
    expect(motivo).toBe('red');
    expect(err.message).not.toContain('secreto');
  });
});

describe('obtenerUfDelDia', () => {
  it('Boostr bien: no consulta mindicador', async () => {
    const f = doble(() => resp(boostr()));
    const r = await obtenerUfDelDia(HOY, f);
    expect(r).toEqual({
      ok: true,
      uf: { fecha: HOY, valor: 41098.15, fuente: 'boostr' },
      fallos: {},
    });
    expect(vi.mocked(f)).toHaveBeenCalledTimes(1);
  });

  it('Boostr falla: respaldo en mindicador, una sola petición a cada fuente', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url) === URL_BOOSTR ? resp({}, 500) : resp(mindicador()),
    ) as unknown as Doble;
    const r = await obtenerUfDelDia(HOY, f);
    expect(r).toEqual({
      ok: true,
      uf: { fecha: HOY, valor: 41098.15, fuente: 'mindicador' },
      fallos: { boostr: 'http_500' },
    });
    expect(vi.mocked(f).mock.calls.map((c) => c[0])).toEqual([URL_BOOSTR, URL_MINDICADOR]);
  });

  it('ambas fallan: devuelve los dos motivos sin lanzar', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url) === URL_BOOSTR
        ? resp({}, 429)
        : resp('<html>', 200, { 'Content-Type': 'text/html' }),
    ) as unknown as Doble;
    expect(await obtenerUfDelDia(HOY, f)).toEqual({
      ok: false,
      fallos: { boostr: 'http_429', mindicador: 'tipo' },
    });
  });
});

describe('guarda de tests', () => {
  it('llamar con el fetch real lanza antes de tocar la red', async () => {
    await expect(consultarFuente('boostr', HOY, globalThis.fetch)).rejects.toThrow(
      'los tests no consultan fuentes externas',
    );
    await expect(obtenerUfDelDia(HOY, globalThis.fetch)).rejects.toThrow(
      'los tests no consultan fuentes externas',
    );
  });
});
