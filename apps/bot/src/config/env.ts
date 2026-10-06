import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const raizRepo = fileURLToPath(new URL('../../../../', import.meta.url));

const vacioAUndefined = (v: unknown) => (v === '' ? undefined : v);

const claveCifrado = z.string().transform((v, ctx) => {
  const buf = Buffer.from(v, 'base64');
  if (buf.length !== 32 || buf.toString('base64') !== v.trim()) {
    ctx.addIssue({ code: 'custom', message: 'debe ser base64 de exactamente 32 bytes' });
    return z.NEVER;
  }
  return buf;
});

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.preprocess(vacioAUndefined, z.enum(['error', 'warn', 'info', 'debug']).optional()),
    TELEGRAM_BOT_TOKEN: z.preprocess(vacioAUndefined, z.string().optional()),
    API_URL: z.preprocess(vacioAUndefined, z.string().url().optional()),
    BOT_API_KEY: z.preprocess(vacioAUndefined, z.string().min(16).optional()),
    BOT_CLAVE_CIFRADO: z.preprocess(vacioAUndefined, claveCifrado.optional()),
    BOT_DATOS_DIR: z
      .preprocess(vacioAUndefined, z.string().default('./datos/bot'))
      .transform((v) => path.resolve(raizRepo, v)),
    WEB_URL: z.preprocess(
      vacioAUndefined,
      z
        .string()
        .url()
        .regex(/^https?:\/\//i, 'debe ser http(s)://')
        .optional(),
    ),
  })
  .superRefine((v, ctx) => {
    if (!v.TELEGRAM_BOT_TOKEN) return;
    for (const clave of ['BOT_API_KEY', 'BOT_CLAVE_CIFRADO'] as const) {
      if (!v[clave]) {
        ctx.addIssue({
          code: 'custom',
          path: [clave],
          message: 'obligatoria con TELEGRAM_BOT_TOKEN',
        });
      }
    }
    if (
      v.NODE_ENV === 'production' &&
      !(v.WEB_URL ?? 'http://localhost:5173').startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_URL'],
        message: 'en producción debe ser https://',
      });
    }
    if (!v.API_URL && v.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['API_URL'], message: 'obligatoria en producción' });
    }
  });

export type EnvBotHabilitado = {
  habilitado: true;
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug' | undefined;
  TELEGRAM_BOT_TOKEN: string;
  API_URL: string;
  BOT_API_KEY: string;
  BOT_CLAVE_CIFRADO: Buffer;
  BOT_DATOS_DIR: string;
  WEB_URL: string;
};

export type EnvBot =
  | {
      habilitado: false;
      NODE_ENV: 'development' | 'test' | 'production';
      LOG_LEVEL: EnvBotHabilitado['LOG_LEVEL'];
    }
  | EnvBotHabilitado;

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): EnvBot {
  const resultado = esquema.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  const v = resultado.data;
  if (!v.TELEGRAM_BOT_TOKEN || !v.BOT_API_KEY || !v.BOT_CLAVE_CIFRADO) {
    return { habilitado: false, NODE_ENV: v.NODE_ENV, LOG_LEVEL: v.LOG_LEVEL };
  }
  return {
    habilitado: true,
    NODE_ENV: v.NODE_ENV,
    LOG_LEVEL: v.LOG_LEVEL,
    TELEGRAM_BOT_TOKEN: v.TELEGRAM_BOT_TOKEN,
    API_URL: v.API_URL ?? 'http://localhost:3010',
    BOT_API_KEY: v.BOT_API_KEY,
    BOT_CLAVE_CIFRADO: v.BOT_CLAVE_CIFRADO,
    BOT_DATOS_DIR: v.BOT_DATOS_DIR,
    WEB_URL: (v.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  };
}

// ADR 0013: el bot habla con la API por la red interna; la URL pública pasa por el proxy.
export function advertenciaApiUrl(apiUrl: string): string | null {
  const u = new URL(apiUrl);
  if (u.hostname === 'desk.zytech.dev') {
    return 'API_URL apunta al dominio público; usa la dirección interna de la API';
  }
  const interna =
    u.hostname === 'api' ||
    u.hostname === 'zydesk-api' ||
    u.hostname === 'localhost' ||
    u.hostname === '127.0.0.1';
  if (u.protocol === 'http:' && !interna) {
    return 'API_URL debe ser http://zydesk-api… (o http://api…) o https://';
  }
  return null;
}
