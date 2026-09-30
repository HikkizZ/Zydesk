import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals: true`, RTL no limpia el DOM solo.
afterEach(() => cleanup());

// jsdom no trae ResizeObserver (lo usan los componentes de Radix).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
