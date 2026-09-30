import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ZodError } from 'zod';

const formatoDia = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const formatoDiaAnio = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// `fecha` es AAAA-MM-DD (sin zona): se formatea en UTC para no correrla de día.
export const formatearDia = (fecha: string) => formatoDia.format(new Date(`${fecha}T00:00:00Z`));
export const formatearDiaAnio = (fecha: string) =>
  formatoDiaAnio.format(new Date(`${fecha}T00:00:00Z`));

export const formatearHoras = (h: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(h);

// Cadena vacía → null (los campos opcionales de los esquemas son `nullable`, no `optional`).
export const nuloSiVacio = (v: string) => (v.trim() === '' ? null : v);

// Pasa los errores de un esquema Zod a los campos del formulario.
export function errorZodACampos<T extends FieldValues>(
  error: ZodError,
  setError: UseFormSetError<T>,
) {
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string') setError(campo as Path<T>, { message: issue.message });
  }
}
