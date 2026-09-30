import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClienteResumenDatos, ClienteSalidaDatos } from '@zydesk/shared';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { ClientesPage } from './ClientesPage';

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const resumen = (
  id: number,
  nombre: string,
  es_interno: boolean,
  extra: Partial<ClienteResumenDatos> = {},
): ClienteResumenDatos => ({
  id,
  nombre,
  rut: null,
  es_interno,
  activo: true,
  tiene_bolsa: false,
  tickets_abiertos: 0,
  ...extra,
});

const ACTIVOS = [
  resumen(1, 'Viña Santa Clara', false, { tiene_bolsa: true, rut: '76123456-K' }),
  resumen(2, 'Constructora Andes', false, { rut: '77888999-1' }),
  resumen(3, 'Administración', true),
];
const INACTIVOS = [resumen(4, 'Transportes Austral', false, { activo: false })];

const FICHA: ClienteSalidaDatos = {
  id: 1,
  nombre: 'Viña Santa Clara',
  rut: '76123456-K',
  direccion: 'Camino Real 100',
  es_interno: false,
  condicion_pago: '30 días',
  exige_oc: true,
  notas: null,
  activo: true,
  contactos: [
    {
      id: 10,
      cliente_id: 1,
      nombre: 'Paula Herrera',
      area: 'Finanzas',
      correo: 'paula@vina.cl',
      telefono: null,
      aprueba_cotizaciones: true,
      activo: true,
    },
  ],
  bolsa: {
    vigente: {
      id: 5,
      cliente_id: 1,
      horas_mes: 20,
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      fecha_renovacion: '2026-10-01',
      notas: null,
      vigente: true,
      horas_usadas_mes: null,
    },
    historial: [
      {
        id: 5,
        cliente_id: 1,
        horas_mes: 20,
        vigente_desde: '2026-01-01',
        vigente_hasta: null,
        fecha_renovacion: '2026-10-01',
        notas: null,
        vigente: true,
        horas_usadas_mes: null,
      },
    ],
  },
  tarifas: [{ concepto: 'hora_normal', valor: 38000 }],
  creado_en: '2026-01-01T12:00:00.000Z',
  actualizado_en: '2026-01-01T12:00:00.000Z',
};

const INTERNA: ClienteSalidaDatos = {
  ...FICHA,
  id: 3,
  nombre: 'Administración',
  rut: null,
  direccion: null,
  es_interno: true,
  condicion_pago: null,
  exige_oc: false,
  contactos: [],
  bolsa: { vigente: null, historial: [] },
  tarifas: [],
};

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  fetchSimulado.mockImplementation((ruta: string) => {
    if (ruta === '/api/clientes') return Promise.resolve(respuesta(200, ACTIVOS));
    if (ruta === '/api/clientes?activo=false') return Promise.resolve(respuesta(200, INACTIVOS));
    if (ruta === '/api/clientes/1') return Promise.resolve(respuesta(200, FICHA));
    if (ruta === '/api/clientes/3') return Promise.resolve(respuesta(200, INTERNA));
    if (ruta === '/api/clientes/99') {
      return Promise.resolve(
        respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe' } }),
      );
    }
    return Promise.resolve(respuesta(200, {}));
  });
  vi.stubGlobal('fetch', fetchSimulado);
});
afterEach(() => vi.unstubAllGlobals());

function pantalla(rol: Parameters<typeof yoDePrueba>[0] = {}, ruta = '/clientes') {
  return render(
    <ConSesion yo={yoDePrueba(rol)} ruta={ruta}>
      <TooltipProvider>
        <Routes>
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/clientes/:id" element={<ClientesPage />} />
        </Routes>
      </TooltipProvider>
    </ConSesion>,
  );
}

const llamadasA = (metodo: string, ruta: string) =>
  fetchSimulado.mock.calls.filter(
    ([r, init]) => r === ruta && (init as RequestInit | undefined)?.method === metodo,
  );

it('separa clientes y áreas internas en grupos distintos', async () => {
  pantalla();
  const clientes = await screen.findByRole('region', { name: 'Clientes' });
  const internas = screen.getByRole('region', { name: 'Áreas internas' });
  expect(within(clientes).getByText('Viña Santa Clara')).toBeTruthy();
  expect(within(clientes).getByText('Constructora Andes')).toBeTruthy();
  expect(within(clientes).queryByText('Administración')).toBeNull();
  expect(within(internas).getByText('Administración')).toBeTruthy();
  expect(within(internas).queryByText('Viña Santa Clara')).toBeNull();
  expect(within(clientes).getByText('bolsa de horas')).toBeTruthy();
});

it('filtra por nombre en el cliente sin llamar a la API y muestra inactivos con el interruptor', async () => {
  const usuario = userEvent.setup();
  pantalla();
  await screen.findByText('Viña Santa Clara');
  await usuario.type(screen.getByLabelText('Buscar cliente'), 'andes');
  expect(screen.queryByText('Viña Santa Clara')).toBeNull();
  expect(screen.getByText('Constructora Andes')).toBeTruthy();
  expect(fetchSimulado).toHaveBeenCalledTimes(1);

  await usuario.clear(screen.getByLabelText('Buscar cliente'));
  expect(screen.queryByText('Transportes Austral')).toBeNull();
  await usuario.click(screen.getByLabelText('Mostrar inactivos'));
  expect(await screen.findByText('Transportes Austral')).toBeTruthy();
});

it('filtra por RUT sin puntos ni guion y sin distinguir la K, sin llamar a la API', async () => {
  const usuario = userEvent.setup();
  pantalla();
  await screen.findByText('Viña Santa Clara');
  const campo = screen.getByLabelText('Buscar cliente');
  await usuario.type(campo, '76.123.456-k');
  expect(screen.getByText('Viña Santa Clara')).toBeTruthy();
  expect(screen.queryByText('Constructora Andes')).toBeNull();
  await usuario.clear(campo);
  await usuario.type(campo, '778889991');
  expect(screen.queryByText('Viña Santa Clara')).toBeNull();
  expect(screen.getByText('Constructora Andes')).toBeTruthy();
  expect(fetchSimulado).toHaveBeenCalledTimes(1);
});

it('sin clientes muestra el estado vacío con la acción para quien puede crear', async () => {
  fetchSimulado.mockImplementation(() => Promise.resolve(respuesta(200, [])));
  pantalla({ rol: 'admin' });
  expect(await screen.findByText('Aún no hay clientes')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Nuevo cliente' }).length).toBe(2);
});

it('administración ve la ficha completa con bolsa, tarifas y acciones de edición', async () => {
  pantalla({ rol: 'admin' }, '/clientes/1');
  expect(await screen.findByRole('heading', { level: 1, name: 'Viña Santa Clara' })).toBeTruthy();
  expect(screen.getByText(/RUT 76123456-K/)).toBeTruthy();
  expect(screen.getByText(/20 h al mes · Se renueva el 1 oct/)).toBeTruthy();
  expect(screen.getByText('$38.000 + IVA')).toBeTruthy();
  expect(screen.getAllByText('Tarifa global').length).toBe(3);
  expect(screen.getByText('Paula Herrera', { exact: false })).toBeTruthy();
  expect(screen.getByText('Aprueba cotizaciones')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Editar ficha' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Desactivar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Agregar bolsa' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Editar tarifas' })).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Nuevo ticket para este cliente' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText('Disponible en la Fase 2')).toBeTruthy();
  expect(screen.getByText('Disponible en la Fase 3')).toBeTruthy();
});

it('el técnico no ve "Editar ficha", bolsa ni tarifas, pero sí puede agregar contactos', async () => {
  const usuario = userEvent.setup();
  pantalla({ rol: 'tecnico' }, '/clientes/1');
  await screen.findByRole('heading', { level: 1, name: 'Viña Santa Clara' });
  expect(screen.queryByRole('button', { name: 'Editar ficha' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar bolsa' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Editar tarifas' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).toBeNull();

  await usuario.click(screen.getByRole('button', { name: '+ Agregar contacto' }));
  await usuario.type(await screen.findByLabelText('Nombre'), 'Luis Soto');
  await usuario.type(screen.getByLabelText('Correo'), 'luis@vina.cl');
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(llamadasA('POST', '/api/clientes/1/contactos').length).toBe(1));
  const cuerpo = JSON.parse(
    (llamadasA('POST', '/api/clientes/1/contactos')[0]![1] as RequestInit).body as string,
  );
  expect(cuerpo).toEqual({
    nombre: 'Luis Soto',
    area: null,
    correo: 'luis@vina.cl',
    telefono: null,
    aprueba_cotizaciones: false,
  });
});

it('lectura no puede editar nada de la ficha ni agregar contactos', async () => {
  pantalla({ rol: 'lectura' }, '/clientes/1');
  await screen.findByRole('heading', { level: 1, name: 'Viña Santa Clara' });
  expect(screen.queryByRole('button', { name: 'Editar ficha' })).toBeNull();
  expect(screen.queryByRole('button', { name: '+ Agregar contacto' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar bolsa' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Editar tarifas' })).toBeNull();
});

it('coordinación puede agregar bolsa pero no editar la ficha', async () => {
  pantalla({ rol: 'coordinacion' }, '/clientes/1');
  await screen.findByRole('heading', { level: 1, name: 'Viña Santa Clara' });
  expect(screen.getByRole('button', { name: 'Agregar bolsa' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Editar ficha' })).toBeNull();
});

it('un área interna no muestra condiciones comerciales ni agregar bolsa', async () => {
  pantalla({ rol: 'admin' }, '/clientes/3');
  await screen.findByRole('heading', { level: 1, name: 'Administración' });
  expect(screen.queryByText('Condiciones comerciales')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar bolsa' })).toBeNull();
  expect(screen.queryByText('Bolsa de horas')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Contactos' })).toBeTruthy();
});

it('en el diálogo, un área interna oculta RUT, dirección, condición de pago y notas', async () => {
  const usuario = userEvent.setup();
  pantalla({ rol: 'admin' }, '/clientes/3');
  await screen.findByRole('heading', { level: 1, name: 'Administración' });
  await usuario.click(screen.getByRole('button', { name: 'Editar ficha' }));
  await screen.findByLabelText('Nombre');
  expect(screen.queryByLabelText('RUT')).toBeNull();
  expect(screen.queryByLabelText('Dirección')).toBeNull();
  expect(screen.queryByLabelText('Condición de pago')).toBeNull();
  expect(screen.queryByLabelText('Notas')).toBeNull();
});

it('editar tarifas: "Usar tarifa global" quita el concepto del PUT', async () => {
  const usuario = userEvent.setup();
  pantalla({ rol: 'admin' }, '/clientes/1');
  await usuario.click(await screen.findByRole('button', { name: 'Editar tarifas' }));
  const horaNormal = await screen.findByLabelText('Hora normal');
  expect((horaNormal as HTMLInputElement).value).toBe('38000');
  await usuario.click(
    screen.getByLabelText('Usar tarifa global', { selector: '#global-hora_extendida' }),
  );
  const extendida = screen.getByLabelText('Hora horario extendido') as HTMLInputElement;
  expect(extendida.disabled).toBe(false);
  await usuario.type(extendida, '45000');
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(llamadasA('PUT', '/api/clientes/1/tarifas').length).toBe(1));
  const cuerpo = JSON.parse(
    (llamadasA('PUT', '/api/clientes/1/tarifas')[0]![1] as RequestInit).body as string,
  );
  expect(cuerpo).toEqual([
    { concepto: 'hora_normal', valor: 38000 },
    { concepto: 'hora_extendida', valor: 45000 },
  ]);
});

it('agregar bolsa: un 409 por solape se muestra en el diálogo', async () => {
  const usuario = userEvent.setup();
  fetchSimulado.mockImplementation((ruta: string, init?: RequestInit) => {
    if (ruta === '/api/clientes/1/bolsa' && init?.method === 'POST') {
      return Promise.resolve(
        respuesta(409, {
          error: {
            codigo: 'CONFLICTO',
            mensaje: 'Conflicto',
            detalles: { motivo: 'solapa_vigente' },
          },
        }),
      );
    }
    if (ruta === '/api/clientes/1') return Promise.resolve(respuesta(200, FICHA));
    return Promise.resolve(respuesta(200, ACTIVOS));
  });
  pantalla({ rol: 'admin' }, '/clientes/1');
  await usuario.click(await screen.findByRole('button', { name: 'Agregar bolsa' }));
  await usuario.type(await screen.findByLabelText('Horas al mes'), '10');
  await usuario.type(screen.getByLabelText('Vigente desde'), '2026-06-01');
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(await screen.findByText(/se solapa con este/)).toBeTruthy();
});

it('un cliente inexistente muestra "Cliente no encontrado"', async () => {
  pantalla({}, '/clientes/99');
  expect(await screen.findByText('Cliente no encontrado')).toBeTruthy();
});
