import type { z } from 'zod';
import {
  BotVincularSalida,
  type BotVincularEntrada,
  type MensajeSalida,
  type MiDiaSalida,
  type OtSalida,
  type TicketSalida,
  type TicketResumen,
  type YoSalida,
} from '@zydesk/shared';

export type MiDia = z.infer<typeof MiDiaSalida>;
export type TicketResumenDatos = z.infer<typeof TicketResumen>;
export type TicketDatos = z.infer<typeof TicketSalida>;
export type MensajeDatos = z.infer<typeof MensajeSalida>;
export type OtDatos = z.infer<typeof OtSalida>;
export type YoDatos = z.infer<typeof YoSalida>;
export type VincularSalida = z.infer<typeof BotVincularSalida>;
export type VincularEntrada = z.input<typeof BotVincularEntrada>;
export type Pagina<T> = { datos: T[]; total: number; pagina: number; por_pagina: number };
export type OtBusqueda = { id: number; numero: number; codigo: string };
type Query = Record<string, string | number | boolean>;

/** Error de la API (`{ error: { codigo, mensaje, detalles? } }`) o fallo de red/timeout (status 0, `NO_DISPONIBLE`). */
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    readonly mensajeApi: string,
    readonly detalles?: unknown,
  ) {
    super(`${status} ${codigo}`);
    this.name = 'ErrorApi';
  }

  get noDisponible(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** Primer error de `detalles` (400 `VALIDACION`). */
  primerDetalle(): string | null {
    const d = this.detalles;
    if (typeof d === 'string') return d;
    const mensajeDe = (p: unknown): string | null => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        if (typeof o['mensaje'] === 'string') return o['mensaje'];
        if (typeof o['message'] === 'string') return o['message'];
      }
      return null;
    };
    if (Array.isArray(d)) return mensajeDe(d[0]);
    if (d && typeof d === 'object') {
      const primero = Object.values(d)[0];
      return Array.isArray(primero) ? mensajeDe(primero[0]) : mensajeDe(primero);
    }
    return null;
  }
}

type Fetch = typeof fetch;
type Pedido = {
  cabeceras: Record<string, string>;
  query?: Query;
  cuerpo?: unknown;
};

export class ClienteZydesk {
  private readonly baseUrl: string;
  private readonly botKey: string;
  private readonly fetch: Fetch;
  private readonly timeoutMs: number;

  constructor(opciones: { apiUrl: string; botKey: string; fetch?: Fetch; timeoutMs?: number }) {
    this.baseUrl = opciones.apiUrl.replace(/\/+$/, '');
    this.botKey = opciones.botKey;
    this.fetch = opciones.fetch ?? fetch;
    this.timeoutMs = opciones.timeoutMs ?? 10_000;
  }

  // Única llamada con X-Bot-Key (PLAN §6); el resto va con el Bearer de la persona.
  async vincular(entrada: VincularEntrada): Promise<VincularSalida> {
    const r = await this.pedir('POST', '/api/bot/vincular', {
      cabeceras: { 'X-Bot-Key': this.botKey },
      cuerpo: entrada,
    });
    return BotVincularSalida.parse(r);
  }

  yo(token: string): Promise<YoDatos> {
    return this.con<YoDatos>('GET', '/api/yo', token);
  }

  miDia(token: string): Promise<MiDia> {
    return this.con<MiDia>('GET', '/api/mi-dia', token);
  }

  listarTickets(token: string, query: Query): Promise<Pagina<TicketResumenDatos>> {
    return this.con('GET', '/api/tickets', token, { query });
  }

  listarOts(token: string, query: Query): Promise<Pagina<OtBusqueda>> {
    return this.con('GET', '/api/ots', token, { query });
  }

  /**
   * Resuelve `TK-<numero>`: en la API `archivados=true` es SOLO archivados, así que primero busca
   * entre los activos y, si no hay coincidencia exacta de `numero`, entre los archivados.
   */
  async buscarTicket(token: string, numero: number): Promise<TicketResumenDatos | null> {
    for (const archivados of [false, true]) {
      const r = await this.listarTickets(token, { q: String(numero), archivados, por_pagina: 5 });
      const hallado = r.datos.find((t) => t.numero === numero);
      if (hallado) return hallado;
    }
    return null;
  }

  /** Resuelve `OT-<numero>` (el listado de OT no distingue archivadas). */
  async buscarOt(token: string, numero: number): Promise<OtBusqueda | null> {
    const r = await this.listarOts(token, { q: String(numero), por_pagina: 5 });
    return r.datos.find((o) => o.numero === numero) ?? null;
  }

  ticket(token: string, id: number): Promise<TicketDatos> {
    return this.con('GET', `/api/tickets/${id}`, token);
  }

  seguimientos(token: string, ticketId: number): Promise<MensajeDatos[]> {
    return this.con('GET', `/api/tickets/${ticketId}/mensajes`, token, {
      query: { tipo: 'seguimiento' },
    });
  }

  async crearMensaje(
    token: string,
    entidad: 'ticket' | 'ot',
    id: number,
    texto: string,
  ): Promise<void> {
    const ruta = entidad === 'ticket' ? `/api/tickets/${id}/mensajes` : `/api/ots/${id}/mensajes`;
    await this.con('POST', ruta, token, { cuerpo: { tipo: 'seguimiento', texto } });
  }

  aprobarOt(token: string, id: number): Promise<OtDatos> {
    return this.con('POST', `/api/ots/${id}/aprobar`, token, { cuerpo: { iniciar: false } });
  }

  crearTicket(token: string, cuerpo: Record<string, unknown>): Promise<TicketDatos> {
    return this.con('POST', '/api/tickets', token, { cuerpo });
  }

  async desvincular(token: string): Promise<void> {
    await this.con('DELETE', '/api/yo/telegram', token);
  }

  private con<T>(
    metodo: string,
    ruta: string,
    token: string,
    extra: { query?: Query; cuerpo?: unknown } = {},
  ): Promise<T> {
    return this.pedir(metodo, ruta, {
      cabeceras: { Authorization: `Bearer ${token}` },
      ...extra,
    }) as Promise<T>;
  }

  private async pedir(metodo: string, ruta: string, p: Pedido): Promise<unknown> {
    const url = new URL(this.baseUrl + ruta);
    for (const [k, v] of Object.entries(p.query ?? {})) url.searchParams.set(k, String(v));
    const cabeceras: Record<string, string> = { Accept: 'application/json', ...p.cabeceras };
    if (p.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    let respuesta: Response;
    try {
      respuesta = await this.fetch(url, {
        method: metodo,
        headers: cabeceras,
        ...(p.cuerpo !== undefined ? { body: JSON.stringify(p.cuerpo) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ErrorApi(0, 'NO_DISPONIBLE', 'sin respuesta');
    }
    if (respuesta.status === 204) return null;
    const texto = await respuesta.text().catch(() => '');
    let cuerpo: unknown = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = null;
    }
    if (respuesta.ok) return cuerpo;
    const e = (cuerpo as { error?: Record<string, unknown> } | null)?.error;
    throw new ErrorApi(
      respuesta.status,
      typeof e?.['codigo'] === 'string' ? e['codigo'] : 'DESCONOCIDO',
      typeof e?.['mensaje'] === 'string' ? e['mensaje'] : '',
      e?.['detalles'],
    );
  }
}
