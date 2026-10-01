import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TarifasSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { TarifasTab } from './TarifasTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TARIFAS: TarifasSalidaDatos = {
  hora_normal: 38000,
  hora_extendida: null,
  hora_urgencia: null,
  traslado_km: null,
  costo_interno: 18000,
  iva_pct: 19,
  validez_dias_defecto: 30,
  condiciones_defecto: null,
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/config/tarifas' && init?.method === 'PUT') {
      return Promise.resolve(respuesta(200, JSON.parse(init.body as string)));
    }
    if (ruta === '/api/config/tarifas') return Promise.resolve(respuesta(200, TARIFAS));
    return Promise.resolve(respuesta(404));
  });
});
afterEach(() => vi.unstubAllGlobals());

function pintar() {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <TarifasTab />
    </ConSesion>,
  );
}

function cuerpoPut(): unknown {
  const llamada = fetchSimulado.mock.calls.find(
    ([ruta, init]) => ruta === '/api/config/tarifas' && (init as RequestInit)?.method === 'PUT',
  );
  return llamada ? JSON.parse((llamada[1] as RequestInit).body as string) : undefined;
}

it('guarda enteros y null en los montos vacíos', async () => {
  pintar();
  const normal = await screen.findByLabelText('Hora normal');
  const usuario = userEvent.setup();
  await usuario.clear(normal);
  await usuario.type(normal, '40000');
  await usuario.type(screen.getByLabelText('Traslado por km'), '950');
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(cuerpoPut()).toBeTruthy());
  expect(cuerpoPut()).toEqual({
    hora_normal: 40000,
    hora_extendida: null,
    hora_urgencia: null,
    traslado_km: 950,
    costo_interno: 18000,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
  });
});

it('muestra error con IVA 101 y no envía', async () => {
  pintar();
  const iva = await screen.findByLabelText('IVA %');
  fireEvent.change(iva, { target: { value: '101' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(iva.getAttribute('aria-invalid')).toBe('true'));
  expect(cuerpoPut()).toBeUndefined();
});
