import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const raizRepo = fileURLToPath(new URL('../../../../', import.meta.url));

config({ path: path.join(raizRepo, '.env'), quiet: true });

const vacioAUndefined = (v: unknown) => (v === '' ? undefined : v);

// Valor de `.env.example`: nunca válido como `BOT_API_KEY` en producción (ADR 0020).
export const BOT_API_KEY_EJEMPLO = 'clave-de-desarrollo-cambiar-en-produccion';

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PUERTO: z.coerce.number().int().positive().default(3010),
    DATABASE_URL: z.string().url(),
    DATABASE_URL_OWNER: z.preprocess(vacioAUndefined, z.string().url().optional()),
    TEST_DATABASE_URL: z.preprocess(vacioAUndefined, z.string().url().optional()),
    TEST_DATABASE_URL_OWNER: z.preprocess(vacioAUndefined, z.string().url().optional()),
    // Solo tests de la API: base de test por bloque `zydesk_test_<sufijo>` (spec fase-2 §1.1)
    TEST_BD_SUFIJO: z.preprocess(
      vacioAUndefined,
      z
        .string()
        .regex(/^[a-z0-9_]{1,20}$/)
        .optional(),
    ),
    // Superusuario de desarrollo: solo lo usa `db:test:crear`
    POSTGRES_USER: z.preprocess(vacioAUndefined, z.string().optional()),
    POSTGRES_PASSWORD: z.preprocess(vacioAUndefined, z.string().optional()),
    POSTGRES_PORT: z.preprocess(vacioAUndefined, z.string().optional()),
    // Archivos en disco (ADR 0009): relativa a la raíz del repo o absoluta
    ARCHIVOS_DIR: z
      .preprocess(vacioAUndefined, z.string().default('./datos/archivos'))
      .transform((v) => path.resolve(raizRepo, v)),
    TEST_ARCHIVOS_DIR: z.preprocess(vacioAUndefined, z.string().optional()),
    PROXY_SALTOS: z.preprocess(vacioAUndefined, z.coerce.number().int().min(0).default(0)),
    EJECUTAR_JOBS: z
      .preprocess(vacioAUndefined, z.enum(['true', 'false']).default('true'))
      .transform((v) => v === 'true'),
    ADMIN_PASSWORD: z.preprocess(vacioAUndefined, z.string().optional()),
    SEMILLA_PASSWORD: z.preprocess(vacioAUndefined, z.string().optional()),
    // Telegram (spec fase 6 §9.1): sin token el canal queda `omitido / sin_token`. Nunca en el repo ni en logs.
    TELEGRAM_BOT_TOKEN: z.preprocess(vacioAUndefined, z.string().optional()),
    // @usuario del bot (sin `@`): arma el enlace `https://t.me/<usuario>?start=<código>` en el servidor.
    TELEGRAM_BOT_USUARIO: z.preprocess(
      (v) => (typeof v === 'string' ? v.replace(/^@/, '') || undefined : v),
      z
        .string()
        .regex(/^[A-Za-z0-9_]{3,64}$/)
        .optional(),
    ),
    // Clave compartida de `/api/bot/*` (`X-Bot-Key`)
    BOT_API_KEY: z.preprocess(vacioAUndefined, z.string().optional()),
    // Base de los enlaces que se envían por Telegram: solo http(s)
    WEB_URL: z
      .preprocess(
        vacioAUndefined,
        z
          .string()
          .url()
          .regex(/^https?:\/\//i, 'debe ser http(s)://')
          .default('http://localhost:5173'),
      )
      .transform((v) => v.replace(/\/+$/, '')),
    LOG_LEVEL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['error', 'warn', 'info', 'debug']).optional(),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'test' && !v.TEST_DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'obligatoria con NODE_ENV=test',
      });
    }
    if (v.TELEGRAM_BOT_TOKEN) {
      if (!v.BOT_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['BOT_API_KEY'],
          message: 'obligatoria con TELEGRAM_BOT_TOKEN',
        });
      } else if (
        v.NODE_ENV === 'production' &&
        (v.BOT_API_KEY.length < 32 || v.BOT_API_KEY === BOT_API_KEY_EJEMPLO)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['BOT_API_KEY'],
          message: 'en producción: mínimo 32 caracteres y distinta del valor de .env.example',
        });
      }
      if (v.NODE_ENV === 'production' && !v.WEB_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_URL'],
          message: 'en producción debe ser https://',
        });
      }
    }
  })
  .transform((v) => {
    if (v.NODE_ENV !== 'test' || !v.TEST_BD_SUFIJO) return v;
    const conBase = (url: string | undefined) => {
      if (!url) return url;
      const u = new URL(url);
      u.pathname = `/zydesk_test_${v.TEST_BD_SUFIJO}`;
      return u.toString();
    };
    return {
      ...v,
      TEST_DATABASE_URL: conBase(v.TEST_DATABASE_URL),
      TEST_DATABASE_URL_OWNER: conBase(v.TEST_DATABASE_URL_OWNER),
    };
  });

export type Env = z.infer<typeof esquema>;

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  const resultado = esquema.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return resultado.data;
}

export const env = cargarEnv();
