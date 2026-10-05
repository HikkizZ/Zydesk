import { ZONA, redondear } from '@zydesk/shared';
import { z } from 'zod';
import { env } from '../../config/env.js';

// Cliente de las fuentes públicas de la UF (spec fase-8b §5.5, ADR 0027.40): `fetch` nativo inyectable, URL fija,
// `GET` sin cookies ni datos de la instalación, `redirect: 'error'`, timeout, tope de tamaño, Zod y plausibilidad.
// Los errores llevan solo `fuente` y `motivo`: nunca el cuerpo, la URL ni el mensaje original de `fetch`.
export const URL_BOOSTR = 'https://api.boostr.cl/economy/indicator/uf.json';
export const URL_MINDICADOR = 'https://mindicador.cl/api/uf';

export type FuenteExterna = 'boostr' | 'mindicador';
export type MotivoFallo =
  | 'red'
  | 'timeout'
  | 'redireccion'
  | `http_${number}`
  | 'tipo'
  | 'tamano'
  | 'json'
  | 'formato'
  | 'rango'
  | 'fecha'
  | 'estado';

export class ErrorFuenteUf extends Error {
  constructor(
    public fuente: FuenteExterna,
    public motivo: MotivoFallo,
  ) {
    super(`${fuente}: ${motivo}`);
    this.name = 'ErrorFuenteUf';
  }
}

export type Fetch = typeof globalThis.fetch;

export interface UfObtenida {
  fecha: string;
  valor: number;
  fuente: FuenteExterna;
}

const URLS: Record<FuenteExterna, string> = { boostr: URL_BOOSTR, mindicador: URL_MINDICADOR };
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 65_536;
const VALOR_MIN = 20_000;
const VALOR_MAX = 200_000;
const DIAS_ATRASO_MAX = 7;

const RespuestaBoostr = z.object({
  status: z.literal('success'),
  data: z.object({ date: z.string().date(), value: z.number().finite() }),
});
const RespuestaMindicador = z.object({
  serie: z.array(z.object({ fecha: z.string(), valor: z.number().finite() })).min(1),
});

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA });

// Lee el cuerpo como texto con tope de tamaño (sin cargar en memoria una respuesta desmedida).
async function leerTexto(respuesta: Response, fuente: FuenteExterna): Promise<string> {
  const largo = Number(respuesta.headers.get('content-length'));
  if (Number.isFinite(largo) && largo > MAX_BYTES) throw new ErrorFuenteUf(fuente, 'tamano');
  if (!respuesta.body) {
    const texto = await respuesta.text();
    if (texto.length > MAX_BYTES) throw new ErrorFuenteUf(fuente, 'tamano');
    return texto;
  }
  const lector = respuesta.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await lector.cancel().catch(() => undefined);
        throw new ErrorFuenteUf(fuente, 'tamano');
      }
      trozos.push(value);
    }
  } catch (err) {
    if (err instanceof ErrorFuenteUf) throw err;
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    throw new ErrorFuenteUf(fuente, timeout ? 'timeout' : 'red');
  }
  return new TextDecoder().decode(Buffer.concat(trozos));
}

function clasificarErrorDeFetch(fuente: FuenteExterna, err: unknown): ErrorFuenteUf {
  // El error original puede traer la URL: se descarta y solo se clasifica
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new ErrorFuenteUf(fuente, 'timeout');
    }
    const causa = err.cause instanceof Error ? err.cause.message : '';
    if (/redirect/i.test(err.message) || /redirect/i.test(causa)) {
      return new ErrorFuenteUf(fuente, 'redireccion');
    }
  }
  return new ErrorFuenteUf(fuente, 'red');
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function extraer(fuente: FuenteExterna, json: unknown): { fecha: string; valor: number } {
  if (fuente === 'boostr') {
    if (
      typeof json === 'object' &&
      json !== null &&
      'status' in json &&
      (json as { status: unknown }).status !== 'success'
    ) {
      throw new ErrorFuenteUf(fuente, 'estado');
    }
    const r = RespuestaBoostr.safeParse(json);
    if (!r.success) throw new ErrorFuenteUf(fuente, 'formato');
    return { fecha: r.data.data.date, valor: r.data.data.value };
  }
  const r = RespuestaMindicador.safeParse(json);
  if (!r.success) throw new ErrorFuenteUf(fuente, 'formato');
  const primero = r.data.serie[0]!;
  const instante = new Date(primero.fecha);
  if (Number.isNaN(instante.getTime())) throw new ErrorFuenteUf(fuente, 'formato');
  return { fecha: formatoDia.format(instante), valor: primero.valor };
}

export async function consultarFuente(
  fuente: FuenteExterna,
  hoy: string,
  fetchImpl: Fetch,
): Promise<UfObtenida> {
  if (env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch) {
    throw new Error('los tests no consultan fuentes externas');
  }
  let respuesta: Response;
  try {
    respuesta = await fetchImpl(URLS[fuente], {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw clasificarErrorDeFetch(fuente, err);
  }
  if (respuesta.status !== 200) {
    await respuesta.body?.cancel().catch(() => undefined);
    throw new ErrorFuenteUf(fuente, `http_${respuesta.status}`);
  }
  if (!/json/i.test(respuesta.headers.get('content-type') ?? '')) {
    await respuesta.body?.cancel().catch(() => undefined);
    throw new ErrorFuenteUf(fuente, 'tipo');
  }
  const texto = await leerTexto(respuesta, fuente);
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorFuenteUf(fuente, 'json');
  }
  const { fecha, valor } = extraer(fuente, json);
  if (fecha > hoy || fecha < sumarDias(hoy, -DIAS_ATRASO_MAX)) {
    throw new ErrorFuenteUf(fuente, 'fecha');
  }
  const redondeado = redondear(valor, 'UF');
  if (redondeado < VALOR_MIN || redondeado > VALOR_MAX) throw new ErrorFuenteUf(fuente, 'rango');
  return { fecha, valor: redondeado, fuente };
}

// Boostr primero y, si falla, mindicador.cl. Sin reintentos dentro de la misma ejecución (Boostr limita las peticiones).
export async function obtenerUfDelDia(
  hoy: string,
  fetchImpl: Fetch,
): Promise<
  | { ok: true; uf: UfObtenida; fallos: Partial<Record<FuenteExterna, MotivoFallo>> }
  | { ok: false; fallos: Record<FuenteExterna, MotivoFallo> }
> {
  const fallos = {} as Record<FuenteExterna, MotivoFallo>;
  for (const fuente of ['boostr', 'mindicador'] as const) {
    try {
      return { ok: true, uf: await consultarFuente(fuente, hoy, fetchImpl), fallos };
    } catch (err) {
      if (!(err instanceof ErrorFuenteUf)) throw err;
      fallos[fuente] = err.motivo;
    }
  }
  return { ok: false, fallos };
}
