import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Rol } from '@zydesk/shared';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ArchivoDatos, TicketDatos } from '@/features/tickets/api';
import type { CotizacionSalidaDatos } from '@/features/cotizador/api';
import type { OtDatos } from '@/features/ots/api';
import { cotizacionDePrueba } from '@/test/cotizaciones';
import { respuesta, simularFetch } from '@/test/fetch';
import { otDePrueba } from '@/test/ots';
import { simularMovil } from '@/test/pantalla';
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

function Ubicacion() {
  return <output aria-label="Ruta">{useLocation().pathname}</output>;
}

function montar(
  ot: OtDatos,
  rol: Rol = 'coordinacion',
  opciones: {
    ticket?: TicketDatos;
    bolsaVigente?: boolean;
    cotizacion?: CotizacionSalidaDatos;
    manejador?: Parameters<typeof simularFetch>[0];
  } = {},
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
  const llamadas = simularFetch(
    (l) => opciones.manejador?.(l),
    ({ ruta, metodo }) => {
      if (metodo !== 'GET') return undefined;
      if (opciones.cotizacion && ruta === `/api/cotizaciones/${opciones.cotizacion.id}`) {
        return respuesta(200, opciones.cotizacion);
      }
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
    },
  );
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba({ rol })} ruta={`/ots/${ot.id}`}>
        <Routes>
          <Route path="/ots/:id" element={<OtDetallePage />} />
          <Route path="/cotizaciones/:id" element={<p>Pantalla del cotizador</p>} />
        </Routes>
        <Ubicacion />
      </ConSesion>
    </TooltipProvider>,
  );
  return llamadas;
}

const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });

it('bajo lg el grid tiene una sola columna con minmax(0,1fr) para que el contenido no ensanche la página', async () => {
  montar(otDePrueba());
  const tareas = await screen.findByRole('region', { name: 'Tareas' });
  expect(tareas.closest('.grid')?.className).toContain('grid-cols-1');
});

it('muestra el encabezado, las etapas con Cotizada actual y la cotización sin crear', async () => {
  montar(otDePrueba());
  expect(
    await screen.findByRole('heading', { level: 1, name: /Regularización de folios/ }),
  ).toBeTruthy();
  const actual = screen.getAllByRole('listitem').find((li) => li.hasAttribute('aria-current'));
  expect(actual?.textContent).toContain('Cotizada');
  expect(screen.getByText('Sin cotización')).toBeTruthy();
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
  const pestana = await within(galeria).findByRole('tab', { name: 'Todo (4)' });
  expect(within(galeria).getAllByText('desde TK-1048')).toHaveLength(2);
  // La pestaña activa controla un panel que existe (axe: aria-valid-attr-value).
  const panel = within(galeria).getByRole('tabpanel');
  expect(pestana.getAttribute('aria-controls')).toBe(panel.id);

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

it('el panel de horas enlaza a la planilla propia de la semana de hoy', async () => {
  montar(otDePrueba(), 'tecnico');
  const panel = await screen.findByRole('region', { name: 'Horas' });
  const enlace = within(panel).getByRole('link', { name: 'Ver en la planilla' });
  expect(enlace.getAttribute('href')).toMatch(/^\/horas\?semana=\d{4}-\d{2}-\d{2}$/);
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

it('sin ots.aprobar, los datos comerciales de una OT en ejecución quedan de solo lectura', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion', oc_cliente: 'OC-1' }), 'tecnico');
  const oc = (await screen.findByLabelText('N° de OC del cliente')) as HTMLInputElement;
  expect(oc.disabled).toBe(true);
  expect((screen.getByLabelText('Condición de pago') as HTMLInputElement).disabled).toBe(true);
  expect(
    screen.getByText('Solo Coordinación o Administración puede cambiarlos tras la aprobación'),
  ).toBeTruthy();
  expect((screen.getByLabelText('Título') as HTMLInputElement).disabled).toBe(false);
});

it('con ots.aprobar los datos comerciales siguen editables tras la aprobación', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion' }), 'coordinacion');
  const oc = (await screen.findByLabelText('N° de OC del cliente')) as HTMLInputElement;
  expect(oc.disabled).toBe(false);
  expect(screen.queryByText(/puede cambiarlos tras la aprobación/)).toBeNull();
});

it('en una OT cerrada el redactor no pide horas y lo explica', async () => {
  montar(otDePrueba({ etapa: 'cerrada' }), 'coordinacion');
  expect(await screen.findByText('La OT está cerrada: no se registran horas')).toBeTruthy();
  expect(screen.queryByRole('spinbutton')).toBeNull();
});

it('en una OT en ejecución el redactor sí pide horas', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion' }), 'coordinacion');
  expect((await screen.findAllByRole('spinbutton')).length).toBeGreaterThan(0);
});

// Cotización e integración con el cotizador (spec fase 4 §12) --------------------------------

const BREVE = (cambios: Partial<NonNullable<OtDatos['cotizacion']>> = {}) => {
  const c = cotizacionDePrueba();
  return {
    id: c.id,
    ot_id: c.ot_id,
    codigo: c.codigo,
    version: c.version,
    estado: c.estado,
    moneda: c.moneda,
    neto: c.neto,
    total: c.total,
    neto_clp: c.neto_clp,
    enviada_en: c.enviada_en,
    actualizado_en: c.actualizado_en,
    n_versiones: 1,
    ...cambios,
  };
};

const FACTURABLE_BORRADOR = () =>
  otDePrueba({ etapa: 'borrador', tipo_cambiable: true, puede_cotizar: true });

it('facturable en Borrador sin cotización: "Crear cotización" crea y abre el cotizador', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(FACTURABLE_BORRADOR(), 'tecnico', {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/ots/21/cotizaciones'
        ? respuesta(201, cotizacionDePrueba({ id: 9, estado: 'borrador', editable: true }))
        : undefined,
  });
  await screen.findByRole('heading', { level: 1 });
  // Una en el encabezado (primaria) y otra en el panel.
  const botones = screen.getAllByRole('button', { name: 'Crear cotización' });
  expect(botones).toHaveLength(2);
  expect(botones.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  await usuario.click(botones[0] as HTMLElement);
  await waitFor(() => expect(screen.getByLabelText('Ruta').textContent).toBe('/cotizaciones/9'));
  expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/ots/21/cotizaciones')).toBe(
    true,
  );
});

it('con un borrador de cotización el encabezado ofrece "Revisar y enviar cotización"', async () => {
  montar(
    otDePrueba({
      etapa: 'borrador',
      puede_cotizar: true,
      cotizacion: BREVE({ estado: 'borrador' }),
    }),
    'tecnico',
  );
  await screen.findByRole('heading', { level: 1 });
  const enlace = screen.getByRole('link', { name: 'Revisar y enviar cotización' });
  expect(enlace.getAttribute('href')).toBe('/cotizaciones/4');
  expect(boton('Crear cotización')).toBeNull();
});

it('sin motivo para cotizar el botón queda deshabilitado y explica por qué', async () => {
  const usuario = userEvent.setup();
  montar(otDePrueba({ etapa: 'aprobada', puede_cotizar: false }), 'tecnico');
  await screen.findByRole('heading', { level: 1 });
  const crear = boton('Crear cotización') as HTMLButtonElement;
  expect(crear.disabled).toBe(true);
  await usuario.hover(crear.parentElement as HTMLElement);
  expect((await screen.findAllByText('Solo en Borrador o Cotizada')).length).toBeGreaterThan(0);
});

it('un cliente interno explica que la OT necesita un cliente externo', async () => {
  const usuario = userEvent.setup();
  montar(
    otDePrueba({
      etapa: 'borrador',
      puede_cotizar: false,
      cliente: { id: 2, nombre: 'Interno', es_interno: true },
    }),
    'tecnico',
  );
  await screen.findByRole('heading', { level: 1 });
  const crear = boton('Crear cotización') as HTMLButtonElement;
  await usuario.hover(crear.parentElement as HTMLElement);
  expect((await screen.findAllByText('La OT necesita un cliente externo')).length).toBeGreaterThan(
    0,
  );
});

it('el panel muestra la cotización: código, estado, neto, total, vencimiento y versiones', async () => {
  montar(otDePrueba({ cotizacion: BREVE({ n_versiones: 2 }), neto: 475000 }), 'coordinacion', {
    cotizacion: cotizacionDePrueba(),
  });
  const panel = await screen.findByRole('region', { name: 'Cotización' });
  expect(within(panel).getByText('COT-0218 v1')).toBeTruthy();
  expect(within(panel).getByText('Enviada')).toBeTruthy();
  expect(within(panel).getByText('$475.000')).toBeTruthy();
  expect(within(panel).getByText('$565.250')).toBeTruthy();
  expect(await within(panel).findByText('30 oct')).toBeTruthy();
  expect(within(panel).getByText('2 versiones')).toBeTruthy();
  expect(within(panel).getByRole('link', { name: 'Abrir cotizador' }).getAttribute('href')).toBe(
    '/cotizaciones/4',
  );
});

it('con una sola versión el panel dice "1 versión"', async () => {
  montar(otDePrueba({ cotizacion: BREVE() }), 'coordinacion', { cotizacion: cotizacionDePrueba() });
  const panel = await screen.findByRole('region', { name: 'Cotización' });
  expect(within(panel).getByText('1 versión')).toBeTruthy();
});

it('"Registrar aprobación del cliente…" se habilita solo con la cotización enviada', async () => {
  const usuario = userEvent.setup();
  montar(otDePrueba({ cotizacion: BREVE({ estado: 'borrador' }) }), 'coordinacion');
  await screen.findByRole('heading', { level: 1 });
  const registrar = boton('Registrar aprobación del cliente…') as HTMLButtonElement;
  expect(registrar.disabled).toBe(true);
  await usuario.hover(registrar.parentElement as HTMLElement);
  expect(
    (await screen.findAllByText('Primero marca la cotización como enviada')).length,
  ).toBeGreaterThan(0);
});

it('con la cotización enviada, "Registrar aprobación…" está habilitado y el diálogo la nombra', async () => {
  const usuario = userEvent.setup();
  montar(otDePrueba({ cotizacion: BREVE() }), 'coordinacion', {
    cotizacion: cotizacionDePrueba({
      contacto: { id: 5, nombre: 'Paula Herrera', correo: null, area: null },
    }),
  });
  await screen.findByRole('heading', { level: 1 });
  const registrar = boton('Registrar aprobación del cliente…') as HTMLButtonElement;
  expect(registrar.disabled).toBe(false);
  await usuario.click(registrar);
  const dialogo = await screen.findByRole('dialog');
  expect(within(dialogo).getByText(/Aprueba/).textContent).toBe(
    'Aprueba COT-0218 v1 · Total $565.250',
  );
  // El contacto de la cotización queda preseleccionado.
  await waitFor(() =>
    expect(
      within(dialogo).getByRole('combobox', { name: 'Contacto que aprueba' }).textContent,
    ).toContain('Paula Herrera'),
  );
});

it('"Volver a borrador" con la cotización enviada avisa que quedará rechazada', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(otDePrueba({ cotizacion: BREVE() }), 'coordinacion', {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/ots/21/cambiar-etapa'
        ? respuesta(200, otDePrueba({ etapa: 'borrador' }))
        : undefined,
  });
  await screen.findByRole('heading', { level: 1 });
  await usuario.click(boton('Volver a borrador') as HTMLElement);
  const dialogo = await screen.findByRole('alertdialog');
  expect(dialogo.textContent).toContain('La cotización COT-0218 v1 quedará rechazada');
  expect(dialogo.textContent).toContain('podrás duplicarla como v2');
  expect(llamadas.some((l) => l.ruta === '/api/ots/21/cambiar-etapa')).toBe(false);
  await usuario.click(within(dialogo).getByRole('button', { name: 'Volver a borrador' }));
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === '/api/ots/21/cambiar-etapa')).toBe(true),
  );
  expect(llamadas.find((l) => l.ruta === '/api/ots/21/cambiar-etapa')?.cuerpo).toEqual({
    etapa: 'borrador',
  });
});

it('"Volver a borrador" sin cotización enviada no pide confirmación', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(otDePrueba({ cotizacion: null }), 'coordinacion', {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/ots/21/cambiar-etapa'
        ? respuesta(200, otDePrueba({ etapa: 'borrador' }))
        : undefined,
  });
  await screen.findByRole('heading', { level: 1 });
  await usuario.click(boton('Volver a borrador') as HTMLElement);
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === '/api/ots/21/cambiar-etapa')).toBe(true),
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('ya no existe "Marcar como cotizada"', async () => {
  montar(otDePrueba({ etapa: 'borrador', puede_cotizar: true }), 'coordinacion');
  await screen.findByRole('heading', { level: 1 });
  expect(boton(/Marcar como cotizada/)).toBeNull();
});

const INTERNA = (cambios: Partial<OtDatos> = {}) =>
  otDePrueba({
    tipo: 'interna',
    estado_facturacion: 'no_aplica',
    etapa: 'en_ejecucion',
    horas: { estimadas: 10, reales: 4, registradas: 12 },
    ...cambios,
  });

it('interna con tarifa: "12 h registradas × $18.000 = $216.000" y las horas reales', async () => {
  montar(INTERNA({ costo_interno: { horas: 12, tarifa: 18000, monto: 216000 } }), 'tecnico');
  const panel = await screen.findByRole('region', { name: 'Costo interno' });
  expect(panel.textContent).toContain('12 h registradas × $18.000 = $216.000');
  expect(within(panel).getByText('Horas reales')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Cotización' })).toBeNull();
});

it('interna sin tarifa: pide configurarla (enlace solo para admin)', async () => {
  montar(INTERNA({ costo_interno: null }), 'admin');
  const panel = await screen.findByRole('region', { name: 'Costo interno' });
  expect(
    within(panel).getByRole('link', { name: 'Configuración → Tarifas' }).getAttribute('href'),
  ).toBe('/configuracion/tarifas');
});

it('interna sin tarifa para un técnico: el texto sin enlace', async () => {
  montar(INTERNA({ costo_interno: null }), 'tecnico');
  const panel = await screen.findByRole('region', { name: 'Costo interno' });
  expect(
    within(panel).getByText('Configura la tarifa de costo interno en Configuración → Tarifas'),
  ).toBeTruthy();
  expect(within(panel).queryByRole('link')).toBeNull();
});

it('en escritorio no hay atajos, ni «details», y «Tipo y datos» es una sección plana', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion' }));
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByRole('navigation', { name: 'En esta OT' })).toBeNull();
  expect(document.querySelector('details')).toBeNull();
  expect(screen.getByRole('region', { name: 'Tipo y datos' })).toBeTruthy();
});

it('en celular hay atajos a las secciones y «Tipo y datos» queda plegado al final', async () => {
  simularMovil();
  montar(otDePrueba({ etapa: 'en_ejecucion' }));
  await screen.findByRole('heading', { level: 1 });
  const atajos = within(screen.getByRole('navigation', { name: 'En esta OT' })).getAllByRole(
    'link',
  );
  expect(atajos.map((a) => a.textContent)).toEqual([
    'Etapas',
    'Tareas',
    'Fotos',
    'Actividad',
    'Cotización',
    'Aprobación',
    'Horas',
    'Datos',
  ]);
  // Cada atajo apunta a un elemento que existe.
  for (const a of atajos) {
    expect(document.querySelector(a.getAttribute('href') as string)).not.toBeNull();
  }
  const detalles = document.querySelector('details') as HTMLDetailsElement;
  expect(detalles.open).toBe(false);
  expect(detalles.querySelector('summary')?.textContent).toBe(
    'Tipo y datos · Facturable · Viña Santa Clara',
  );
});

it('en celular el orden visual es Etapas, Tareas, Fotos, Actividad, panel y «Tipo y datos» al final', async () => {
  simularMovil();
  montar(otDePrueba({ etapa: 'en_ejecucion' }));
  await screen.findByRole('heading', { level: 1 });
  const orden = (el: Element | null) =>
    Number(/(?:^|\s)order-(\d+)(?:\s|$)/.exec(el?.className ?? '')?.[1]);
  expect(orden(document.getElementById('etapas'))).toBe(1);
  expect(orden(document.getElementById('tareas'))).toBe(2);
  expect(orden(document.getElementById('fotos'))).toBe(3);
  expect(orden(document.getElementById('actividad'))).toBe(4);
  expect(orden(screen.getByRole('complementary', { name: 'Datos de la OT' }))).toBe(6);
  expect(document.querySelector('details')?.className).toContain('order-last');
});

it('el panel conserva las tarjetas con id para los atajos', async () => {
  montar(otDePrueba({ etapa: 'en_ejecucion' }));
  await screen.findByRole('heading', { level: 1 });
  const panel = screen.getByRole('complementary', { name: 'Datos de la OT' });
  for (const id of [
    'cotizacion',
    'aprobacion',
    'facturacion',
    'ticket-origen',
    'horas',
    'datos',
    'historial',
  ]) {
    expect(panel.querySelector(`#${id}`)?.className).toContain('scroll-mt-4');
  }
});

it('en el panel todo dt y dd cuelga directo de un dl (axe definition-list y dlitem)', async () => {
  montar(
    otDePrueba({ etapa: 'cerrada', estado_facturacion: 'por_facturar', resumen_cierre: 'Listo' }),
  );
  await screen.findByRole('heading', { level: 1 });
  const panel = screen.getByRole('complementary', { name: 'Datos de la OT' });
  const items = panel.querySelectorAll('dt, dd');
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) expect(item.parentElement?.tagName).toBe('DL');
  for (const dl of panel.querySelectorAll('dl')) {
    expect(Array.from(dl.children).every((h) => h.tagName === 'DT' || h.tagName === 'DD')).toBe(
      true,
    );
  }
});

it('los enlaces del panel y del encabezado miden 44 px en celular y se relajan en escritorio', async () => {
  montar(otDePrueba());
  await screen.findByRole('heading', { level: 1 });
  const panel = screen.getByRole('complementary', { name: 'Datos de la OT' });
  const origen = within(panel.querySelector('#ticket-origen') as HTMLElement).getByRole('link', {
    name: 'TK-1048',
  });
  expect(origen.className).toContain('min-h-11');
  expect(origen.className).toContain('lg:min-h-0');
  const planilla = within(panel).getByRole('link', { name: 'Ver en la planilla' });
  expect(planilla.className).toContain('min-h-11');
  const cabecera = screen
    .getAllByRole('link', { name: 'TK-1048' })
    .find((a) => !panel.contains(a)) as HTMLElement;
  expect(cabecera.className).toContain('min-h-11');
});

it('en celular «Tipo y datos» arranca abierto solo en Borrador', async () => {
  simularMovil();
  montar(otDePrueba({ etapa: 'borrador' }));
  await screen.findByRole('heading', { level: 1 });
  expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(true);
});

it('«Descuenta de la bolsa» usa la casilla táctil de 44 px', async () => {
  montar(otDePrueba({ etapa: 'borrador' }), 'coordinacion', { bolsaVigente: true });
  const casilla = await screen.findByRole('checkbox', { name: 'Descuenta de la bolsa' });
  const etiqueta = casilla.closest('label');
  expect(etiqueta?.className).toContain('size-11');
});
