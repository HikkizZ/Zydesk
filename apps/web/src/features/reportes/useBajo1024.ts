import { useSyncExternalStore } from 'react';

const CONSULTA = '(max-width: 1023.98px)';

// Bajo 1024 px (ADR 0011) el gráfico de semanas se recorta. Sin `matchMedia` (jsdom) se asume escritorio.
export function useBajo1024(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(CONSULTA);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
