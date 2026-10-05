import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

it('el botón de cerrar dice «Cerrar» y tiene un área táctil de 44 px', () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Título</DialogTitle>
        <DialogDescription>Texto</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  const cerrar = screen.getByRole('button', { name: 'Cerrar' });
  expect(cerrar.className).toContain('size-11');
  expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-2rem)]');
});
