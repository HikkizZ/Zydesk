import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PUERTO: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['error', 'warn', 'info', 'debug']).optional(),
  ),
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
