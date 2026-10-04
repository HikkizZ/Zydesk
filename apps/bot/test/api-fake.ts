export type RespuestaFalsa = { status: number; body?: unknown };
export type Peticion = {
  metodo: string;
  ruta: string;
  query: Record<string, string>;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
};
type Entrada = RespuestaFalsa | ((p: Peticion) => RespuestaFalsa);

/** API de Zydesk doblada: tabla `'GET /api/mi-dia' → respuesta` y registro de las peticiones. */
export function crearFetchFalso(tabla: Record<string, Entrada>) {
  const peticiones: Peticion[] = [];
  const fetchFalso = (async (entrada: URL | string, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const cabeceras: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      cabeceras[k] = v;
    });
    const p: Peticion = {
      metodo: init?.method ?? 'GET',
      ruta: url.pathname,
      query: Object.fromEntries(url.searchParams),
      cabeceras,
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    peticiones.push(p);
    const e = tabla[`${p.metodo} ${p.ruta}`];
    const r: RespuestaFalsa = e
      ? typeof e === 'function'
        ? e(p)
        : e
      : { status: 404, body: { error: { codigo: 'NO_ENCONTRADO', mensaje: 'sin ruta falsa' } } };
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? null), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fetchFalso, peticiones };
}

export const errorApi = (status: number, codigo: string, mensaje = 'mensaje de la API') => ({
  status,
  body: { error: { codigo, mensaje } },
});

/**
 * `GET /api/tickets` con la semántica real de la API: `archivados=true` devuelve SOLO archivados;
 * `false` o ausente, solo los no archivados; `q` con solo dígitos filtra por número exacto.
 */
export function listadoTicketsFalso(tickets: { numero: number; archivado_en?: string | null }[]) {
  return (p: Peticion): RespuestaFalsa => {
    const soloArchivados = p.query['archivados'] === 'true';
    const q = p.query['q'];
    const datos = tickets.filter(
      (t) =>
        (t.archivado_en != null) === soloArchivados &&
        (q === undefined || !/^\d+$/.test(q) || t.numero === Number(q)),
    );
    return { status: 200, body: { datos, total: datos.length, pagina: 1, por_pagina: 10 } };
  };
}
