import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { simularMovil } from '@/test/pantalla';
import { AtajosSecciones } from './AtajosSecciones';

const SECCIONES = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'tareas', etiqueta: 'Tareas' },
  { id: 'archivos', etiqueta: 'Archivos' },
];

describe('AtajosSecciones', () => {
  it('en móvil muestra un enlace por sección, en el orden dado', () => {
    simularMovil();
    render(<AtajosSecciones etiqueta="En este ticket" secciones={SECCIONES} />);
    const nav = screen.getByRole('navigation', { name: 'En este ticket' });
    const enlaces = within(nav).getAllByRole('link');
    expect(enlaces.map((e) => e.textContent)).toEqual(['Datos', 'Tareas', 'Archivos']);
    expect(enlaces[1]?.getAttribute('href')).toBe('#tareas');
    expect(enlaces[1]?.className).toContain('min-h-11');
  });

  it('sin móvil no se monta', () => {
    render(<AtajosSecciones etiqueta="En este ticket" secciones={SECCIONES} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
