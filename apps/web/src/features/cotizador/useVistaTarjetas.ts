import { useMediaQuery } from '@/lib/useMediaQuery';

// Bajo 768 px las líneas se muestran como tarjetas. Sin `matchMedia` (jsdom) se asume escritorio.
export function useVistaTarjetas(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}
