import type { ZodIssue } from 'zod';
import { ErrorApi } from '@/lib/api';

// Cadena vacía → null (los campos opcionales de los esquemas son `nullable`).
export const nuloSiVacio = (v: string): string | null => (v.trim() === '' ? null : v.trim());

const MENSAJES_POR_CAMPO: Record<string, string> = {
  fecha_limite: 'La fecha límite debe ser posterior al inicio planificado',
  solicitante_correo: 'Escribe un correo válido',
  solicitante_nombre: 'Escribe un nombre de hasta 120 caracteres',
  asunto: 'Escribe el asunto (hasta 200 caracteres)',
  descripcion: 'La descripción es demasiado larga',
  horas_estimadas: 'Usa múltiplos de 0,25 (p. ej. 1,5)',
};

/** Mensaje en español de un error de Zod, por campo (los de Zod vienen en inglés). */
export function mensajeDeCampo(campo: string, issue: ZodIssue): string {
  return MENSAJES_POR_CAMPO[campo] ?? issue.message;
}

/** `detalles` de una respuesta 400 `VALIDACION` → primer mensaje por campo. */
export function erroresDeApi(err: unknown): Record<string, string> | null {
  if (!(err instanceof ErrorApi) || err.codigo !== 'VALIDACION' || !err.detalles) return null;
  const crudo =
    (err.detalles['fieldErrors'] as Record<string, unknown> | undefined) ?? err.detalles;
  const salida: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(crudo)) {
    const mensaje = Array.isArray(valor) ? valor[0] : valor;
    if (typeof mensaje === 'string') salida[campo] = mensaje;
  }
  return Object.keys(salida).length > 0 ? salida : null;
}
