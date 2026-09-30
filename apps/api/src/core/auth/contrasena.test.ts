import { politicaContrasena } from '@zydesk/shared';
import { describe, expect, it } from 'vitest';
import { HASH_FICTICIO, generarTemporal, hashear, verificar } from './contrasena.js';

describe('contrasena', () => {
  it('hashea con argon2id y verifica', async () => {
    const hash = await hashear('Contrasena.Prueba.1');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,[tp]=[13],[tp]=[13]\$/);
    expect(await verificar(hash, 'Contrasena.Prueba.1')).toBe(true);
    expect(await verificar(hash, 'otra')).toBe(false);
  });

  it('verificar no lanza con un hash inválido y HASH_FICTICIO nunca coincide', async () => {
    expect(await verificar('no-es-un-hash', 'x')).toBe(false);
    expect(HASH_FICTICIO).toMatch(/^\$argon2id\$v=19\$m=65536,[tp]=[13],[tp]=[13]\$/);
    expect(await verificar(HASH_FICTICIO, 'x')).toBe(false);
  });

  it('generarTemporal produce 14 caracteres del alfabeto, distintos cada vez y válidos por la política', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = generarTemporal();
      expect(t).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{14}$/);
      expect(politicaContrasena(t, 'a@b.cl').ok).toBe(true);
      vistos.add(t);
    }
    expect(vistos.size).toBe(50);
  });
});
