import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { generarTemporal } from './contrasena';
import { EquipoTab } from './EquipoTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

it('la contraseña temporal generada cumple la política y usa el alfabeto sin ambiguos', () => {
  for (let i = 0; i < 50; i++) {
    const t = generarTemporal('ana@zydesk.local');
    expect(t).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{14}$/);
  }
});

it('al agregar una persona muestra la temporal una sola vez', async () => {
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/usuarios' && init?.method === 'POST') {
      return Promise.resolve(respuesta(201, { id: 5 }));
    }
    if (ruta.startsWith('/api/usuarios')) return Promise.resolve(respuesta(200, []));
    if (ruta === '/api/departamentos') return Promise.resolve(respuesta(200, []));
    return Promise.resolve(respuesta(404));
  });
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <EquipoTab />
    </ConSesion>,
  );
  const usuario = userEvent.setup();
  await usuario.click(await screen.findByRole('button', { name: '+ Agregar persona' }));
  const formulario = await screen.findByRole('dialog');
  await usuario.type(within(formulario).getByLabelText('Nombre'), 'Ana Pérez');
  await usuario.type(within(formulario).getByLabelText('Correo'), 'ana@zydesk.local');
  await usuario.click(within(formulario).getByRole('button', { name: 'Agregar persona' }));

  const temporal = await screen.findByTestId('contrasena-temporal');
  const post = fetchSimulado.mock.calls.find(([, init]) => init?.method === 'POST');
  const cuerpo = JSON.parse(post?.[1].body as string);
  expect(temporal.textContent).toBe(cuerpo.contrasena_temporal);
  expect(cuerpo.rol).toBe('tecnico');

  await usuario.click(screen.getByRole('button', { name: 'Listo' }));
  await waitFor(() => expect(screen.queryByTestId('contrasena-temporal')).toBeNull());
  expect(screen.queryByText(cuerpo.contrasena_temporal)).toBeNull();
});

it('muestra la matriz de roles con Permitido / No permitido', async () => {
  fetchSimulado.mockImplementation(() => Promise.resolve(respuesta(200, [])));
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <EquipoTab />
    </ConSesion>,
  );
  const fila = (await screen.findByText('Cambiar configuración')).closest('tr') as HTMLElement;
  const celdas = within(fila).getAllByRole('cell');
  // Acción + admin, coordinación, técnico, solo lectura
  expect(celdas.slice(1).map((c) => c.getAttribute('aria-label'))).toEqual([
    'Permitido',
    'No permitido',
    'No permitido',
    'No permitido',
  ]);
});
