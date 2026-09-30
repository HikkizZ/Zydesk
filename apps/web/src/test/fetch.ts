import { vi } from 'vitest';

export function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface Llamada {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

type Manejador = (llamada: Llamada) => Response | Promise<Response> | undefined;

// Simula `fetch`: cada manejador recibe la llamada y responde o devuelve `undefined` para seguir al
// siguiente. Sin respuesta → 404. Devuelve la lista de llamadas para afirmar sobre ellas.
export function simularFetch(...manejadores: Manejador[]): Llamada[] {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const cuerpoCrudo = init?.body;
      let cuerpo: unknown = cuerpoCrudo;
      if (typeof cuerpoCrudo === 'string') {
        try {
          cuerpo = JSON.parse(cuerpoCrudo);
        } catch {
          cuerpo = cuerpoCrudo;
        }
      }
      const llamada: Llamada = {
        metodo: init?.method ?? 'GET',
        ruta: typeof entrada === 'string' ? entrada : entrada.toString(),
        cuerpo,
      };
      llamadas.push(llamada);
      for (const m of manejadores) {
        const r = await m(llamada);
        if (r) return r;
      }
      return respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado' } });
    }),
  );
  return llamadas;
}
