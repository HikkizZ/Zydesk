import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const raizRepo = fileURLToPath(new URL('../../../../', import.meta.url));

config({ path: path.join(raizRepo, '.env'), quiet: true });

const vacioAUndefined = (v: unknown) => (v === '' ? undefined : v);

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
