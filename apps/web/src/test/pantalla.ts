import { afterEach } from 'vitest';

const original = window.matchMedia;

function restaurarPantalla() {
  window.matchMedia = original;
}

// Se retira solo al terminar cada test (el módulo se importa en la fase de colección del archivo de test).
afterEach(restaurarPantalla);

// Simula un celular en jsdom: `max-width: 1023.98px` coincide; `767.98px` según `tarjetas`.
export function simularMovil({ tarjetas = false }: { tarjetas?: boolean } = {}): void {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes('1023.98px')
      ? true
      : consulta.includes('767.98px')
        ? tarjetas
        : false,
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}
