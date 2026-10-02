import { z } from 'zod';
import { ROLES } from '../enums/rol.js';
import { UsuarioBreve, instante } from './comunes.js';

// Rutas /api/bot/*, autenticadas con X-Bot-Key
export const BotVincularEntrada = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .length(8)
    .regex(/^[A-HJ-NP-Z2-9]{8}$/),
  chat_id: z.number().int(),
  telegram_usuario: z.string().trim().max(64).nullable().default(null),
});

export const BotVincularSalida = z.object({
  token: z.string(),
  usuario: UsuarioBreve.extend({ rol: z.enum(ROLES) }),
  expira_en: instante,
});
