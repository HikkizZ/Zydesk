import { expect, it } from 'vitest';
import { cn } from './utils';

it('cn resuelve conflictos de Tailwind', () => {
  expect(cn('p-2', 'p-4')).toBe('p-4');
});
