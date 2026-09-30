import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DocumentoLegalSalidaDatos } from '@zydesk/shared';

type Clave = DocumentoLegalSalidaDatos['clave'];

// Misma raíz que `.env` (repo). En Fase 9 el Dockerfile copia `docs/legal` a esa ruta relativa.
const DIRECTORIO = new URL('../../../../../docs/legal/', import.meta.url);

const ARCHIVOS: Record<Clave, string> = {
  terminos: 'terminos-de-uso.md',
  privacidad: 'politica-de-privacidad.md',
};

// Front matter a mano: `---`, líneas `clave: valor`, `---`.
export function parsearDocumento(clave: Clave, texto: string): DocumentoLegalSalidaDatos {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(limpio);
  if (!m) throw new Error(`Documento legal sin front matter: ${clave}`);
  const meta: Record<string, string> = {};
  for (const linea of (m[1] ?? '').split('\n')) {
    const i = linea.indexOf(':');
    if (i > 0) meta[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  const version = meta['version'] ?? '';
  if (version === '') throw new Error(`Documento legal sin version: ${clave}`);
  return {
    clave,
    version,
    titulo: meta['titulo'] ?? '',
    contenido_md: (m[2] ?? '').trim(),
    borrador: meta['borrador'] === 'true',
  };
}

type Documentos = Record<Clave, DocumentoLegalSalidaDatos>;
let documentos: Documentos | null = null;

// Se lee una vez al arrancar; si falta un archivo o la versión está vacía, lanza (server.ts sale con 1).
export function cargarLegal(directorio: URL = DIRECTORIO): Documentos {
  const leer = (clave: Clave) =>
    parsearDocumento(
      clave,
      readFileSync(fileURLToPath(new URL(ARCHIVOS[clave], directorio)), 'utf8'),
    );
  documentos = { terminos: leer('terminos'), privacidad: leer('privacidad') };
  return documentos;
}

export function documentoLegal(clave: Clave): DocumentoLegalSalidaDatos {
  return (documentos ?? cargarLegal())[clave];
}

// Versión vigente = `version` de terminos-de-uso.md
export function versionTerminosVigente(): string {
  return documentoLegal('terminos').version;
}
