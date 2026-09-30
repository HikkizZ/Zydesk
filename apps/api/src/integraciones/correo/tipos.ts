import { convert } from 'html-to-text';
import { ErrorApp } from '../../core/errores/error-app.js';

export interface CorreoLeido {
  origen: 'eml' | 'msg' | 'texto';
  de: string | null;
  para: string | null;
  fecha: Date | null;
  asunto: string | null;
  cuerpo_texto: string;
  adjuntos: Array<{
    indice: number;
    nombre: string;
    tamano: number;
    tipo_mime: string;
    contenido: () => Promise<Buffer>;
  }>;
}

export const MAX_CUERPO = 20_000;

// `\r\n` → `\n`, sin espacios finales y como máximo 20 000 caracteres (se corta con "…").
export function normalizarCuerpo(texto: string): string {
  const limpio = texto.replace(/\r\n?/g, '\n').trimEnd();
  return limpio.length > MAX_CUERPO ? `${limpio.slice(0, MAX_CUERPO - 1)}…` : limpio;
}

export function htmlATexto(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}

export function correoIlegible(): ErrorApp {
  return new ErrorApp('CORREO_ILEGIBLE', 'No se pudo leer el correo; pega el texto');
}

export function fechaValida(valor: string | Date | undefined | null): Date | null {
  if (!valor) return null;
  const f = valor instanceof Date ? valor : new Date(Date.parse(valor));
  return Number.isNaN(f.getTime()) ? null : f;
}
