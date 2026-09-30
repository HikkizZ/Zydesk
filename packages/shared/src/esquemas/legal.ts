import { z } from 'zod';

export const DocumentoLegalSalida = z.object({
  clave: z.enum(['terminos', 'privacidad']),
  version: z.string(),
  titulo: z.string(),
  contenido_md: z.string(),
  borrador: z.boolean(),
});

export type DocumentoLegalSalidaDatos = z.infer<typeof DocumentoLegalSalida>;
