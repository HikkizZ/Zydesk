import { z } from 'zod';
import { CATEGORIAS_ARCHIVO } from '../enums/ticket.js';
import { id, instante, referencia } from './comunes.js';

export const ArchivoSalida = z.object({
  id,
  nombre_original: z.string().max(255),
  tipo_mime: z.string(),
  tamano: z.number(),
  categoria: z.enum(CATEGORIAS_ARCHIVO),
  url: z.string(), // /api/archivos/:id
  es_imagen: z.boolean(),
  subido_por: referencia.nullable(),
  subido_en: instante,
  origen_correo: z.boolean(),
});

// GET /api/archivos/pendientes no lleva query
export const ArchivosPendientesQuery = z.object({});
