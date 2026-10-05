import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONSULTA_MOVIL, useEsMovil, useMediaQuery } from './useMediaQuery';

type Oyente = () => void;

function instalarMatchMedia(matches: boolean) {
  const oyentes = new Set<Oyente>();
  const estado = { matches };
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return estado.matches;
    },
    media: consulta,
    addEventListener: (_: string, o: Oyente) => oyentes.add(o),
    removeEventListener: (_: string, o: Oyente) => oyentes.delete(o),
  })) as unknown as typeof window.matchMedia;
  return {
    cambiar(valor: boolean) {
      estado.matches = valor;
      oyentes.forEach((o) => o());
    },
  };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('sin matchMedia devuelve false', () => {
    // @ts-expect-error jsdom no lo trae; se retira por si otro test lo instaló
    window.matchMedia = undefined;
    const { result } = renderHook(() => useMediaQuery('(max-width: 100px)'));
    expect(result.current).toBe(false);
  });

  it('con matchMedia devuelve matches y reacciona al evento change', () => {
    const mq = instalarMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 100px)'));
    expect(result.current).toBe(true);
    act(() => mq.cambiar(false));
    expect(result.current).toBe(false);
  });

  it('useEsMovil usa el corte bajo lg', () => {
    instalarMatchMedia(true);
    expect(CONSULTA_MOVIL).toBe('(max-width: 1023.98px)');
    const { result } = renderHook(() => useEsMovil());
    expect(result.current).toBe(true);
  });
});
