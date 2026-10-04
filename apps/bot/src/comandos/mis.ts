import type { Bot } from 'grammy';
import { ETIQUETA_ESTADO_TICKET, ETIQUETA_PRIORIDAD } from '@zydesk/shared';
import type { TicketResumenDatos } from '../api/cliente.js';
import { enlace, escaparHtml, fechaCorta, recortar } from '../formato.js';
import { conSesion, responder, type Deps } from '../nucleo.js';

const POR_PAGINA = 10;

/** Dos líneas: «• <b>TK-1048</b> · Alta · En curso · vence 2 oct» y, con sangría, el asunto. */
export function itemTicket(t: TicketResumenDatos): string {
  const partes = [
    ETIQUETA_PRIORIDAD[t.prioridad],
    ETIQUETA_ESTADO_TICKET[t.estado],
    ...(t.fecha_limite ? [`vence ${fechaCorta(t.fecha_limite)}`] : []),
  ];
  return [
    `• <b>${escaparHtml(t.codigo)}</b> · ${partes.map(escaparHtml).join(' · ')}`,
    `   ${escaparHtml(recortar(t.asunto, 60))}`,
  ].join('\n');
}

export function registrarMis(bot: Bot, deps: Deps): void {
  bot.command('mis', (ctx) =>
    conSesion(ctx, deps, 'mis', async (sesion) => {
      const r = await deps.api.listarTickets(sesion.token, {
        solo_mios: true,
        archivados: false,
        orden: 'fecha_limite',
        por_pagina: POR_PAGINA,
      });
      if (r.datos.length === 0) {
        await responder(ctx, 'No tienes tickets abiertos.');
        return;
      }
      const items = r.datos.slice(0, POR_PAGINA).map(itemTicket);
      const mas = r.total - items.length;
      if (mas > 0) {
        items.push(
          `y ${mas} más · ${enlace(deps.webUrl, '/tickets/tabla?solo_mios=true', 'ver todos')}`,
        );
      }
      await responder(ctx, ['<b>Tus tickets</b>', ...items].join('\n\n'));
    }),
  );
}
