import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { claveBotValida } from './clave-bot.js';

describe('claveBotValida', () => {
  it('acepta la clave exacta y rechaza distintas, de igual o de otra longitud, ausentes o vacías', () => {
    expect(claveBotValida(env.BOT_API_KEY)).toBe(true);
    expect(claveBotValida('x'.repeat(env.BOT_API_KEY!.length))).toBe(false);
    expect(claveBotValida(`${env.BOT_API_KEY}x`)).toBe(false);
    expect(claveBotValida('corta')).toBe(false);
    expect(claveBotValida(undefined)).toBe(false);
    expect(claveBotValida('')).toBe(false);
  });

  it('compara con crypto.timingSafeEqual (tiempo constante), nunca con ===', () => {
    const fuente = readFileSync(new URL('./clave-bot.ts', import.meta.url), 'utf8');
    expect(fuente).toContain('timingSafeEqual(a, b)');
    expect(fuente).not.toMatch(/===?\s*esperada|esperada\s*===?/);
  });
});
