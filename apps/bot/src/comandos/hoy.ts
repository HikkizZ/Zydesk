import type { Bot } from 'grammy';
import type { MiDia } from '../api/cliente.js';
import { enlace, escaparHtml, fechaLargaDeIso, recortar } from '../formato.js';
import { conSesion, responder, type Deps } from '../nucleo.js';

const MAX_ITEMS = 5;

function seccion(titulo: string, total: number, items: string[]): string | null {
  if (total <= 0) return null;
  const mostrados = items.slice(0, MAX_ITEMS).map(escaparHtml);
  const mas = total - mostrados.length;
  const lista = mostrados.join(', ') + (mas > 0 ? ` y ${mas} más` : '');
  return `${titulo} (${total}): ${lista}`;
}

/** Mismo formato que el resumen diario (spec fase 6 §8.2). */
export function formatearMiDia(m: MiDia, webUrl: string): string {
  const lineas = [
    seccion(
      'Vencen hoy',
      m.conteos.vencen_hoy,
      m.vencen_hoy.map((t) => `${t.codigo} ${recortar(t.asunto, 60)}`),
    ),
    seccion(
      'Vencidos',
      m.conteos.vencidos,
      m.vencidos.map((t) => `${t.codigo} ${recortar(t.asunto, 60)}`),
    ),
    seccion(
      'Por aprobar',
      m.conteos.por_aprobar,
      m.por_aprobar.map((o) => `${o.codigo} ${recortar(o.titulo, 60)}`),
    ),
    m.conteos.menciones > 0 ? `Menciones sin leer: ${m.conteos.menciones}` : null,
    seccion(
      'Tareas para hoy',
      m.conteos.tareas,
      m.tareas.map((t) => `${recortar(t.titulo, 60)} (${t.destino.codigo})`),
    ),
  ].filter((l): l is string => l !== null);
  const cabecera = `<b>Zydesk · Resumen del ${fechaLargaDeIso(m.fecha)}</b>`;
  if (lineas.length === 0) return `${cabecera}\nNada pendiente.`;
  return [cabecera, ...lineas, enlace(webUrl, '/mi-dia', 'Abrir Mi día')].join('\n');
}

export function registrarHoy(bot: Bot, deps: Deps): void {
  bot.command('hoy', (ctx) =>
    conSesion(ctx, deps, 'hoy', async (sesion) => {
      const m = await deps.api.miDia(sesion.token);
      await responder(ctx, formatearMiDia(m, deps.webUrl));
    }),
  );
}
