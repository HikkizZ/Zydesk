import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearIndicadorUf } from '../../../test/fabricas.js';
import { dataSource } from '../../config/db.js';
import { logger as loggerGlobal } from '../../config/logger.js';
import { URL_BOOSTR } from '../../integraciones/uf/cliente.js';
import { registrarUf } from '../../modulos/indicadores/indicadores.service.js';
import { hoyEnSantiago } from '../fechas.js';
import { ejecutarActualizacionUf } from './uf.js';

type Doble = typeof globalThis.fetch;
const JSON_H = { 'Content-Type': 'application/json' };
const resp = (cuerpo: unknown, status = 200, headers: Record<string, string> = JSON_H) =>
  new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers });

const diaDesplazado = (dias: number): string => {
  const d = new Date(`${hoyEnSantiago()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const cuerpoBoostr = (value: unknown = 41098.15, date = hoyEnSantiago()) => ({
  status: 'success',
  data: { date, value },
});
const cuerpoMindicador = (valor = 41098.15) => ({
  serie: [{ fecha: `${hoyEnSantiago()}T12:00:00.000Z`, valor }],
});

// Responde según la URL; `porUrl` devuelve una respuesta nueva por llamada (el cuerpo se consume una vez).
const porUrl = (b: () => Response, m: () => Response) =>
  vi.fn(async (url: string | URL | Request) =>
    String(url) === URL_BOOSTR ? b() : m(),
  ) as unknown as Doble;

const filas = async (): Promise<{ fecha: string; valor: number; fuente: string }[]> =>
  (
    await dataSource.query(
      `SELECT fecha::text AS fecha, valor::float8 AS valor, fuente FROM indicador_uf ORDER BY fecha`,
    )
  ).map((f: { fecha: string; valor: number; fuente: string }) => f);

const contar = async (t: string): Promise<number> =>
  (await dataSource.query(`SELECT count(*)::int AS n FROM ${t}`))[0].n;

let lineas: { nivel: string; args: unknown[] }[] = [];
let espias: { mockRestore: () => void }[] = [];
beforeEach(() => {
  lineas = [];
  espias = (['trace', 'debug', 'info', 'warn', 'error'] as const).map((nivel) =>
    vi.spyOn(loggerGlobal, nivel).mockImplementation(((...args: unknown[]) => {
      lineas.push({ nivel, args });
    }) as never),
  );
});
afterEach(() => espias.forEach((e) => e.mockRestore()));

const registro = (nivel: string): Record<string, unknown>[] =>
  lineas.filter((l) => l.nivel === nivel).map((l) => l.args[0] as Record<string, unknown>);
const todoElLog = (): string =>
  JSON.stringify(
    lineas.map((l) => l.args),
    (_k, v: unknown) => (v instanceof Error ? { m: v.message, s: v.stack } : v),
  );

describe('indicadores.uf', () => {
  it('sin fila de hoy y Boostr bien: guarda la fila y avisa sin el valor', async () => {
    const f = porUrl(
      () => resp(cuerpoBoostr()),
      () => resp({}, 500),
    );
    const antesEv = await contar('evento');
    const antesAu = await contar('auditoria');
    const r = await ejecutarActualizacionUf('j1', { fetch: f });
    expect(r).toEqual({ estado: 'actualizada', fuente: 'boostr', fecha: hoyEnSantiago() });
    expect(await filas()).toEqual([{ fecha: hoyEnSantiago(), valor: 41098.15, fuente: 'boostr' }]);
    expect(vi.mocked(f)).toHaveBeenCalledTimes(1);
    expect(await contar('evento')).toBe(antesEv);
    expect(await contar('auditoria')).toBe(antesAu);
    const fin = registro('info').find((l) => l['estado'] === 'actualizada');
    expect(fin).toMatchObject({ job: 'indicadores.uf', job_id: 'j1', fuente: 'boostr' });
    expect(todoElLog()).not.toContain('41098');
  });

  it('con la fila de hoy: al_dia y el doble no se llama', async () => {
    await crearIndicadorUf();
    const f = vi.fn() as unknown as Doble;
    expect(await ejecutarActualizacionUf(undefined, { fetch: f })).toEqual({ estado: 'al_dia' });
    expect(vi.mocked(f)).not.toHaveBeenCalled();
  });

  it('Boostr 500 y mindicador bien: guarda mindicador y deja un warn con el motivo', async () => {
    const f = porUrl(
      () => resp({}, 500),
      () => resp(cuerpoMindicador()),
    );
    const r = await ejecutarActualizacionUf('j2', { fetch: f });
    expect(r).toMatchObject({ estado: 'actualizada', fuente: 'mindicador' });
    expect((await filas())[0]).toMatchObject({ fuente: 'mindicador', valor: 41098.15 });
    expect(registro('warn')).toEqual([
      { job: 'indicadores.uf', job_id: 'j2', fuente: 'boostr', motivo: 'http_500' },
    ]);
    expect(todoElLog()).not.toContain('41098');
  });

  it('ambas fallan: sin_fuente, ninguna fila nueva y un error sin el valor ni el cuerpo', async () => {
    const f = porUrl(
      () =>
        resp({ status: 'success', data: { date: hoyEnSantiago(), value: 41098.15 }, x: 1 }, 503),
      () => resp('<html>cuerpo-externo-41098</html>', 200, { 'Content-Type': 'text/html' }),
    );
    const r = await ejecutarActualizacionUf('j3', { fetch: f });
    expect(r).toEqual({
      estado: 'sin_fuente',
      fallos: { boostr: 'http_503', mindicador: 'tipo' },
    });
    expect(await filas()).toEqual([]);
    expect(registro('warn')).toHaveLength(2);
    const errores = registro('error');
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({
      job: 'indicadores.uf',
      fallos: { boostr: 'http_503', mindicador: 'tipo' },
    });
    expect(todoElLog()).not.toContain('41098');
    expect(todoElLog()).not.toContain('cuerpo-externo');
  });

  it('Boostr con la fecha de ayer: se guarda bajo ayer y la siguiente ejecución vuelve a consultar', async () => {
    const ayer = diaDesplazado(-1);
    const f = porUrl(
      () => resp(cuerpoBoostr(41000, ayer)),
      () => resp({}, 500),
    );
    expect(await ejecutarActualizacionUf(undefined, { fetch: f })).toEqual({
      estado: 'actualizada',
      fuente: 'boostr',
      fecha: ayer,
    });
    expect(await filas()).toEqual([{ fecha: ayer, valor: 41000, fuente: 'boostr' }]);
    // sigue sin fila de hoy: consulta de nuevo; la fila de ayer ya existe
    expect(await ejecutarActualizacionUf(undefined, { fetch: f })).toMatchObject({
      estado: 'ya_existia',
    });
    expect(vi.mocked(f)).toHaveBeenCalledTimes(2);
    expect(await filas()).toHaveLength(1);
  });

  it('fecha futura en Boostr: cae a mindicador', async () => {
    const f = porUrl(
      () => resp(cuerpoBoostr(41098.15, diaDesplazado(1))),
      () => resp(cuerpoMindicador()),
    );
    const r = await ejecutarActualizacionUf(undefined, { fetch: f });
    expect(r).toMatchObject({ estado: 'actualizada', fuente: 'mindicador' });
    expect(registro('warn')[0]).toMatchObject({ fuente: 'boostr', motivo: 'fecha' });
  });

  it.each([
    ['value 1', () => resp(cuerpoBoostr(1)), 'rango'],
    ['HTML', () => resp('<html>', 200, { 'Content-Type': 'text/html' }), 'tipo'],
    ['JSON truncado', () => resp('{"status"'), 'json'],
    ['70 KB', () => resp('{"x":"' + 'a'.repeat(70_000) + '"}'), 'tamano'],
    ['status error', () => resp({ status: 'error' }), 'estado'],
  ])('Boostr %s: motivo %s y no guarda nada de esa fuente', async (_n, b, motivo) => {
    const f = porUrl(b, () => resp({}, 500));
    const r = await ejecutarActualizacionUf(undefined, { fetch: f });
    expect(r).toMatchObject({ estado: 'sin_fuente', fallos: { boostr: motivo } });
    expect(await filas()).toEqual([]);
  });

  it('timeout simulado → motivo timeout; redirección simulada → motivo redireccion', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === URL_BOOSTR) throw new DOMException('agotado', 'TimeoutError');
      throw new TypeError('fetch failed: unexpected redirect');
    }) as unknown as Doble;
    expect(await ejecutarActualizacionUf(undefined, { fetch: f })).toEqual({
      estado: 'sin_fuente',
      fallos: { boostr: 'timeout', mindicador: 'redireccion' },
    });
  });

  it('dos valores distintos para la misma fecha: ya_existia y la fila no cambia', async () => {
    // Otra instancia insertó la fila de hoy entre la comprobación y el INSERT
    const f = vi.fn(async () => {
      await crearIndicadorUf({ valor: 40000, fuente: 'mindicador' });
      return resp(cuerpoBoostr(41098.15));
    }) as unknown as Doble;
    const r = await ejecutarActualizacionUf(undefined, { fetch: f });
    expect(r).toMatchObject({ estado: 'ya_existia', fuente: 'boostr' });
    expect(await filas()).toEqual([{ fecha: hoyEnSantiago(), valor: 40000, fuente: 'mindicador' }]);
  });

  it('un error de base de datos se propaga', async () => {
    const f = porUrl(
      () => resp(cuerpoBoostr()),
      () => resp({}, 500),
    );
    const espia = vi.spyOn(dataSource, 'query').mockRejectedValueOnce(new Error('bd caída'));
    try {
      await expect(ejecutarActualizacionUf(undefined, { fetch: f })).rejects.toThrow('bd caída');
    } finally {
      espia.mockRestore();
    }
    expect(registro('error')[0]).toMatchObject({ job: 'indicadores.uf' });
  });

  it('sin doble, la guarda de tests impide usar el fetch real', async () => {
    await expect(ejecutarActualizacionUf()).rejects.toThrow('los tests no consultan');
  });
});

describe('registrarUf', () => {
  it('fuente manual viola el CHECK (solo vive en cotizacion)', async () => {
    await expect(
      registrarUf(dataSource.manager, {
        fecha: hoyEnSantiago(),
        valor: 41098.15,
        fuente: 'manual' as never,
      }),
    ).rejects.toThrow();
  });

  it('inserta una vez y no actualiza una fila existente', async () => {
    const m = dataSource.manager;
    const fecha = hoyEnSantiago();
    expect(await registrarUf(m, { fecha, valor: 41000, fuente: 'boostr' })).toBe(true);
    expect(await registrarUf(m, { fecha, valor: 42000, fuente: 'mindicador' })).toBe(false);
    expect(await filas()).toEqual([{ fecha, valor: 41000, fuente: 'boostr' }]);
  });
});
