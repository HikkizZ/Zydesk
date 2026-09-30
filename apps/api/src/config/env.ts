import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const vacioAUndefined = (v: unknown) => (v === '' ? undefined : v);

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PUERTO: z.coerce.number().int().positive().default(3010),
    DATABASE_URL: z.string().url(),
    DATABASE_URL_OWNER: z.preprocess(vacioAUndefined, z.string().url().optional()),
    TEST_DATABASE_URL: z.preprocess(vacioAUndefined, z.string().url().optional()),
    TEST_DATABASE_URL_OWNER: z.preprocess(vacioAUndefined, z.string().url().optional()),
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
