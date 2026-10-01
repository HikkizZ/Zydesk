import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, onTestFinished, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TicketResumenDatos } from '@/features/tickets/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { ticketDePrueba, USUARIOS_PRUEBA } from '@/test/tickets';
import { TablaPage } from './TablaPage';

// Radix Select usa estas APIs del DOM que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
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
    prioridad: 'alta',
  }),
  ticketDePrueba({
    id: 8,
    codigo: 'TK-1040',
    asunto: 'Caída intermitente de VPN',
    estado: 'en_curso',
    prioridad: 'urgente',
    cliente: null,
  }),
  ticketDePrueba({
    id: 9,
    codigo: 'TK-1028',
    asunto: 'Revisión de cámaras',
    estado: 'en_espera',
    espera_de: 'repuesto',
    prioridad: 'alta',
  }),
];
const ARCHIVADO = ticketDePrueba({
  id: 20,
  codigo: 'TK-1012',
  asunto: 'Cableado estructurado oficina Temuco',
  estado: 'resuelto',
  archivado_en: '2026-09-20T12:00:00.000Z',
  cerrado_en: '2026-09-10T12:00:00.000Z',
});
const CONTADORES: Record<string, number> = {
  solo_mios: 3,
  sin_asignar: 1,
  vencen_hoy: 2,
  vencidos: 0,
  con_ot: 2,
  archivados: 1,
};

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <p data-testid="ubicacion">{`${pathname}${search}`}</p>;
}

function montar(rol: Parameters<typeof yoDePrueba>[0] = {}, ruta = '/tickets/tabla') {
  const llamadas = simularFetch(({ metodo, ruta: r }) => {
    if (metodo !== 'GET') return undefined;
    if (r.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (r.startsWith('/api/clientes')) {
      return respuesta(200, [{ id: 1, nombre: 'Viña Santa Clara', es_interno: false }]);
    }
    if (!r.startsWith('/api/tickets?')) return undefined;
    const q = new URLSearchParams(r.split('?')[1]);
    const clave = Object.keys(CONTADORES).find((k) => q.get(k) === 'true');
    const datos = q.get('archivados') === 'true' ? [ARCHIVADO] : TICKETS;
    const total = clave ? (CONTADORES[clave] ?? 0) : datos.length;
    return respuesta(200, {
      datos: q.get('por_pagina') === '1' ? datos.slice(0, 1) : datos,
      total,
      pagina: Number(q.get('pagina') ?? 1),
      por_pagina: Number(q.get('por_pagina') ?? 100),
    });
  });
  render(
    <ConSesion yo={yoDePrueba(rol)} ruta={ruta}>
      <TooltipProvider>
        <Routes>
          <Route path="/tickets/tabla" element={<TablaPage />} />
        </Routes>
        <Ubicacion />
      </TooltipProvider>
    </ConSesion>,
  );
  return llamadas;
}

const ubicacion = () => screen.getByTestId('ubicacion').textContent ?? '';

it('los chips cambian la URL y la consulta, y muestran su contador', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  expect(await screen.findByRole('button', { name: 'Míos (3)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Todos (4)' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(screen.getByRole('button', { name: 'Sin asignar (1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Vencen hoy (2)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Vencidos (0)' })).toBeTruthy();

  await usuario.click(screen.getByRole('button', { name: 'Míos (3)' }));
  expect(ubicacion()).toBe('/tickets/tabla?solo_mios=true');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Míos (3)' }).getAttribute('aria-pressed')).toBe(
      'true',
    ),
  );
  expect(
    llamadas.some((l) => l.ruta.includes('solo_mios=true') && l.ruta.includes('por_pagina=100')),
  ).toBe(true);

  await usuario.click(screen.getByRole('button', { name: 'Vencidos (0)' }));
  expect(ubicacion()).toBe('/tickets/tabla?vencidos=true');
  await usuario.click(screen.getByRole('button', { name: /^Todos/ }));
  expect(ubicacion()).toBe('/tickets/tabla');
});

it('el chip "Con OT" está habilitado, con contador, y cambia la URL y la consulta', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  const chip = await screen.findByRole('button', { name: 'Con OT (2)' });
  expect((chip as HTMLButtonElement).disabled).toBe(false);
  await usuario.click(chip);
  expect(ubicacion()).toBe('/tickets/tabla?con_ot=true');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Con OT (2)' }).getAttribute('aria-pressed')).toBe(
      'true',
    ),
  );
  expect(
    llamadas.some((l) => l.ruta.includes('con_ot=true') && l.ruta.includes('por_pagina=100')),
  ).toBe(true);
});

it('"Exportar" está visible y deshabilitado', async () => {
  montar();
  await screen.findByRole('button', { name: 'Míos (3)' });
  expect((screen.getByRole('button', { name: 'Exportar' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('la columna Tipo muestra la OT vinculada y se puede agrupar por tipo', async () => {
  const usuario = userEvent.setup();
  const original = TICKETS[1]!;
  onTestFinished(() => {
    TICKETS[1] = original;
  });
  TICKETS[1] = ticketDePrueba({
    ...original,
    tipo: 'ot_facturable',
    ot_vinculada: { id: 5, codigo: 'OT-0218', tipo: 'facturable' },
  });
  montar();
  expect(await screen.findByText('OT-0218 · Facturable')).toBeTruthy();
  await usuario.click(screen.getByRole('combobox', { name: 'Agrupar por' }));
  await usuario.click(await screen.findByRole('option', { name: 'Tipo' }));
  expect(await screen.findByRole('button', { name: /^OT facturable 1 ticket$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Ticket 3 tickets$/ })).toBeTruthy();
});

it('agrupa por prioridad por defecto y por estado al cambiar el selector', async () => {
  const usuario = userEvent.setup();
  montar();
  expect(await screen.findByRole('button', { name: /^Urgente 2 tickets$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Alta 2 tickets$/ })).toBeTruthy();

  await usuario.click(screen.getByRole('combobox', { name: 'Agrupar por' }));
  await usuario.click(await screen.findByRole('option', { name: 'Estado' }));
  expect(ubicacion()).toBe('/tickets/tabla?agrupar=estado');
  expect(await screen.findByRole('button', { name: /^Nuevo 1 ticket$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^En curso 2 tickets$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^En espera 1 ticket$/ })).toBeTruthy();
});

it('agrupa por responsable ("Sin asignar") y por cliente ("Sin cliente")', async () => {
  montar({}, '/tickets/tabla?agrupar=responsable');
  expect(await screen.findByRole('button', { name: /^Sebastián Díaz 3 tickets$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Sin asignar 1 ticket$/ })).toBeTruthy();
});

it('agrupar por cliente separa "Sin cliente"', async () => {
  montar({}, '/tickets/tabla?agrupar=cliente');
  expect(await screen.findByRole('button', { name: /^Sin cliente 1 ticket$/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Viña Santa Clara 3 tickets$/ })).toBeTruthy();
});

it('un grupo se colapsa y se vuelve a abrir', async () => {
  const usuario = userEvent.setup();
  montar();
  const cabecera = await screen.findByRole('button', { name: /^Urgente 2 tickets$/ });
  expect(screen.getByText('TK-1051')).toBeTruthy();
  await usuario.click(cabecera);
  expect(cabecera.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('TK-1051')).toBeNull();
  expect(screen.getByText('TK-1048')).toBeTruthy();
  await usuario.click(cabecera);
  expect(screen.getByText('TK-1051')).toBeTruthy();
});

it('sin agrupar no hay cabeceras de grupo', async () => {
  montar({}, '/tickets/tabla?agrupar=ninguno');
  await screen.findByText('TK-1051');
  expect(screen.queryByRole('button', { name: /tickets$/ })).toBeNull();
});

it('archivados=true deja activa la pestaña Archivados y muestra el ticket archivado', async () => {
  montar({}, '/tickets/tabla?archivados=true');
  expect(await screen.findByText('TK-1012')).toBeTruthy();
  const chip = screen.getByRole('button', { name: /^Archivados/ });
  expect(chip.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: /^Todos/ }).getAttribute('aria-pressed')).toBe('false');
});

it('ordena por Vence desde la cabecera y lo deja en la URL', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await screen.findByText('TK-1051');
  expect(screen.getByRole('columnheader', { name: /Actualizado/ }).getAttribute('aria-sort')).toBe(
    'descending',
  );
  await usuario.click(screen.getByRole('button', { name: 'Vence' }));
  expect(ubicacion()).toBe('/tickets/tabla?orden=fecha_limite');
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta.includes('orden=fecha_limite'))).toBe(true),
  );
  expect(screen.getByRole('columnheader', { name: /Vence/ }).getAttribute('aria-sort')).toBe(
    'ascending',
  );
});

it('la tabla no ofrece cambiar el estado: solo el detalle lo hace', async () => {
  montar({ rol: 'tecnico' });
  await screen.findByText('TK-1051');
  expect(screen.queryByRole('button', { name: /Acciones de|Cambiar estado/ })).toBeNull();
  const fila = screen.getByRole('link', { name: 'TK-1048' }).closest('tr') as HTMLElement;
  expect(within(fila).getByRole('link', { name: 'TK-1048' }).getAttribute('href')).toBe(
    '/tickets/7',
  );
});

it('muestra el rango de la página y el filtro por cliente se puede quitar', async () => {
  const usuario = userEvent.setup();
  montar({}, '/tickets/tabla?cliente_id=1');
  expect(await screen.findByText('1–4 de 4')).toBeTruthy();
  const quitar = await screen.findByRole('button', {
    name: 'Quitar filtro de cliente: Viña Santa Clara',
  });
  await usuario.click(quitar);
  expect(ubicacion()).toBe('/tickets/tabla');
});
