import { env, type Env } from '../src/config/env.js';

// `env` se valida una sola vez al importarlo: los tests que necesitan otro valor (token de Telegram, etc.)
// lo fijan aquí y `setup.ts` lo restaura después de cada test.
const originales = new Map<keyof Env, unknown>();

export function fijarEnv<K extends keyof Env>(clave: K, valor: Env[K]): void {
  if (!originales.has(clave)) originales.set(clave, env[clave]);
  env[clave] = valor;
}

export function restaurarEnv(): void {
  for (const [clave, valor] of originales) (env as Record<string, unknown>)[clave] = valor;
  originales.clear();
}
