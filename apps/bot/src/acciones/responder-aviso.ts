import type { Context } from 'grammy';
import { conSesion, responder, type Deps } from '../nucleo.js';
import { escaparHtml } from '../formato.js';

const MAX_TEXTO = 20_000;

export type EntidadTelegram = { type: string; offset: number; length: number };

const CODIGO_COMPLETO = /^(TK|OT)-(\d+)$/i;

/**
 * Destino de la respuesta: la entidad **negrita** del mensaje citado cuyo texto completo es un código
 * `TK-####` / `OT-####`. El servidor pone en negrita el código real y escapa el texto de las personas,
 * así que un título como «OT-77 revisar» no puede desviar el seguimiento. Si hay varios códigos
 * distintos (p. ej. la lista de `/mis`) no se elige ninguno. Los offsets de Telegram son UTF-16, igual
 * que `String.prototype.slice`.
 */
export function codigoDeAviso(
  texto: string,
  entidades: readonly EntidadTelegram[] = [],
): { entidad: 'ticket' | 'ot'; numero: number; codigo: string } | null {
  const codigos = new Set<string>();
  for (const e of entidades) {
    if (e.type !== 'bold') continue;
    const m = CODIGO_COMPLETO.exec(texto.slice(e.offset, e.offset + e.length));
    if (m?.[1] && m[2]) codigos.add(`${m[1].toUpperCase()}-${Number(m[2])}`);
  }
  if (codigos.size !== 1) return null;
  const [codigo] = [...codigos] as [string];
  const [prefijo, numero] = codigo.split('-') as [string, string];
  return { entidad: prefijo === 'TK' ? 'ticket' : 'ot', numero: Number(numero), codigo };
}

export async function responderAviso(
  ctx: Context,
  deps: Deps,
  citado: string,
  entidades: readonly EntidadTelegram[],
  texto: string,
): Promise<void> {
  await conSesion(ctx, deps, 'responder_aviso', async (sesion) => {
    const destino = codigoDeAviso(citado, entidades);
    if (!destino) {
      await responder(
        ctx,
        'Responde a un aviso o a la ficha de /ticket para registrar un seguimiento.',
      );
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
