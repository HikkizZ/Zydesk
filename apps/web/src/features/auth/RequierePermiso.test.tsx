import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { RequierePermiso } from './RequierePermiso';

it('sin el permiso muestra SinPermiso y no el contenido', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'tecnico' })}>
      <RequierePermiso permiso="config.editar">
        <p>Contenido secreto</p>
      </RequierePermiso>
    </ConSesion>,
  );
  expect(screen.getByText('No tienes permiso para ver esta sección')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a Mi día' }).getAttribute('href')).toBe('/mi-dia');
  expect(screen.queryByText('Contenido secreto')).toBeNull();
});

it('con el permiso muestra el contenido', () => {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <RequierePermiso permiso="config.editar">
        <p>Contenido secreto</p>
      </RequierePermiso>
    </ConSesion>,
  );
  expect(screen.getByText('Contenido secreto')).toBeTruthy();
});
