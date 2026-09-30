import { z } from 'zod';
import { ArchivoSalida } from './archivo.js';
import { id, instante } from './comunes.js';

export const CorreoParsearEntrada = z.union([
  z.object({ archivo_id: id }),
  z.object({ texto: z.string().trim().min(1).max(200_000) }),
]);

export const AdjuntoCorreo = z.object({
  indice: z.number().int().min(0),
  nombre: z.string(),
  tamano: z.number(),
  tipo_mime: z.string(),
  permitido: z.boolean(), // pasa la lista MIME y ≤ 20 MB
});

export const CorreoParseadoSalida = z.object({
  origen: z.enum(['eml', 'msg', 'texto']),
  de: z.string().nullable(),
  para: z.string().nullable(),
  fecha: instante.nullable(),
  asunto: z.string().nullable(),
  cuerpo_texto: z.string(),
  adjuntos: z.array(AdjuntoCorreo),
  solicitante_sugerido: z.object({ nombre: z.string().nullable(), correo: z.string().nullable() }),
});

export const CorreoAdjuntoSalida = z.object({
  id,
  origen: z.enum(['eml', 'msg', 'texto']),
  de: z.string().nullable(),
  para: z.string().nullable(),
  fecha: instante.nullable(),
  asunto: z.string().nullable(),
  cuerpo: z.string(),
  archivo: ArchivoSalida.nullable(),
  adjuntos: z.array(ArchivoSalida), // extraídos
});
