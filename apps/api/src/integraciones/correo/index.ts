import fs from 'node:fs';
import type { Archivo } from '../../modulos/archivos/archivo.entity.js';
import { storage } from '../storage/storage.js';
import { leerEml } from './eml.js';
import { leerMsg } from './msg.js';
import { leerTexto } from './texto.js';
import { correoIlegible, type CorreoLeido } from './tipos.js';

export { leerEml } from './eml.js';
export { leerMsg, msgLegible } from './msg.js';
export { solicitanteDesde } from './solicitante.js';
export { leerTexto } from './texto.js';
export type { CorreoLeido } from './tipos.js';

// Despacha por `tipo_mime`; cualquier fallo del parser → 400 CORREO_ILEGIBLE.
export async function leerCorreo(
  entrada: { archivo: Pick<Archivo, 'clave' | 'tipo_mime'> } | { texto: string },
): Promise<CorreoLeido> {
  if ('texto' in entrada) return leerTexto(entrada.texto);
  const ruta = storage.ruta(entrada.archivo.clave);
  switch (entrada.archivo.tipo_mime) {
    case 'message/rfc822':
      return leerEml(ruta);
    case 'application/vnd.ms-outlook':
      return leerMsg(ruta);
    case 'text/plain':
      return leerTexto(await fs.promises.readFile(ruta, 'utf8'));
    default:
      throw correoIlegible();
  }
}
