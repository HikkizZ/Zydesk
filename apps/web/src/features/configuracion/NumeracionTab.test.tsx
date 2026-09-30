import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NumeracionSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { NumeracionTab } from './NumeracionTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const estado = { ultimo_usado: null, usados: 0, capacidad: 9000, advertencia: false };
const NUMERACION: NumeracionSalidaDatos = {
  ticket: { prefijo: 'TK-', inicial: 1000, digitos: 4, modo: 'correlativo', ...estado },
  ot: { prefijo: 'OT-', inicial: 1, digitos: 4, modo: 'correlativo', ...estado, capacidad: 9999 },
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

function pintar(put: () => Response, historial: unknown[] = []) {
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/config/numeracion' && init?.method === 'PUT') {
      return Promise.resolve(put());
    }
    if (ruta === '/api/config/numeracion') return Promise.resolve(respuesta(200, NUMERACION));
    if (ruta === '/api/config/numeracion/historial') {
      return Promise.resolve(respuesta(200, historial));
    }
    if (ruta === '/api/salud') {
      return Promise.resolve(respuesta(200, { estado: 'ok', version: '0.1.0', bd: 'ok' }));
    }
    return Promise.resolve(respuesta(404));
  });
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <NumeracionTab />
    </ConSesion>,
  );
}

it('muestra la vista previa del próximo código y se actualiza al editar', async () => {
  pintar(() => respuesta(200, NUMERACION));
  expect(await screen.findByText('Próximo: TK-1000')).toBeTruthy();
  expect(screen.getByText('Próximo: OT-0001')).toBeTruthy();
  fireEvent.change(document.querySelector('#ticket-prefijo') as HTMLInputElement, {
    target: { value: 'SOL-' },
  });
  expect(screen.getByText('Próximo: SOL-1000')).toBeTruthy();
  expect(screen.getByText('COT- deriva de la OT (COT-0218 v1)')).toBeTruthy();
});

it('pide confirmación y muestra bajo el campo el error 400 de número inicial menor', async () => {
  pintar(() =>
    respuesta(400, {
      error: {
        codigo: 'NUMERACION_INICIAL_MENOR',
        mensaje: 'El número inicial no puede ser menor que el último usado',
        detalles: { campo: 'ticket.inicial' },
      },
    }),
  );
  await screen.findByText('Próximo: TK-1000');
  const usuario = userEvent.setup();
  const inicial = document.querySelector('#ticket-inicial') as HTMLInputElement;
  fireEvent.change(inicial, { target: { value: '10' } });
  await usuario.click(screen.getByRole('button', { name: 'Guardar numeración' }));

  const dialogo = await screen.findByRole('alertdialog');
  expect(within(dialogo).getByText('Los cambios solo afectan a códigos futuros')).toBeTruthy();
  await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

  const alerta = await screen.findByText(
    'El número inicial no puede ser menor que el último usado',
  );
  expect(alerta.getAttribute('role')).toBe('alert');
  expect(inicial.getAttribute('aria-invalid')).toBe('true');
});

it('lista el historial de cambios de numeración', async () => {
  pintar(
    () => respuesta(200, NUMERACION),
    [
      {
        id: 1,
        creado_en: '2026-09-30T15:00:00.000Z',
        autor: { id: 1, nombre: 'Hikki' },
        entidad_id: 'ticket',
        valor_anterior: 'TK- · inicial 1000 · 4 dígitos · correlativo',
        valor_nuevo: 'TK- · inicial 2000 · 4 dígitos · correlativo',
      },
    ],
  );
  expect(await screen.findByText('TK- · inicial 2000 · 4 dígitos · correlativo')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Hikki')).toBeTruthy());
});
