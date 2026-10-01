import { useSyncExternalStore } from 'react';

const CONSULTA = '(max-width: 767.98px)';

// Bajo 768 px las líneas se muestran como tarjetas. Sin `matchMedia` (jsdom) se asume escritorio.
export function useVistaTarjetas(): boolean {
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
