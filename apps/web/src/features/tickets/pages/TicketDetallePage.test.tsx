import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  ).toBe(false);
});

const OT_BREVE = {
  id: 5,
  numero: 218,
  codigo: 'OT-0218',
  titulo: 'Regularización de folios',
  tipo: 'facturable' as const,
  etapa: 'cotizada' as const,
  estado_facturacion: 'pendiente' as const,
  resolvio_ticket: null,
  creado_en: '2026-09-29T14:02:00.000Z',
  cerrada_en: null,
};

it('con OT vinculada: la cabecera muestra "OT-0218 · Facturable", la tarjeta la lista y el botón dice "Crear otra OT"', async () => {
  montar(
    ticketDePrueba({
      tipo: 'ot_facturable',
      ot_vinculada: { id: 5, codigo: 'OT-0218', tipo: 'facturable' },
      ots: [OT_BREVE],
    }),
  );
  expect(await screen.findByText('OT-0218 · Facturable')).toBeTruthy();
  const tarjeta = screen.getByRole('region', { name: 'OT vinculadas' });
  expect(within(tarjeta).getByRole('link', { name: 'OT-0218' }).getAttribute('href')).toBe(
    '/ots/5',
  );
  expect(within(tarjeta).getByText('Cotizada')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Crear otra OT' }).length).toBe(2);
  expect(screen.queryByRole('button', { name: 'Convertir en OT' })).toBeNull();
});

it('sin OT la tarjeta dice "Sin OT" y ofrece "Crear OT"', async () => {
  montar();
  const tarjeta = await screen.findByRole('region', { name: 'OT vinculadas' });
  expect(within(tarjeta).getByText('Sin OT')).toBeTruthy();
  expect(within(tarjeta).getByRole('button', { name: 'Crear OT' })).toBeTruthy();
});

it('un ticket cerrado no se puede convertir en OT', async () => {
  montar(ticketDePrueba({ estado: 'resuelto', cerrado_en: '2026-09-29T15:00:00.000Z' }));
  const boton = await screen.findByRole('button', { name: 'Convertir en OT' });
  expect((boton as HTMLButtonElement).disabled).toBe(true);
});

it('quien solo lee no ve "Convertir en OT" ni "Crear OT"', async () => {
  montar(ticketDePrueba(), 'lectura');
  await screen.findByRole('region', { name: 'OT vinculadas' });
  expect(screen.queryByRole('button', { name: 'Convertir en OT' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Crear OT' })).toBeNull();
});

describe('DialogoConvertirEnOt', () => {
  const abrir = async (bolsa = false) => {
    const usuario = userEvent.setup();
    const llamadas = simularFetch(({ metodo, ruta: r }) => {
      if (metodo === 'POST' && r === '/api/tickets/7/convertir-en-ot') {
        return respuesta(201, { ...OT_BREVE, id: 9, codigo: 'OT-0220' });
      }
      if (metodo !== 'GET') return undefined;
      if (r === '/api/tickets/7') {
        return respuesta(
          200,
          ticketDePrueba({
            tareas: [
              { id: 1, hecha: false },
              { id: 2, hecha: false },
              { id: 3, hecha: true },
            ] as TicketDatos['tareas'],
          }),
        );
      }
      if (r.startsWith('/api/tickets/7/actividad')) return respuesta(200, actividadDe('todo'));
      if (r.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
      if (r === '/api/clientes/1') {
        return respuesta(200, {
          bolsa: { vigente: bolsa ? { id: 1, horas_mes: 20 } : null, historial: [] },
        });
      }
      return undefined;
    });
    render(
      <ConSesion yo={yoDePrueba({ rol: 'tecnico' })} ruta="/tickets/7">
        <TooltipProvider>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetallePage />} />
            <Route path="/ots/:id" element={<p>Detalle de OT</p>} />
          </Routes>
        </TooltipProvider>
      </ConSesion>,
    );
    await usuario.click(await screen.findByRole('button', { name: 'Convertir en OT' }));
    return { usuario, llamadas };
  };

  it('prellena título y responsable, avisa de las tareas y envía tipo, título y responsable', async () => {
    const { usuario, llamadas } = await abrir();
    const dialogo = await screen.findByRole('dialog', { name: 'Convertir en OT' });
    const titulo = within(dialogo).getByLabelText('Título') as HTMLInputElement;
    expect(titulo.value).toBe('Error al emitir facturas desde el ERP');
    expect(within(dialogo).getByText('Las 2 tareas pendientes pasarán a la OT.')).toBeTruthy();
    expect(within(dialogo).queryByLabelText('Descuenta de la bolsa')).toBeNull();

    await usuario.click(within(dialogo).getByRole('radio', { name: /Interna/ }));
    await usuario.clear(titulo);
    await usuario.type(titulo, 'Regularización de folios');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear OT' }));

    await waitFor(() => expect(screen.getByText('Detalle de OT')).toBeTruthy());
    const envio = llamadas.find((l) => l.metodo === 'POST');
    expect(envio?.cuerpo).toMatchObject({
      tipo: 'interna',
      titulo: 'Regularización de folios',
      responsable_tecnico_id: 3,
      descuenta_bolsa: false,
    });
  });

  it('ofrece "Descuenta de la bolsa" solo con bolsa vigente y facturable', async () => {
    const { usuario, llamadas } = await abrir(true);
    const dialogo = await screen.findByRole('dialog', { name: 'Convertir en OT' });
    await usuario.click(
      await within(dialogo).findByRole('checkbox', { name: 'Descuenta de la bolsa' }),
    );
    await usuario.click(within(dialogo).getByRole('radio', { name: /Interna/ }));
    expect(within(dialogo).queryByRole('checkbox', { name: 'Descuenta de la bolsa' })).toBeNull();
    await usuario.click(within(dialogo).getByRole('radio', { name: /Facturable/ }));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear OT' }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toMatchObject({
      tipo: 'facturable',
      descuenta_bolsa: true,
    });
  });
});

it('un seguimiento copiado de una OT muestra su origen y, tras el cierre, "Cierre de OT-0218"', async () => {
  const copiado = {
    ...SEGUIMIENTO,
    mensaje: {
      ...SEGUIMIENTO.mensaje,
      id: 30,
      texto: 'Quedó resuelto',
      copiado_de: { mensaje_id: 12, ot: { id: 5, codigo: 'OT-0218' } },
    },
  };
  const cierre = {
    tipo: 'evento' as const,
    creado_en: '2026-09-28T20:09:00.000Z',
    evento: {
      ...EVENTO.evento,
      id: 31,
      accion: 'ot_cerrada',
      campo: null,
      valor_anterior: null,
      valor_nuevo: 'OT-0218 cerrada · resolvió el ticket',
      datos: { ot_id: 5, codigo: 'OT-0218', resolvio_ticket: true, resumen: 'Listo' },
    },
  };
  const otro = {
    ...copiado,
    mensaje: {
      ...copiado.mensaje,
      id: 32,
      texto: 'Otro avance',
      copiado_de: { mensaje_id: 13, ot: { id: 6, codigo: 'OT-0219' } },
    },
  };
  simularFetch(({ metodo, ruta: r }) => {
    if (metodo !== 'GET') return undefined;
    if (r === '/api/tickets/7') return respuesta(200, ticketDePrueba());
    if (r.startsWith('/api/tickets/7/actividad')) {
      return respuesta(200, {
        items: [cierre, copiado, otro],
        conteos: { todo: 3, seguimiento: 2, nota_interna: 0, historial: 1 },
      });
    }
    if (r.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()} ruta="/tickets/7">
      <TooltipProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetallePage />} />
        </Routes>
      </TooltipProvider>
    </ConSesion>,
  );
  const articulos = await screen.findAllByRole('article', {
    name: /Seguimiento de Sebastián Díaz/,
  });
  const cerrado = articulos.find((a) => a.textContent?.includes('Quedó resuelto'))!;
  expect(within(cerrado).getByText(/Cierre de/)).toBeTruthy();
  expect(within(cerrado).getByRole('link', { name: 'OT-0218' }).getAttribute('href')).toBe(
    '/ots/5',
  );
  const noCierre = articulos.find((a) => a.textContent?.includes('Otro avance'))!;
  expect(within(noCierre).getByText(/Seguimiento · desde/)).toBeTruthy();
  expect(screen.getByText('OT-0218 · resolvió el ticket')).toBeTruthy();
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
