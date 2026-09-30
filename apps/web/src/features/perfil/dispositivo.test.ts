import { expect, it } from 'vitest';
import { nombreDispositivo } from './dispositivo';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

it('devuelve navegador y sistema operativo legibles', () => {
  expect(nombreDispositivo(CHROME_WINDOWS)).toBe('Chrome en Windows');
  expect(nombreDispositivo(SAFARI_IPHONE)).toBe('Mobile Safari en iOS');
});

it('si no se reconoce, recorta el user agent a 60 caracteres; sin user agent, texto fijo', () => {
  const raro = 'x'.repeat(100);
  expect(nombreDispositivo(raro)).toBe(`${'x'.repeat(60)}…`);
  expect(nombreDispositivo('curl')).toBe('curl');
  expect(nombreDispositivo(null)).toBe('Dispositivo desconocido');
});
