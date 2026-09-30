import { z } from 'zod';

export const id = z.number().int().positive();
export const texto = (n: number) => z.string().trim().min(1).max(n);
export const correo = z.string().trim().toLowerCase().email().max(200);
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const fechaIso = z.string().date(); // AAAA-MM-DD
export const instante = z.string().datetime({ offset: true });
export const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
});

export const referencia = z.object({ id, nombre: z.string() });
