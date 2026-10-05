import { useSyncExternalStore } from 'react';

// Sin `matchMedia` (jsdom) se asume escritorio.
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches,
    () => false,
  );
}

// Bajo `lg`, el mismo corte que la barra inferior (ADR 0019).
export const CONSULTA_MOVIL = '(max-width: 1023.98px)';
export const useEsMovil = () => useMediaQuery(CONSULTA_MOVIL);
