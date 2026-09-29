import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { MenuLateral } from './MenuLateral';
import { MENU } from './menu';

it('muestra todas las entradas del menú', () => {
  render(
    <MemoryRouter>
      <MenuLateral />
    </MemoryRouter>,
  );
  const textos = [
    'Zydesk',
    'Nuevo ticket',
    'Mi día',
    'Avisos',
    'Tablero',
    'Tabla',
    'Línea de tiempo',
    'Órdenes de trabajo',
    'Cotizador',
    'Horas',
    'Reportes',
    'Clientes',
    'Configuración',
  ];
  for (const texto of textos) {
    expect(screen.getByText(texto)).toBeTruthy();
  }
});

it('menu.ts tiene 13 entradas con rutas únicas', () => {
  expect(MENU).toHaveLength(13);
  expect(new Set(MENU.map((e) => e.ruta)).size).toBe(13);
});
