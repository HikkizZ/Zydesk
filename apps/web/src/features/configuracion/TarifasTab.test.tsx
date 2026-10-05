import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IndicadorUfSalidaDatos, TarifasSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { TarifasTab } from './TarifasTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TARIFAS: TarifasSalidaDatos = {
  hora_normal: { moneda: 'CLP', valor: 38000 },
  hora_extendida: null,
  hora_urgencia: null,
  traslado_km: null,
  costo_interno: 18000,
  iva_pct: 19,
  validez_dias_defecto: 30,
  condiciones_defecto: null,
};

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const fetchSimulado = vi.fn();

const UF: IndicadorUfSalidaDatos = {
  fecha: '2026-10-05',
  valor: 41098.15,
  fuente: 'boostr',
  obtenido_en: '2026-10-05T11:07:00.000Z',
  hoy: '2026-10-05',
  desactualizado: false,
};
let indicador: IndicadorUfSalidaDatos | null = UF;

beforeEach(() => {
  fetchSimulado.mockReset();
  indicador = UF;
  vi.stubGlobal('fetch', fetchSimulado);
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/config/tarifas' && init?.method === 'PUT') {
      return Promise.resolve(respuesta(200, JSON.parse(init.body as string)));
    }
    if (ruta === '/api/config/tarifas') return Promise.resolve(respuesta(200, TARIFAS));
    if (ruta === '/api/indicadores/uf') return Promise.resolve(respuesta(200, indicador));
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

const cambiarMoneda = async (
  usuario: ReturnType<typeof userEvent.setup>,
  concepto: string,
  m: string,
) => {
  await usuario.click(screen.getByRole('combobox', { name: `Moneda de ${concepto}` }));
  await usuario.click(await screen.findByRole('option', { name: m }));
};

it('guarda moneda y valor por concepto y null en los vacíos', async () => {
  pintar();
  const normal = await screen.findByLabelText('Hora normal');
  const usuario = userEvent.setup();
  await usuario.clear(normal);
  await cambiarMoneda(usuario, 'Hora normal', 'UF');
  await usuario.type(normal, '0.8');
  await usuario.type(screen.getByLabelText('Traslado por km'), '950');
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(cuerpoPut()).toBeTruthy());
  expect(cuerpoPut()).toEqual({
    hora_normal: { moneda: 'UF', valor: 0.8 },
    hora_extendida: null,
    hora_urgencia: null,
    traslado_km: { moneda: 'CLP', valor: 950 },
    costo_interno: 18000,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
  });
});

it('0,123 en UF y 38000,5 en CLP muestran error y no envían', async () => {
  pintar();
  const normal = await screen.findByLabelText('Hora normal');
  const usuario = userEvent.setup();
  fireEvent.change(normal, { target: { value: '38000.5' } });
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(normal.getAttribute('aria-invalid')).toBe('true'));
  expect(cuerpoPut()).toBeUndefined();

  await cambiarMoneda(usuario, 'Hora normal', 'UF');
  fireEvent.change(normal, { target: { value: '0.123' } });
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(normal.getAttribute('aria-invalid')).toBe('true'));
  expect(cuerpoPut()).toBeUndefined();
});

it('muestra la UF del día y avisa cuando puede estar desactualizada', async () => {
  pintar();
  expect(await screen.findByText(/UF del día: \$41\.098,15 · 5 oct 2026 · Boostr/)).toBeTruthy();
  expect(screen.queryByText('puede estar desactualizada')).toBeNull();
});

it('la línea de la UF dice "puede estar desactualizada" con desactualizado', async () => {
  indicador = { ...UF, fecha: '2026-10-01', desactualizado: true };
  pintar();
  expect(await screen.findByText('puede estar desactualizada')).toBeTruthy();
  expect(screen.getByText(/UF del 1 oct 2026 \(\$41\.098,15, Boostr\)/)).toBeTruthy();
});

it('sin indicador pide escribir el valor a mano en cada cotización', async () => {
  indicador = null;
  pintar();
  expect(await screen.findByText(/Sin valor de la UF todavía/)).toBeTruthy();
});

it('muestra error con IVA 101 y no envía', async () => {
  pintar();
  const iva = await screen.findByLabelText('IVA %');
  fireEvent.change(iva, { target: { value: '101' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(iva.getAttribute('aria-invalid')).toBe('true'));
  expect(cuerpoPut()).toBeUndefined();
});
