import { z } from 'zod';
import { instante } from './comunes.js';

export const TelegramEstadoSalida = z.object({
  vinculado: z.boolean(),
  telegram_usuario: z.string().nullable(),
  vinculado_en: instante.nullable(),
  sesion_bot_activa: z.boolean(), // hay sesión `origen = bot` vigente (comandos disponibles)
  bot_usuario: z.string().nullable(), // TELEGRAM_BOT_USUARIO para el enlace t.me; null si no está configurado
  disponible: z.boolean(), // TELEGRAM_BOT_TOKEN configurado en la API
});

export const CodigoVinculoSalida = z.object({
  codigo: z.string().length(8),
  expira_en: instante,
  enlace: z.string().url().nullable(), // https://t.me/<bot>?start=<codigo>
});
