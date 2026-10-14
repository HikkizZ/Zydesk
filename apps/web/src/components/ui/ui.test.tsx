import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button } from './button';
import { Input } from './input';

const carpeta = __dirname;
const fuentes = readdirSync(carpeta)
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  .map((f) => ({ f, texto: readFileSync(join(carpeta, f), 'utf8') }));

it('components/ui no tiene clases de modo oscuro', () => {
  expect(fuentes.filter(({ texto }) => /\bdark:/.test(texto)).map((x) => x.f)).toEqual([]);
});

it('solo los flotantes llevan sombra, y es shadow-flotante', () => {
  const conSombra = fuentes
    .filter(({ texto }) => /shadow-(?!flotante)/.test(texto))
    .map((x) => x.f);
  expect(conSombra).toEqual([]);
  const flotantes = fuentes
    .filter(({ texto }) => texto.includes('shadow-flotante'))
    .map((x) => x.f);
  expect(flotantes.sort()).toEqual(
    [
      'alert-dialog.tsx',
      'dialog.tsx',
      'dropdown-menu.tsx',
      'popover.tsx',
      'select.tsx',
      'sheet.tsx',
      'sonner.tsx',
    ].sort(),
  );
});

it('Button mide 44 px bajo 1024 px y 32 px en escritorio, con foco por outline', () => {
  render(<Button>Guardar</Button>);
  const clases = screen.getByRole('button', { name: 'Guardar' }).className;
  expect(clases).toContain('h-11');
  expect(clases).toContain('lg:h-8');
  expect(clases).toContain('focus-visible:outline-acento');
  expect(clases).toContain('rounded-md');
});

it('Input usa el borde de campo, 44/36 px y radio de 4 px', () => {
  render(<Input aria-label="Nombre" />);
  const clases = screen.getByLabelText('Nombre').className;
  expect(clases).toContain('border-linea-campo');
  expect(clases).toContain('h-11');
  expect(clases).toContain('lg:h-9');
  expect(clases).toContain('rounded-sm');
});
