import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import type { MensajeDatos } from '@/features/tickets/api';
import { TarjetaMensaje } from './ActividadLista';

const mensaje = {
  id: 1,
  tipo: 'seguimiento',
  texto: 'Listo',
  horas: null,
  creado_en: '2026-09-28T19:58:00.000Z',
  autor: null,
  copiado_de: null,
  mencionados: [],
  archivos: [
    {
      id: 5,
      nombre_original: 'foto.heic',
      mime: 'image/heic',
      tamano: 1024,
      es_imagen: true,
      url: '/api/archivos/5',
    },
  ],
} as unknown as MensajeDatos;

it('una miniatura que no se decodifica pasa a modo documento con el nombre visible', () => {
  render(
    <MemoryRouter>
      <TarjetaMensaje mensaje={mensaje} />
    </MemoryRouter>,
  );
  const img = screen.getByRole('img', { name: 'foto.heic' });
  expect(img.className).toContain('max-h-60');
  expect(img.className).toContain('sm:max-w-80');
  fireEvent.error(img);
  expect(screen.queryByRole('img', { name: 'foto.heic' })).toBeNull();
  expect(screen.getByText('foto.heic')).toBeTruthy();
});

it('varias imágenes van en una grilla con miniaturas de 160 px', () => {
  const dos = {
    ...mensaje,
    archivos: [
      ...(mensaje as unknown as { archivos: object[] }).archivos,
      {
        id: 6,
        nombre_original: 'b.png',
        mime: 'image/png',
        tamano: 10,
        es_imagen: true,
        url: '/api/archivos/6',
      },
    ],
  } as unknown as MensajeDatos;
  render(
    <MemoryRouter>
      <TarjetaMensaje mensaje={dos} />
    </MemoryRouter>,
  );
  const img = screen.getByRole('img', { name: 'b.png' });
  expect(img.className).toContain('h-40');
  expect(img.closest('ul')?.className).toContain('grid-cols-2');
});
