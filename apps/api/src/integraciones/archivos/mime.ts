import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import fs from 'node:fs';
import path from 'node:path';
import type { CategoriaArchivo } from '@zydesk/shared';
import { ErrorApp } from '../../core/errores/error-app.js';

export const MAX_TAMANO_ARCHIVO = 20 * 1024 * 1024;
export const MAX_ARCHIVOS_POR_PETICION = 10;

export const MIME_PERMITIDOS: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'message/rfc822',
  'application/vnd.ms-outlook',
  'text/plain',
  'text/csv',
]);

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
};

// Tipos sin firma binaria: se aceptan solo por la extensión declarada y contenido textual.
const MIME_TEXTO_POR_EXT: Record<string, string> = {
  '.eml': 'message/rfc822',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

// `.msg` y los formatos Office antiguos son contenedores CFB (file-type informa `application/x-cfb`).
const MIME_CFB_POR_EXT: Record<string, string> = {
  '.msg': 'application/vnd.ms-outlook',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
};

export interface MimeDetectado {
  tipo_mime: string;
  // con punto y en minúsculas; sale de la lista permitida, nunca del nombre del usuario sin validar
  ext: string;
}

function noPermitido(nombre: string): ErrorApp {
  return new ErrorApp('ARCHIVO_NO_PERMITIDO', 'Tipo de archivo no permitido', { nombre });
}

function extensionDe(nombre: string): string {
  return path.extname(nombre).toLowerCase();
}

function clasificar(
  detectado: { mime: string } | undefined,
  nombre: string,
  cabeza: Buffer,
): MimeDetectado {
  const ext = extensionDe(nombre);
  if (detectado) {
    if (detectado.mime === 'application/x-cfb') {
      const mime = MIME_CFB_POR_EXT[ext];
      if (mime) return { tipo_mime: mime, ext };
      throw noPermitido(nombre);
    }
    const extMime = EXT_POR_MIME[detectado.mime];
    if (!MIME_PERMITIDOS.has(detectado.mime) || !extMime) throw noPermitido(nombre);
    return { tipo_mime: detectado.mime, ext: extMime };
  }
  const mimeTexto = MIME_TEXTO_POR_EXT[ext];
  // Latin-1 decodifica cualquier secuencia de bytes: lo que descarta al binario es el byte nulo.
  if (!mimeTexto || cabeza.subarray(0, 8192).includes(0)) throw noPermitido(nombre);
  return { tipo_mime: mimeTexto, ext };
}

export async function detectarMime(
  rutaTemporal: string,
  nombreOriginal: string,
): Promise<MimeDetectado> {
  const detectado = await fileTypeFromFile(rutaTemporal);
  const fd = await fs.promises.open(rutaTemporal, 'r');
  try {
    const cabeza = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(cabeza, 0, cabeza.length, 0);
    return clasificar(detectado, nombreOriginal, cabeza.subarray(0, bytesRead));
  } finally {
    await fd.close();
  }
}

// Misma regla para contenido en memoria (adjuntos extraídos de un correo).
export async function detectarMimeBuffer(
  contenido: Buffer,
  nombreOriginal: string,
): Promise<MimeDetectado> {
  return clasificar(await fileTypeFromBuffer(contenido), nombreOriginal, contenido);
}

// Vista previa del correo: solo se conoce el nombre y el tamaño del adjunto (el contenido se verifica al extraer).
export function permitidoPorExtension(nombre: string, tamano: number): boolean {
  if (tamano <= 0 || tamano > MAX_TAMANO_ARCHIVO) return false;
  const ext = extensionDe(nombre);
  return (
    Object.values(EXT_POR_MIME).includes(ext) ||
    ext === '.jpeg' ||
    ext in MIME_TEXTO_POR_EXT ||
    ext in MIME_CFB_POR_EXT
  );
}

export function categoriaDe(mime: string): CategoriaArchivo {
  if (mime.startsWith('image/')) return 'foto';
  if (mime === 'message/rfc822' || mime === 'application/vnd.ms-outlook') return 'correo';
  return 'documento';
}
