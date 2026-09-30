import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ActividadDatos, TicketDatos } from '@/features/tickets/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { ticketDePrueba, USUARIOS_PRUEBA } from '@/test/tickets';
import { TicketDetallePage } from './TicketDetallePage';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});
afterEach(() => vi.unstubAllGlobals());

const AUTOR = { id: 3, nombre: 'Sebastián Díaz', iniciales: 'SD', color_avatar: '#CDEBE6' };

const SEGUIMIENTO = {
  tipo: 'mensaje' as const,
  creado_en: '2026-09-28T20:10:00.000Z',
  mensaje: {
    id: 1,
    ticket_id: 7,
    tipo: 'seguimiento' as const,
    autor: AUTOR,
    texto: '<img src=x onerror=alert(1)>',
    horas: null,
    archivos: [],
    mencionados: [],
    creado_en: '2026-09-28T20:10:00.000Z',
  },
};
const NOTA = {
  tipo: 'mensaje' as const,
  creado_en: '2026-09-29T14:00:00.000Z',
  mensaje: {
    id: 2,
    ticket_id: 7,
    tipo: 'nota_interna' as const,
    autor: AUTOR,
    texto: 'Ojo con el CAF, @Diego Muñoz',
    horas: 3,
    archivos: [
      {
        id: 40,
        nombre_original: 'foto.jpg',
        tipo_mime: 'image/jpeg',
        tamano: 1000,
        categoria: 'foto' as const,
        url: '/api/archivos/40',
        es_imagen: true,
        subido_por: null,
        subido_en: '2026-09-29T14:00:00.000Z',
        origen_correo: false,
      },
    ],
    mencionados: [{ id: 1, nombre: 'Diego Muñoz', iniciales: 'DM', color_avatar: '#CFDDF3' }],
    creado_en: '2026-09-29T14:00:00.000Z',
  },
};
const EVENTO = {
  tipo: 'evento' as const,
  creado_en: '2026-09-28T19:58:00.000Z',
  evento: {
    id: 10,
    creado_en: '2026-09-28T19:58:00.000Z',
    autor: { id: 2, nombre: 'Camila Rojas' },
    accion: 'cambio',
    campo: 'estado',
    valor_anterior: 'Nuevo',
    valor_nuevo: 'En curso',
    datos: null,
  },
};
const ITEMS = [EVENTO, SEGUIMIENTO, NOTA];

function actividadDe(tipo: string): ActividadDatos {
  const filtrados = ITEMS.filter((i) =>
    tipo === 'todo'
      ? true
      : tipo === 'historial'
        ? i.tipo === 'evento'
        : i.tipo === 'mensaje' && i.mensaje.tipo === tipo,
  );
  return {
    items: filtrados as ActividadDatos['items'],
    conteos: { todo: 3, seguimiento: 1, nota_interna: 1, historial: 1 },
  };
}

function montar(
  t: TicketDatos = ticketDePrueba(),
  rol: 'tecnico' | 'lectura' = 'tecnico',
  ruta = '/tickets/7',
) {
  const llamadas = simularFetch(({ metodo, ruta: r }) => {
    if (metodo !== 'GET') return undefined;
    if (r === '/api/tickets/7') return respuesta(200, t);
    if (r.startsWith('/api/tickets/7/actividad')) {
      const tipo = new URL(r, 'http://x').searchParams.get('tipo') ?? 'todo';
      return respuesta(200, actividadDe(tipo));
    }
    if (r.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    if (r === '/api/tickets/404')
      return respuesta(404, {
        error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ticket no encontrado' },
      });
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba({ rol })} ruta={ruta}>
      <TooltipProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetallePage />} />
        </Routes>
      </TooltipProvider>
    </ConSesion>,
  );
  return llamadas;
}

it('muestra las pestañas con sus conteos y filtra al cambiar', async () => {
  const usuario = userEvent.setup();
  montar();
  expect(await screen.findByRole('tab', { name: 'Actividad (3)' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Seguimiento (1)' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Notas internas (1)' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Historial (1)' })).toBeTruthy();
  expect(await screen.findByText(/Ojo con el CAF/)).toBeTruthy();

  await usuario.click(screen.getByRole('tab', { name: 'Seguimiento (1)' }));
  await waitFor(() => expect(screen.queryByText(/Ojo con el CAF/)).toBeNull());
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();

  await usuario.click(screen.getByRole('tab', { name: 'Historial (1)' }));
  expect(await screen.findByText('cambió el estado', { exact: false })).toBeTruthy();
  expect(screen.getByText('Nuevo → En curso')).toBeTruthy();
});

it('la pestaña viene de la URL', async () => {
  montar(ticketDePrueba(), 'tecnico', '/tickets/7?actividad=nota_interna');
  const pestana = await screen.findByRole('tab', { name: 'Notas internas (1)' });
  expect(pestana.getAttribute('aria-selected')).toBe('true');
});

it('la nota interna va con fondo ámbar, candado, menciones, horas y foto', async () => {
  montar();
  const nota = await screen.findByRole('article', { name: /Nota interna de Sebastián Díaz/ });
  expect(nota.className).toContain('bg-nota-interna-fondo');
  expect(within(nota).getByText('Nota interna · solo equipo')).toBeTruthy();
  expect(within(nota).getByText('@Diego Muñoz').className).toContain('font-medium');
  expect(within(nota).getByText(/3 h registradas/)).toBeTruthy();
  expect(within(nota).getByAltText('foto.jpg')).toBeTruthy();
});

it('el texto de un mensaje se muestra literal, sin interpretarlo como HTML', async () => {
  montar();
  const texto = await screen.findByText('<img src=x onerror=alert(1)>');
  expect(texto.querySelector('img')).toBeNull();
});

it('el correo original se muestra como texto y se puede descargar', async () => {
  const t = ticketDePrueba({
    tiene_correo: true,
    correo: {
      id: 1,
      origen: 'eml',
      de: 'Paula Herrera <pherrera@ejemplo.test>',
      para: 'soporte@zydesk.local',
      fecha: '2026-09-28T19:58:00.000Z',
      asunto: 'Error al emitir facturas',
      cuerpo: 'Hola <script>alert(1)</script>',
      archivo: {
        id: 50,
        nombre_original: 'correo.eml',
        tipo_mime: 'message/rfc822',
        tamano: 100,
        categoria: 'correo',
        url: '/api/archivos/50',
        es_imagen: false,
        subido_por: null,
        subido_en: '2026-09-28T19:58:00.000Z',
        origen_correo: false,
      },
      adjuntos: [],
    },
  });
  montar(t);
  const tarjeta = await screen.findByRole('region', { name: 'Correo original' });
  expect(within(tarjeta).getByText('Hola <script>alert(1)</script>')).toBeTruthy();
  const descargar = within(tarjeta).getByRole('link', { name: /Descargar original/ });
  expect(descargar.getAttribute('href')).toBe('/api/archivos/50');
  expect(screen.getByText('Correo adjunto')).toBeTruthy();
});

it('quien solo lee ve las notas pero no el redactor ni los botones de escritura', async () => {
  montar(ticketDePrueba(), 'lectura');
  expect(await screen.findByText(/Ojo con el CAF/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Redactor' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cambiar estado' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  expect(screen.getByText('Solo lectura')).toBeTruthy();
});

it('quien edita ve el redactor y los botones', async () => {
  montar();
  expect(await screen.findByRole('region', { name: 'Redactor' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cambiar estado' })).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Convertir en OT' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('un ticket cerrado muestra el aviso y el botón Reabrir', async () => {
  const t = ticketDePrueba({
    estado: 'resuelto',
    cerrado_en: '2026-09-29T15:00:00.000Z',
  });
  montar(t);
  const aviso = (await screen.findByText(/Cerrado el/)).closest('[role="status"]') as HTMLElement;
  expect(aviso.textContent).toContain('Cerrado el 29 sep 2026');
  expect(aviso.textContent).toContain('se archivará el 6 oct 2026');
  expect(within(aviso).getByRole('button', { name: 'Reabrir' })).toBeTruthy();
});

it('un ticket inexistente muestra "Ticket no encontrado" con enlace al tablero', async () => {
  simularFetch(() =>
    respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ticket no encontrado' } }),
  );
  render(
    <ConSesion yo={yoDePrueba()} ruta="/tickets/404">
      <TooltipProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetallePage />} />
        </Routes>
      </TooltipProvider>
    </ConSesion>,
  );
  expect(await screen.findByText('Ticket no encontrado')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir al tablero' }).getAttribute('href')).toBe('/tickets');
});
