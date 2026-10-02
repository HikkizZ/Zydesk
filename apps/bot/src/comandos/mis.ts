import type { Bot } from 'grammy';
import { ETIQUETA_ESTADO_TICKET, ETIQUETA_PRIORIDAD } from '@zydesk/shared';
import type { TicketResumenDatos } from '../api/cliente.js';
import { enlace, escaparHtml, fechaCorta, recortar } from '../formato.js';
import { conSesion, responder, type Deps } from '../nucleo.js';

const POR_PAGINA = 10;

export function lineaTicket(t: TicketResumenDatos): string {
  const partes = [
    t.codigo,
    ETIQUETA_PRIORIDAD[t.prioridad],
    ETIQUETA_ESTADO_TICKET[t.estado],
    ...(t.fecha_limite ? [`vence ${fechaCorta(t.fecha_limite)}`] : []),
    recortar(t.asunto, 60),
  ];
  return partes.map(escaparHtml).join(' · ');
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
      const lineas = r.datos.slice(0, POR_PAGINA).map(lineaTicket);
      const mas = r.total - lineas.length;
      if (mas > 0) {
        lineas.push(
          `y ${mas} más · ${enlace(deps.webUrl, '/tickets/tabla?solo_mios=true', 'ver todos')}`,
        );
      }
      await responder(ctx, ['<b>Tus tickets</b>', ...lineas].join('\n'));
    }),
  );
}
