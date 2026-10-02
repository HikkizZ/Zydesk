import type { Context } from 'grammy';
import { conSesion, responder, type Deps } from '../nucleo.js';
import { escaparHtml } from '../formato.js';

const MAX_TEXTO = 20_000;

/** Primer `TK-####` / `OT-####` del texto del aviso citado. */
export function codigoDeAviso(
  texto: string,
): { entidad: 'ticket' | 'ot'; numero: number; codigo: string } | null {
  const m = /\b(TK|OT)-(\d+)/i.exec(texto);
  if (!m?.[1] || !m[2]) return null;
  const prefijo = m[1].toUpperCase();
  return {
    entidad: prefijo === 'TK' ? 'ticket' : 'ot',
    numero: Number(m[2]),
    codigo: `${prefijo}-${m[2]}`,
  };
}

export async function responderAviso(
  ctx: Context,
  deps: Deps,
  citado: string,
  texto: string,
): Promise<void> {
  await conSesion(ctx, deps, 'responder_aviso', async (sesion) => {
    const destino = codigoDeAviso(citado);
    if (!destino) {
      await responder(ctx, 'Responde a un aviso de un ticket u OT para registrar un seguimiento.');
      return;
    }
    // El código solo identifica el destino; la API autoriza con el Bearer de la persona.
    const hallado =
      destino.entidad === 'ticket'
        ? await deps.api.buscarTicket(sesion.token, destino.numero)
        : await deps.api.buscarOt(sesion.token, destino.numero);
    if (!hallado) {
      await responder(ctx, `No encuentro ${escaparHtml(destino.codigo)}.`);
      return;
    }
    const recortado = texto.length > MAX_TEXTO;
    await deps.api.crearMensaje(
      sesion.token,
      destino.entidad,
      hallado.id,
      recortado ? texto.slice(0, MAX_TEXTO) : texto,
    );
    await responder(
      ctx,
      `Seguimiento registrado en ${escaparHtml(hallado.codigo)}` +
        (recortado ? ' (el texto se recortó a 20 000 caracteres)' : ''),
    );
  });
}
