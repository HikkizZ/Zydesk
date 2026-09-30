import fs from 'node:fs';
import msgreaderCjs from '@kenjiuno/msgreader';
import { ErrorApp } from '../../core/errores/error-app.js';
import {
  correoIlegible,
  fechaValida,
  htmlATexto,
  normalizarCuerpo,
  type CorreoLeido,
} from './tipos.js';

// Paquete CJS: bajo ESM la clase llega como `.default` del módulo importado por defecto.
const MsgReader = msgreaderCjs.default;

function abrir(contenido: Buffer): InstanceType<typeof MsgReader> {
  const ab = contenido.buffer.slice(
    contenido.byteOffset,
    contenido.byteOffset + contenido.byteLength,
  ) as ArrayBuffer;
  return new MsgReader(ab);
}

const conCorreo = (nombre?: string, correo?: string): string | null => {
  if (nombre && correo) return nombre === correo ? correo : `${nombre} <${correo}>`;
  return nombre || correo || null;
};

// ¿Es un .msg que la librería logra abrir? (spec fase-2 §2: `x-cfb` solo se acepta así)
export async function msgLegible(ruta: string): Promise<boolean> {
  try {
    const datos = abrir(await fs.promises.readFile(ruta)).getFileData();
    return !datos.error;
  } catch {
    return false;
  }
}

export async function leerMsg(ruta: string): Promise<CorreoLeido> {
  try {
    const lector = abrir(await fs.promises.readFile(ruta));
    const datos = lector.getFileData();
    if (datos.error) throw correoIlegible();
    const para =
      (datos.recipients ?? [])
        .filter((r) => r.recipType === undefined || r.recipType === 'to')
        .map((r) => conCorreo(r.name, r.email))
        .filter(Boolean)
        .join(', ') || null;
    const cuerpo = datos.body?.trim()
      ? datos.body
      : datos.bodyHtml
        ? htmlATexto(datos.bodyHtml)
        : '';
    const visibles = (datos.attachments ?? []).filter((a) => !a.attachmentHidden);
    return {
      origen: 'msg',
      de: conCorreo(datos.senderName, datos.senderEmail),
      para,
      fecha: fechaValida(datos.messageDeliveryTime),
      asunto: datos.subject?.trim() || null,
      cuerpo_texto: normalizarCuerpo(cuerpo),
      adjuntos: visibles.map((a, indice) => ({
        indice,
        nombre: a.fileName ?? a.fileNameShort ?? `adjunto-${indice + 1}`,
        tamano: a.contentLength ?? 0,
        tipo_mime: a.attachMimeTag ?? 'application/octet-stream',
        contenido: () => {
          const adjunto = lector.getAttachment(a);
          return Promise.resolve(Buffer.from(adjunto.content));
        },
      })),
    };
  } catch (err) {
    if (err instanceof ErrorApp) throw err;
    throw correoIlegible();
  }
}
