import type { Bot } from 'grammy';
import {
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_TICKET,
  ETIQUETA_ETAPA_OT,
  ETIQUETA_PRIORIDAD,
} from '@zydesk/shared';
import type { MensajeDatos, TicketDatos } from '../api/cliente.js';
import { enlace, escaparHtml, fechaCorta, recortar } from '../formato.js';
import { conSesion, responder, type Deps } from '../nucleo.js';

/** `1048`, `TK-1048` o `tk1048` → 1048. */
export function numeroDeTicket(argumento: string): number | null {
  const m = /^(?:tk-?)?(\d{1,9})$/i.exec(argumento.trim());
  return m?.[1] ? Number(m[1]) : null;
}

export function formatearFicha(
  t: TicketDatos,
  seguimientos: MensajeDatos[],
  webUrl: string,
): string {
  const estado =
    ETIQUETA_ESTADO_TICKET[t.estado] +
    (t.espera_de ? ` (esperando ${ETIQUETA_ESPERA_DE[t.espera_de]})` : '');
  const lineas = [
    `<b>${escaparHtml(t.codigo)}</b> · ${escaparHtml(t.asunto)}`,
    `Estado: ${escaparHtml(estado)}`,
    `Prioridad: ${ETIQUETA_PRIORIDAD[t.prioridad]}`,
    `Cliente: ${t.cliente ? escaparHtml(t.cliente.nombre) : '—'}`,
    `Responsables: ${t.responsables.length ? t.responsables.map((r) => escaparHtml(r.nombre)).join(', ') : 'sin asignar'}`,
    `Vence: ${t.fecha_limite ? fechaCorta(t.fecha_limite) : '—'}`,
  ];
  if (t.ots.length > 0) {
    lineas.push(
      `OT: ${t.ots.map((o) => `${escaparHtml(o.codigo)} (${ETIQUETA_ETAPA_OT[o.etapa]})`).join(', ')}`,
    );
  }
  // Solo seguimientos: nunca notas internas, aunque la API devolviera otras
  const ultimos = seguimientos
    .filter((m) => m.tipo === 'seguimiento')
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .slice(-3);
  if (ultimos.length > 0) {
    lineas.push('', '<b>Últimos seguimientos</b>');
    for (const m of ultimos) {
      const autor = m.autor?.nombre ?? 'Sistema';
      lineas.push(
        `• ${escaparHtml(autor)} · ${fechaCorta(m.creado_en)} · ${escaparHtml(recortar(m.texto, 120))}`,
      );
    }
  }
  lineas.push(enlace(webUrl, `/tickets/${t.id}`, 'Abrir en la web'));
  return lineas.join('\n');
}

export function registrarTicket(bot: Bot, deps: Deps): void {
  bot.command('ticket', (ctx) =>
    conSesion(ctx, deps, 'ticket', async (sesion) => {
      const numero = numeroDeTicket(ctx.match);
      if (numero === null) {
        await responder(ctx, 'Indica el ticket: /ticket 1048');
        return;
      }
      const noEncontrado = () => responder(ctx, `No encuentro TK-${numero}`);
      const r = await deps.api.listarTickets(sesion.token, {
        q: String(numero),
        archivados: true,
        por_pagina: 1,
      });
      const hallado = r.datos[0];
      if (!hallado || hallado.numero !== numero) {
        await noEncontrado();
        return;
      }
      const ticket = await deps.api.ticket(sesion.token, hallado.id);
      const seguimientos = await deps.api.seguimientos(sesion.token, hallado.id);
      await responder(ctx, formatearFicha(ticket, seguimientos, deps.webUrl));
    }),
  );
}
