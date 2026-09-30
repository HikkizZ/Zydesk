import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TicketResumenDatos } from '@/features/tickets/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { ticketDePrueba, USUARIOS_PRUEBA } from '@/test/tickets';
import { TableroPage } from './TableroPage';

afterEach(() => vi.unstubAllGlobals());

const TICKETS: TicketResumenDatos[] = [
  ticketDePrueba({
    id: 1,
    codigo: 'TK-1051',
    asunto: 'Servidor de archivos no responde',
    estado: 'nuevo',
    prioridad: 'urgente',
    responsables: [],
  }),
  ticketDePrueba({
    id: 7,
    codigo: 'TK-1048',
    asunto: 'Error al emitir facturas desde el ERP',
    estado: 'en_curso',
    n_mensajes: 5,
    tiene_correo: true,
  }),
  ticketDePrueba({
    id: 8,
    codigo: 'TK-1028',
    asunto: 'Revisión de cámaras de seguridad',
    estado: 'en_espera',
    espera_de: 'repuesto',
  }),
  ticketDePrueba({
    id: 9,
    codigo: 'TK-1026',
    asunto: 'Impresora del piso 3 atasca papel',
    estado: 'resuelto',
    cerrado_en: '2026-09-29T12:00:00.000Z',
  }),
  ticketDePrueba({
    id: 10,
    codigo: 'TK-1047',
    asunto: 'Oferta de proveedor reenviada',
    estado: 'descartado',
    motivo_cierre: 'No corresponde: publicidad de proveedor',
    cerrado_en: '2026-09-29T12:00:00.000Z',
  }),
  ticketDePrueba({
    id: 11,
    codigo: 'TK-1044',
    asunto: 'VPN no conecta desde bodega',
    estado: 'duplicado',
    duplicado_de: { id: 12, codigo: 'TK-1040' },
    cerrado_en: '2026-09-29T12:00:00.000Z',
  }),
];

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <p data-testid="ubicacion">{`${pathname}${search}`}</p>;
}

function montar(rol: Parameters<typeof yoDePrueba>[0] = {}, ruta = '/tickets') {
  const llamadas = simularFetch(({ metodo, ruta: r }) => {
    if (metodo === 'GET' && r.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'GET' && r.startsWith('/api/tickets/tablero')) return respuesta(200, TICKETS);
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba(rol)} ruta={ruta}>
      <TooltipProvider>
        <Routes>
          <Route path="/tickets" element={<TableroPage />} />
        </Routes>
        <Ubicacion />
      </TooltipProvider>
    </ConSesion>,
  );
  return llamadas;
}

const columna = (nombre: string) => screen.getByRole('region', { name: new RegExp(`^${nombre}`) });

it('agrupa las tarjetas en sus cuatro columnas, con contador', async () => {
  montar();
  await screen.findByRole('article', { name: /TK-1051/ });
  expect(within(columna('Nuevo')).getByRole('article', { name: /TK-1051/ })).toBeTruthy();
  expect(within(columna('En curso')).getByRole('article', { name: /TK-1048/ })).toBeTruthy();
  expect(within(columna('En espera')).getByRole('article', { name: /TK-1028/ })).toBeTruthy();
  const cerrados = within(columna('Cerrados'));
  expect(cerrados.getAllByRole('article').length).toBe(3);
  expect(cerrados.getByText('Se archivan a los 7 días')).toBeTruthy();
  expect(within(columna('Cerrados')).getByRole('heading', { level: 2 }).textContent).toContain('3');
});

it('una columna sin tarjetas dice "Sin tickets"', async () => {
  simularFetch(({ ruta }) =>
    ruta.startsWith('/api/tickets/tablero') ? respuesta(200, []) : respuesta(200, USUARIOS_PRUEBA),
  );
  render(
    <ConSesion yo={yoDePrueba()} ruta="/tickets">
      <TooltipProvider>
        <TableroPage />
      </TooltipProvider>
    </ConSesion>,
  );
  await waitFor(() => expect(screen.getAllByText('Sin tickets').length).toBe(4));
});

it('muestra el número de mensajes, "Espera: repuesto", el correo y el cierre de cada tarjeta', async () => {
  montar();
  const curso = within(await screen.findByRole('article', { name: /TK-1048/ }));
  expect(curso.getByLabelText('5 mensajes')).toBeTruthy();
  expect(curso.getByText('Correo')).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: /TK-1028/ })).getByText('Espera: repuesto'),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: /TK-1026/ })).getByText('Resuelto'),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: /TK-1047/ })).getByText(
      /Descartado · No corresponde/,
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: /TK-1044/ })).getByText('Duplicado de TK-1040'),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('article', { name: /TK-1051/ })).getByText('Sin asignar'),
  ).toBeTruthy();
});

it.each([['tecnico' as const], ['lectura' as const]])(
  'el tablero es solo una vista (%s): cada tarjeta enlaza al detalle y no hay controles de estado',
  async (rol) => {
    montar({ rol });
    await screen.findByRole('article', { name: /TK-1048/ });
    const tarjetas = screen.getAllByRole('article');
    expect(tarjetas.length).toBe(TICKETS.length);
    for (const t of TICKETS) {
      const tarjeta = screen.getByRole('article', { name: new RegExp(t.codigo) });
      expect(within(tarjeta).getByRole('link').getAttribute('href')).toBe(`/tickets/${t.id}`);
      // La tarjeta no tiene ningún otro control: ni menú, ni asa de arrastre.
      expect(within(tarjeta).queryByRole('button')).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /Acciones de|Mover|Cambiar estado/ })).toBeNull();
    expect(screen.queryByText('Cambiar estado')).toBeNull();
  },
);

it('el botón "Nuevo ticket" solo aparece con permiso de edición', async () => {
  montar({ rol: 'lectura' });
  await screen.findByRole('article', { name: /TK-1048/ });
  expect(screen.queryByRole('link', { name: 'Nuevo ticket' })).toBeNull();
});

it('los filtros viven en la URL y se envían a la API', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar({}, '/tickets?prioridad=urgente,alta');
  await screen.findByRole('article', { name: /TK-1048/ });
  expect(llamadas.some((l) => l.ruta === '/api/tickets/tablero?prioridad=urgente%2Calta')).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Prioridad: Urgente, Alta' })).toBeTruthy();

  await usuario.click(screen.getByRole('switch', { name: 'Solo míos' }));
  await waitFor(() =>
    expect(screen.getByTestId('ubicacion').textContent).toContain('solo_mios=true'),
  );
  await waitFor(() =>
    expect(
      llamadas.some(
        (l) => l.ruta.includes('/api/tickets/tablero?') && l.ruta.includes('solo_mios=true'),
      ),
    ).toBe(true),
  );

  await usuario.type(screen.getByRole('searchbox', { name: 'Buscar tickets' }), 'vpn');
  await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain('q=vpn'));
  await waitFor(() => expect(llamadas.some((l) => l.ruta.includes('q=vpn'))).toBe(true));
});
