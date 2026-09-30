import fs from 'node:fs';
import { simpleParser, type AddressObject } from 'mailparser';
import {
  correoIlegible,
  fechaValida,
  htmlATexto,
  normalizarCuerpo,
  type CorreoLeido,
} from './tipos.js';

// `Nombre <correo>` sin las comillas que agrega `AddressObject.text`.
function direcciones(campo: AddressObject | AddressObject[] | undefined): string | null {
  if (!campo) return null;
  const texto = (Array.isArray(campo) ? campo : [campo])
    .flatMap((c) => c.value)
    .map((v) => (v.name && v.address ? `${v.name} <${v.address}>` : v.address || v.name))
    .filter(Boolean)
    .join(', ');
  return texto || null;
}

export async function leerEml(ruta: string): Promise<CorreoLeido> {
  let correo;
  try {
    // sin conversión propia de HTML→texto (usamos la de la spec) y sin reescribir los `cid:` a data URI
    correo = await simpleParser(await fs.promises.readFile(ruta), {
      skipHtmlToText: true,
      keepCidLinks: true,
    });
  } catch {
    throw correoIlegible();
  }
  const de = direcciones(correo.from);
  const para = direcciones(correo.to);
  const asunto = correo.subject?.trim() || null;
  const fecha = fechaValida(correo.date);
  // un .eml sin ninguna cabecera reconocible no es un correo (el parser es tolerante y lo leería como cuerpo)
  if (!de && !para && !asunto && !fecha) throw correoIlegible();

  const html = typeof correo.html === 'string' ? correo.html : '';
  const cuerpo = correo.text?.trim() ? correo.text : html ? htmlATexto(html) : '';
  // los inline referenciados desde el HTML (`cid:`) son parte del cuerpo, no adjuntos
  const propios = correo.attachments.filter((a) => {
    if (!a.contentId) return true;
    const cid = a.contentId.replace(/^<|>$/g, '');
    return !html.includes(`cid:${cid}`);
  });
  return {
    origen: 'eml',
    de,
    para,
    fecha,
    asunto,
    cuerpo_texto: normalizarCuerpo(cuerpo),
    adjuntos: propios.map((a, indice) => ({
      indice,
      nombre: a.filename ?? `adjunto-${indice + 1}`,
      tamano: a.size,
      tipo_mime: a.contentType,
      contenido: () => Promise.resolve(a.content),
    })),
  };
}
