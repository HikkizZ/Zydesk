import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AvisoBorrador } from './AvisoBorrador';

it('marca el borrador con un chip ámbar y el texto de pendiente', () => {
  render(<AvisoBorrador />);
  const nota = screen.getByRole('note');
  expect(nota.textContent).toBe('BorradorPendiente de revisión');
  expect(screen.getByText('Borrador').className).toContain('text-plazo-atento');
});
