import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion } from '@/test/sesion';
import { Pie } from './Pie';

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

it('muestra la versión de /api/salud como insignia de 12 px en el pie', async () => {
  fetchSimulado.mockResolvedValue(respuesta(200, { estado: 'ok', version: '1.0.0', bd: 'ok' }));
  render(
    <ConSesion yo={null}>
      <Pie nombreApp="Zydesk" />
    </ConSesion>,
  );
  const version = await screen.findByText('v1.0.0');
  expect(version.getAttribute('data-letra')).toBe('insignia');
  expect(version.classList.contains('text-xs')).toBe(true);
  expect(screen.getByRole('link', { name: 'Términos de uso' })).toBeTruthy();
});

it('no muestra versión si /api/salud falla, pero conserva los enlaces legales', async () => {
  fetchSimulado.mockResolvedValue(respuesta(503, { error: 'x' }));
  render(
    <ConSesion yo={null}>
      <Pie nombreApp="Zydesk" />
    </ConSesion>,
  );
  expect(await screen.findByRole('link', { name: 'Privacidad' })).toBeTruthy();
  expect(screen.queryByText(/^v\d/)).not.toBeTruthy();
});
