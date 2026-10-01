import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlantillaCotizacionSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { PlantillasTab } from './PlantillasTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PLANTILLA: PlantillaCotizacionSalidaDatos = {
  id: 7,
  nombre: 'Soporte por horas',
  descripcion: 'Bolsa de horas de soporte',
  condiciones: null,
  activo: true,
  lineas: [
    {
      id: 1,
      orden: 1,
      tipo: 'mano_de_obra',
      descripcion: 'Diagnóstico',
      cantidad: 2,
      unidad: 'h',
      precio_unitario: null,
      descuento_pct: 0,
    },
  ],
  creado_en: '2026-09-01T12:00:00.000Z',
  actualizado_en: '2026-09-01T12:00:00.000Z',
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/config/plantillas-cotizacion' && init?.method === 'POST') {
      return Promise.resolve(respuesta(201, { ...PLANTILLA, id: 8 }));
    }
    if (ruta === '/api/config/plantillas-cotizacion/7/activo' && init?.method === 'PATCH') {
      return Promise.resolve(respuesta(200, { ...PLANTILLA, activo: false }));
    }
    if (ruta.startsWith('/api/config/plantillas-cotizacion')) {
      return Promise.resolve(respuesta(200, [PLANTILLA]));
    }
    return Promise.resolve(respuesta(404));
  });
});
afterEach(() => vi.unstubAllGlobals());

function pintar() {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <PlantillasTab />
    </ConSesion>,
  );
}

function llamada(metodo: string) {
  return fetchSimulado.mock.calls.find(([, init]) => (init as RequestInit)?.method === metodo) as
    [string, RequestInit] | undefined;
}

it('lista las plantillas con su resumen de líneas', async () => {
  pintar();
  expect(await screen.findByText('Soporte por horas')).toBeTruthy();
  expect(screen.getByText('1 línea: Mano de obra · h')).toBeTruthy();
});

it('crear envía las líneas con precio_unitario null', async () => {
  pintar();
  const usuario = userEvent.setup();
  await screen.findByText('Soporte por horas');
  await usuario.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
  const dialogo = await screen.findByRole('dialog');
  await usuario.type(within(dialogo).getByLabelText('Nombre'), 'Mantención');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Agregar línea' }));
  await usuario.type(within(dialogo).getByLabelText('Descripción de la línea 1'), 'Revisión');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Crear plantilla' }));

  await waitFor(() => expect(llamada('POST')).toBeTruthy());
  const [ruta, init] = llamada('POST') as [string, RequestInit];
  expect(ruta).toBe('/api/config/plantillas-cotizacion');
  expect(JSON.parse(init.body as string)).toEqual({
    nombre: 'Mantención',
    descripcion: null,
    condiciones: null,
    lineas: [
      {
        tipo: 'mano_de_obra',
        descripcion: 'Revisión',
        cantidad: 1,
        unidad: 'h',
        precio_unitario: null,
        descuento_pct: 0,
      },
    ],
  });
});

it('desactivar confirma y llama al PATCH de activo', async () => {
  pintar();
  const usuario = userEvent.setup();
  await usuario.click(await screen.findByRole('button', { name: 'Desactivar…' }));
  const dialogo = await screen.findByRole('alertdialog');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

  await waitFor(() => expect(llamada('PATCH')).toBeTruthy());
  const [ruta, init] = llamada('PATCH') as [string, RequestInit];
  expect(ruta).toBe('/api/config/plantillas-cotizacion/7/activo');
  expect(JSON.parse(init.body as string)).toEqual({ activo: false });
});

it('ver inactivas pide activo=false', async () => {
  pintar();
  await screen.findByText('Soporte por horas');
  await userEvent.setup().click(screen.getByLabelText('Ver inactivas'));
  await waitFor(() =>
    expect(
      fetchSimulado.mock.calls.some(
        ([r]) => r === '/api/config/plantillas-cotizacion?activo=false',
      ),
    ).toBe(true),
  );
});
