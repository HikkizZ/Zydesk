import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Rol } from '@zydesk/shared';
import { Route, Routes } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ArchivoDatos, TicketDatos } from '@/features/tickets/api';
import type { OtDatos } from '@/features/ots/api';
import { respuesta, simularFetch } from '@/test/fetch';
import { otDePrueba } from '@/test/ots';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { ticketDePrueba, USUARIOS_PRUEBA } from '@/test/tickets';
import { OtDetallePage } from './OtDetallePage';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});
afterEach(() => vi.unstubAllGlobals());

const archivo = (id: number, nombre: string, extra: Partial<ArchivoDatos> = {}): ArchivoDatos => ({
  id,
  nombre_original: nombre,
  tipo_mime: 'image/png',
  tamano: 1000,
  categoria: 'foto',
  url: `/api/archivos/${id}`,
  es_imagen: true,
  subido_por: null,
  subido_en: '2026-09-29T14:00:00.000Z',
  origen_correo: false,
  ...extra,
});

const CLIENTE = {
  id: 1,
  nombre: 'Viña Santa Clara',
  es_interno: false,
  activo: true,
  contactos: [
    {
      id: 5,
      cliente_id: 1,
      nombre: 'Paula Herrera',
      area: null,
      correo: null,
      telefono: null,
      aprueba_cotizaciones: true,
      activo: true,
    },
  ],
  bolsa: { vigente: null, historial: [] },
  tarifas: [],
};

function montar(
  ot: OtDatos,
  rol: Rol = 'coordinacion',
  opciones: { ticket?: TicketDatos; bolsaVigente?: boolean } = {},
) {
  const cliente = opciones.bolsaVigente
    ? {
        ...CLIENTE,
        bolsa: {
          vigente: {
            id: 1,
            cliente_id: 1,
            horas_mes: 20,
            vigente_desde: '2026-01-01',
            vigente_hasta: null,
            fecha_renovacion: null,
            notas: null,
            vigente: true,
            horas_usadas_mes: null,
          },
          historial: [],
        },
      }
    : CLIENTE;
  const llamadas = simularFetch(({ ruta, metodo }) => {
    if (metodo !== 'GET') return undefined;
    if (ruta === `/api/ots/${ot.id}`) return respuesta(200, ot);
    if (ruta.startsWith(`/api/ots/${ot.id}/actividad`)) {
      return respuesta(200, {
        items: [],
        conteos: { todo: 0, seguimiento: 0, nota_interna: 0, historial: 0 },
      });
    }
    if (ruta === '/api/tickets/7') return respuesta(200, opciones.ticket ?? ticketDePrueba());
    if (ruta.startsWith('/api/clientes/')) return respuesta(200, cliente);
    if (ruta.startsWith('/api/clientes')) return respuesta(200, []);
    if (ruta.startsWith('/api/usuarios')) return respuesta(200, USUARIOS_PRUEBA);
    return undefined;
  });
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba({ rol })} ruta={`/ots/${ot.id}`}>
        <Routes>
          <Route path="/ots/:id" element={<OtDetallePage />} />
        </Routes>
      </ConSesion>
    </TooltipProvider>,
  );
  return llamadas;
}

const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });

it('muestra el encabezado, las etapas con Cotizada actual y la cotización deshabilitada', async () => {
  montar(otDePrueba());
  expect(
    await screen.findByRole('heading', { level: 1, name: /Regularización de folios/ }),
  ).toBeTruthy();
  const actual = screen.getAllByRole('listitem').find((li) => li.hasAttribute('aria-current'));
  expect(actual?.textContent).toContain('Cotizada');
  expect(screen.getByText('Cotizador disponible en la Fase 4')).toBeTruthy();
  expect((boton('Crear cotización') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByRole('link', { name: 'TK-1048' }).length).toBeGreaterThan(0);
});

it('acciones de una facturable en cotizada para coordinación', async () => {
  montar(otDePrueba({ etapa: 'cotizada' }));
  await screen.findByRole('heading', { level: 1 });
  expect(boton('Registrar aprobación del cliente…')).toBeTruthy();
  expect(boton('Volver a borrador')).toBeTruthy();
  expect(boton('Cancelar OT…')).toBeTruthy();
  expect(boton('Cerrar OT…')).toBeNull();
});

it('el técnico no ve cerrar, aprobar ni cancelar; coordinación ve "Cerrar OT"', async () => {
  const enEjecucion = otDePrueba({ etapa: 'en_ejecucion', tipo_cambiable: false });
  montar(enEjecucion, 'tecnico');
  await screen.findByRole('heading', { level: 1 });
  expect(boton('Cerrar OT…')).toBeNull();
  expect(boton('Cancelar OT…')).toBeNull();
  expect(boton('Registrar aprobación del cliente…')).toBeNull();
});

it('coordinación ve "Cerrar OT…" en una OT en ejecución', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion', tipo_cambiable: false }), 'coordinacion');
  await screen.findByRole('heading', { level: 1 });
  expect(boton('Cerrar OT…')).toBeTruthy();
  expect(boton('Cancelar OT…')).toBeTruthy();
});

it('interna en borrador: coordinación aprueba; el técnico ve quién debe aprobar', async () => {
  const interna = otDePrueba({
    tipo: 'interna',
    estado_facturacion: 'no_aplica',
    etapa: 'borrador',
    aprobador: { id: 2, nombre: 'Camila Rojas', iniciales: 'CR', color_avatar: '#F2D7C9' },
  });
  montar(interna, 'tecnico');
  await screen.findByRole('heading', { level: 1 });
  expect(boton('Aprobar e iniciar')).toBeNull();
  expect(screen.getByText('Pendiente de aprobación de Camila Rojas')).toBeTruthy();
});

it('interna en borrador: "Aprobar e iniciar" llama a aprobar con iniciar', async () => {
  const usuario = userEvent.setup();
  const interna = otDePrueba({
    tipo: 'interna',
    estado_facturacion: 'no_aplica',
    etapa: 'borrador',
  });
  const llamadas = montar(interna, 'coordinacion');
  await screen.findByRole('heading', { level: 1 });
  await usuario.click(boton('Aprobar e iniciar') as HTMLElement);
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true));
  const post = llamadas.find((l) => l.metodo === 'POST');
  expect(post?.ruta).toBe('/api/ots/21/aprobar');
  expect(post?.cuerpo).toEqual({ iniciar: true });
});

it('cerrada por facturar: solo quien puede facturar ve "Marcar facturada…"', async () => {
  const cerrada = otDePrueba({
    etapa: 'cerrada',
    estado_facturacion: 'por_facturar',
    resolvio_ticket: true,
    resumen_cierre: 'Listo',
    tipo_cambiable: false,
  });
  montar(cerrada, 'coordinacion');
  await screen.findByRole('heading', { level: 1 });
  expect(boton('Marcar facturada…')).toBeTruthy();
  expect(boton('Cancelar OT…')).toBeNull();
  expect(screen.getByText('Listo')).toBeTruthy();
});

it('con lectura todo es solo lectura', async () => {
  montar(otDePrueba(), 'lectura');
  await screen.findByRole('heading', { level: 1 });
  expect(screen.getByText('Solo lectura')).toBeTruthy();
  expect(boton('Guardar')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Redactor' })).toBeNull();
});

it('el tipo solo se cambia en Borrador', async () => {
  montar(otDePrueba({ etapa: 'cotizada', tipo_cambiable: false }));
  await screen.findByRole('heading', { level: 1 });
  const radios = screen.getAllByRole('radio', { name: /Facturable|Interna/ });
  expect(radios.every((r) => (r as HTMLInputElement).disabled)).toBe(true);
  expect(screen.getByText('El tipo solo se cambia en Borrador')).toBeTruthy();
});

it('en Borrador cambiar el tipo pide confirmación y hace PATCH', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(otDePrueba({ etapa: 'borrador', tipo_cambiable: true }));
  await screen.findByRole('heading', { level: 1 });
  await usuario.click(screen.getByRole('radio', { name: /Interna/ }));
  expect(await screen.findByText('Se limpiarán los campos del otro tipo.')).toBeTruthy();
  await usuario.click(screen.getByRole('button', { name: 'Cambiar tipo' }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(true));
  expect(llamadas.find((l) => l.metodo === 'PATCH')?.cuerpo).toEqual({ tipo: 'interna' });
});

it('la galería agrupa por pestaña y suma los archivos del ticket de origen', async () => {
  const usuario = userEvent.setup();
  const ticket = ticketDePrueba({
    archivos: [archivo(30, 'plano.pdf', { categoria: 'documento', es_imagen: false })],
    correo: {
      id: 1,
      origen: 'eml',
      de: null,
      para: null,
      fecha: null,
      asunto: null,
      cuerpo: '',
      archivo: archivo(31, 'correo_original.msg', { categoria: 'correo', es_imagen: false }),
      adjuntos: [],
    },
  });
  montar(
    otDePrueba({ archivos: [archivo(10, 'captura_error.png'), archivo(11, 'log.png')] }),
    'coordinacion',
    {
      ticket,
    },
  );
  const galeria = await screen.findByRole('region', { name: 'Fotos y archivos' });
  expect(await within(galeria).findByRole('tab', { name: 'Todo (4)' })).toBeTruthy();
  expect(within(galeria).getAllByText('desde TK-1048')).toHaveLength(2);

  await usuario.click(within(galeria).getByRole('tab', { name: 'Fotos (2)' }));
  expect(within(galeria).getAllByRole('img')).toHaveLength(2);
  await usuario.click(within(galeria).getByRole('tab', { name: 'Correos (1)' }));
  expect(within(galeria).getByText('correo_original.msg')).toBeTruthy();
  expect(within(galeria).queryByText('plano.pdf')).toBeNull();
});

it('la casilla "Descuenta de la bolsa" solo aparece con bolsa vigente', async () => {
  montar(otDePrueba(), 'coordinacion', { bolsaVigente: false });
  await screen.findByRole('heading', { level: 1 });
  await screen.findByLabelText('Contacto');
  expect(screen.queryByRole('checkbox', { name: 'Descuenta de la bolsa' })).toBeNull();
});

it('con bolsa vigente aparece la casilla y las horas usadas del mes', async () => {
  montar(
    otDePrueba({ bolsa: { contrato_id: 1, horas_mes: 20, usadas_mes: 12.5 } }),
    'coordinacion',
    { bolsaVigente: true },
  );
  expect(await screen.findByRole('checkbox', { name: 'Descuenta de la bolsa' })).toBeTruthy();
  expect(screen.getByText('12,5 / 20 h usadas este mes')).toBeTruthy();
});

it('OT inexistente muestra "OT no encontrada"', async () => {
  simularFetch(() => undefined);
  render(
    <ConSesion yo={yoDePrueba()} ruta="/ots/99">
      <Routes>
        <Route path="/ots/:id" element={<OtDetallePage />} />
      </Routes>
    </ConSesion>,
  );
  expect(await screen.findByText('OT no encontrada')).toBeTruthy();
});
