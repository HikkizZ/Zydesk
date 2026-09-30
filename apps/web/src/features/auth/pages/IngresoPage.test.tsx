import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { formatearHora } from '@/lib/fechas';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { IngresoPage } from './IngresoPage';

const MARCA = { nombre_app: 'Zydesk', logo_url: null };

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

// Responde la marca y deja `ingreso` para la llamada a /api/auth/ingresar.
function simular(ingreso: () => Response) {
  fetchSimulado.mockImplementation((ruta: string) =>
    Promise.resolve(ruta === '/api/config/marca' ? respuesta(200, MARCA) : ingreso()),
  );
}

async function completarYEnviar() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Correo'), 'hikki@zydesk.local');
  await usuario.type(screen.getByLabelText('Contraseña'), 'Clave.De.Prueba.1');
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
}

it('muestra la pantalla sin botón Microsoft y con la indicación de restablecer', async () => {
  simular(() => respuesta(500));
  const { container } = render(
    <ConSesion yo={null}>
      <IngresoPage />
    </ConSesion>,
  );
  expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeTruthy();
  expect(screen.getByText(/Pide a Administración que la restablezca/)).toBeTruthy();
  expect(container.textContent).not.toMatch(/microsoft/i);
});

it('envía correo y contraseña con la cabecera CSRF y guarda el usuario en la caché', async () => {
  simular(() => respuesta(200, yoDePrueba({ rol: 'admin', correo: 'hikki@zydesk.local' })));
  const cliente = new QueryClient();
  render(
    <ConSesion yo={null} cliente={cliente}>
      <IngresoPage />
    </ConSesion>,
  );
  await completarYEnviar();
  await waitFor(() => expect(cliente.getQueryData(['yo'])).toBeTruthy());
  const llamada = fetchSimulado.mock.calls.find(([ruta]) => ruta === '/api/auth/ingresar')!;
  const init = llamada[1] as RequestInit;
  expect(init.method).toBe('POST');
  expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('Zydesk');
  expect(JSON.parse(init.body as string)).toEqual({
    correo: 'hikki@zydesk.local',
    contrasena: 'Clave.De.Prueba.1',
    mantener: false,
  });
});

it('401 muestra "Correo o contraseña incorrectos"', async () => {
  simular(() =>
    respuesta(401, {
      error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' },
    }),
  );
  render(
    <ConSesion yo={null}>
      <IngresoPage />
    </ConSesion>,
  );
  await completarYEnviar();
  const alerta = await screen.findByRole('alert');
  expect(alerta.textContent).toBe('Correo o contraseña incorrectos');
});

it('429 muestra la hora en que se puede reintentar', async () => {
  const reintentar_en = '2026-09-30T18:05:00.000Z';
  simular(() =>
    respuesta(429, {
      error: {
        codigo: 'INGRESO_BLOQUEADO',
        mensaje: 'Demasiados intentos',
        detalles: { reintentar_en },
      },
    }),
  );
  render(
    <ConSesion yo={null}>
      <IngresoPage />
    </ConSesion>,
  );
  await completarYEnviar();
  const alerta = await screen.findByRole('alert');
  expect(alerta.textContent).toBe(
    `Demasiados intentos. Vuelve a intentarlo a las ${formatearHora(reintentar_en)}`,
  );
});

it('un error de red muestra "No se pudo conectar. Intenta de nuevo."', async () => {
  fetchSimulado.mockImplementation((ruta: string) =>
    ruta === '/api/config/marca'
      ? Promise.resolve(respuesta(200, MARCA))
      : Promise.reject(new TypeError('Failed to fetch')),
  );
  render(
    <ConSesion yo={null}>
      <IngresoPage />
    </ConSesion>,
  );
  await completarYEnviar();
  const alerta = await screen.findByRole('alert');
  expect(alerta.textContent).toBe('No se pudo conectar. Intenta de nuevo.');
});

it('el botón Mostrar alterna la visibilidad de la contraseña', async () => {
  simular(() => respuesta(500));
  render(
    <ConSesion yo={null}>
      <IngresoPage />
    </ConSesion>,
  );
  const usuario = userEvent.setup();
  const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
  expect(campo.type).toBe('password');
  await usuario.click(screen.getByRole('button', { name: 'Mostrar' }));
  expect(campo.type).toBe('text');
  expect(screen.getByRole('button', { name: 'Ocultar' }).getAttribute('aria-pressed')).toBe('true');
});
