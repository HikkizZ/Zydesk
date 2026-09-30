import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

const OPCIONES = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashear(texto: string): Promise<string> {
  return argon2.hash(texto, OPCIONES);
}

export async function verificar(hash: string, texto: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, texto);
  } catch {
    return false;
  }
}

// Hash (mismos parámetros) de una cadena aleatoria: se verifica contra él cuando el correo no existe,
// para que la respuesta tarde lo mismo.
export const HASH_FICTICIO =
  '$argon2id$v=19$m=65536,p=1,t=3$4PA2CTp62Xf98wXxY10pVg$WpeR6UgG2fkEZBE8++p/4OT0BIeqPFDuDvjaqejMzTc';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generarTemporal(): string {
  let t = '';
  for (let i = 0; i < 14; i++) t += ALFABETO[randomInt(ALFABETO.length)];
  return t;
}
