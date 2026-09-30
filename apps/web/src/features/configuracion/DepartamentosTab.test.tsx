import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DepartamentoSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { DepartamentosTab } from './DepartamentosTab';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEPARTAMENTO: DepartamentoSalidaDatos = {
  id: 1,
  nombre: 'Soporte TI',
  hora_extendida_desde: '19:00',
  capacidad_tickets_pct: 80,
  jornada_semanal_horas: 42.5,
  personas: 0,
  creado_en: '2026-01-01T00:00:00.000Z',
  actualizado_en: '2026-01-01T00:00:00.000Z',
  horario: [0, 1, 2, 3, 4, 5, 6].map((dia) => {
    const laboral = dia >= 1 && dia <= 5;
    return {
      dia_semana: dia,
      activo: laboral,
      entrada: laboral ? '08:30' : '09:00',
      salida: laboral ? '18:00' : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    };
  }),
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

function simular(departamento = DEPARTAMENTO) {
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/departamentos') return Promise.resolve(respuesta(200, [departamento]));
    if (ruta.startsWith('/api/feriados') && init?.method === 'POST') {
      return Promise.resolve(respuesta(201, { id: 9, ...JSON.parse(init.body as string) }));
    }
    if (ruta.startsWith('/api/feriados')) return Promise.resolve(respuesta(200, []));
    if (ruta === '/api/departamentos/1' && init?.method === 'PUT') {
      return Promise.resolve(respuesta(200, departamento));
    }
    return Promise.resolve(respuesta(404));
  });
}

function pintar() {
  render(
    <ConSesion yo={yoDePrueba({ rol: 'admin' })}>
      <TooltipProvider>
        <DepartamentosTab />
      </TooltipProvider>
    </ConSesion>,
  );
}

it('recalcula la jornada semanal y las horas del día al cambiar una hora', async () => {
  simular();
  pintar();
  expect(await screen.findByText('Jornada semanal calculada: 42,5 h')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Salida Lunes'), { target: { value: '17:00' } });

  expect(screen.getByText('Jornada semanal calculada: 41,5 h')).toBeTruthy();
  const filaLunes = screen.getByText('Lunes').closest('tr') as HTMLElement;
  expect(within(filaLunes).getByText('7,5 h')).toBeTruthy();
  // los días inactivos se muestran como libres
  const filaSabado = screen.getByText('Sábado').closest('tr') as HTMLElement;
  expect(within(filaSabado).getByText('Libre')).toBeTruthy();
});

it('guarda con PUT el horario completo de 7 días', async () => {
  simular();
  pintar();
  await screen.findByText('Jornada semanal calculada: 42,5 h');
  fireEvent.change(screen.getByLabelText('Salida Lunes'), { target: { value: '17:00' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => {
    const put = fetchSimulado.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put).toBeTruthy();
    const cuerpo = JSON.parse(put?.[1].body as string);
    expect(cuerpo.horario).toHaveLength(7);
    expect(cuerpo.horario.find((d: { dia_semana: number }) => d.dia_semana === 1).salida).toBe(
      '17:00',
    );
  });
});

it('deshabilita Eliminar cuando el departamento tiene personas', async () => {
  simular({ ...DEPARTAMENTO, personas: 3 });
  pintar();
  await screen.findByText('Jornada semanal calculada: 42,5 h');
  expect((screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText('3 personas · 42,5 h por semana')).toBeTruthy();
});

it('agrega un feriado general con POST', async () => {
  simular();
  pintar();
  await screen.findByText('Jornada semanal calculada: 42,5 h');
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole('button', { name: '+ Agregar feriado' }));
  const dialogo = await screen.findByRole('dialog');
  fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-12-31' } });
  await usuario.type(within(dialogo).getByLabelText('Nombre'), 'Fin de año');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Agregar feriado' }));

  await waitFor(() => {
    const post = fetchSimulado.mock.calls.find(
      ([ruta, init]) => ruta === '/api/feriados' && init?.method === 'POST',
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(post?.[1].body as string)).toEqual({
      fecha: '2026-12-31',
      nombre: 'Fin de año',
      departamento_id: null,
    });
  });
});
