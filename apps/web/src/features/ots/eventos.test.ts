import { expect, it } from 'vitest';
import type { EventoDatos } from '@/features/tickets/eventos';
import { describirEventoOt } from './eventos';

const evento = (cambios: Partial<EventoDatos>): EventoDatos => ({
  id: 1,
  creado_en: '2026-09-29T13:02:00.000Z',
  autor: { id: 2, nombre: 'Camila Rojas' },
  accion: 'cambio',
  campo: null,
  valor_anterior: null,
  valor_nuevo: null,
  datos: null,
  ...cambios,
});

it('creada: desde el ticket, y a partir de otra OT', () => {
  expect(
    describirEventoOt(evento({ accion: 'creada', datos: { desde_ticket: { codigo: 'TK-1048' } } })),
  ).toEqual({ texto: 'creó la OT desde TK-1048' });
  expect(
    describirEventoOt(
      evento({
        accion: 'creada',
        datos: { desde_ticket: { codigo: 'TK-1048' }, desde_ot: { codigo: 'OT-0218' } },
      }),
    ).texto,
  ).toBe('creó la OT desde TK-1048 a partir de OT-0218');
});

it('cambio de etapa con chip y detalle de la aprobación interna', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'etapa',
        valor_anterior: 'Borrador',
        valor_nuevo: 'Aprobada',
        datos: { aprobada_por: 'Camila Rojas' },
      }),
    ),
  ).toEqual({
    texto: 'cambió la etapa',
    cambio: 'Borrador → Aprobada',
    detalle: 'aprobó Camila Rojas',
  });
});

it('cambio de etapa por aprobación del cliente: contacto y forma', () => {
  const d = describirEventoOt(
    evento({
      campo: 'etapa',
      valor_anterior: 'Cotizada',
      valor_nuevo: 'Aprobada por cliente',
      datos: { contacto: 'Paula Herrera', forma: 'orden_de_compra' },
    }),
  );
  expect(d.detalle).toBe('contacto Paula Herrera · orden de compra');
});

it('cancelación muestra el motivo; el cierre dice si resolvió el ticket', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'etapa',
        valor_anterior: 'Borrador',
        valor_nuevo: 'Cancelada',
        datos: { motivo: 'El cliente desistió' },
      }),
    ).detalle,
  ).toBe('El cliente desistió');
  expect(
    describirEventoOt(
      evento({
        campo: 'etapa',
        valor_anterior: 'En ejecución',
        valor_nuevo: 'Cerrada',
        datos: { resolvio_ticket: false, siguiente: null },
      }),
    ).detalle,
  ).toBe('no resolvió el ticket');
});

it('cambio de tipo', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'tipo',
        valor_anterior: 'Facturable · externa',
        valor_nuevo: 'Interna · no facturable',
      }),
    ),
  ).toEqual({
    texto: 'cambió el tipo',
    cambio: 'Facturable · externa → Interna · no facturable',
  });
});

it('estado de facturación: facturada con N° de factura', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'estado_facturacion',
        valor_anterior: 'Por facturar',
        valor_nuevo: 'Facturada',
        datos: { n_factura: '1234' },
      }),
    ),
  ).toEqual({ texto: 'marcó la OT como facturada · N° 1234' });
});

it('tareas traspasadas y archivos agregados, con singular y plural', () => {
  expect(
    describirEventoOt(
      evento({ accion: 'tareas_traspasadas', datos: { desde: 'TK-1048', n: 3, titulos: [] } }),
    ).texto,
  ).toBe('recibió 3 tareas de TK-1048');
  expect(describirEventoOt(evento({ accion: 'archivos_agregados', datos: { n: 2 } })).texto).toBe(
    'agregó 2 archivos',
  );
  expect(describirEventoOt(evento({ accion: 'archivos_agregados', datos: { n: 1 } })).texto).toBe(
    'agregó 1 archivo',
  );
});

it('eventos de tareas se describen como en un ticket', () => {
  expect(
    describirEventoOt(evento({ accion: 'tarea_creada', datos: { titulo: 'Capacitación breve' } }))
      .texto,
  ).toBe('agregó la tarea «Capacitación breve»');
});

// Cotizaciones (spec fase 4 §12) ------------------------------------------------------------

it('cotización creada: chip con código y versión; desde otra versión', () => {
  expect(
    describirEventoOt(
      evento({
        accion: 'cotizacion_creada',
        valor_nuevo: 'COT-0218 v1',
        datos: { cotizacion_id: 4, codigo: 'COT-0218', version: 1 },
      }),
    ),
  ).toEqual({ texto: 'creó la cotización', cambio: 'COT-0218 v1' });
  expect(
    describirEventoOt(
      evento({
        accion: 'cotizacion_creada',
        valor_nuevo: 'COT-0218 v2',
        datos: { cotizacion_id: 5, codigo: 'COT-0218', version: 2, desde_version: 1 },
      }),
    ),
  ).toEqual({ texto: 'creó la cotización a partir de la v1', cambio: 'COT-0218 v2' });
});

it('cotización enviada, aprobada y rechazada llevan el chip de la API', () => {
  expect(
    describirEventoOt(
      evento({ accion: 'cotizacion_enviada', valor_nuevo: 'COT-0218 v1 · $565.250' }),
    ),
  ).toEqual({ texto: 'marcó como enviada', cambio: 'COT-0218 v1 · $565.250' });
  expect(
    describirEventoOt(
      evento({ accion: 'cotizacion_aprobada', valor_nuevo: 'COT-0218 v1 · $565.250' }),
    ),
  ).toEqual({ texto: 'el cliente aprobó', cambio: 'COT-0218 v1 · $565.250' });
  expect(
    describirEventoOt(evento({ accion: 'cotizacion_rechazada', valor_nuevo: 'COT-0218 v1' })),
  ).toEqual({ texto: 'el cliente rechazó', cambio: 'COT-0218 v1' });
});

it('sin valor_nuevo el chip se arma con los datos', () => {
  expect(
    describirEventoOt(
      evento({ accion: 'cotizacion_enviada', datos: { codigo: 'COT-0218', version: 3 } }),
    ).cambio,
  ).toBe('COT-0218 v3');
});

it('líneas agregadas desde las tareas o la plantilla, con singular y plural', () => {
  expect(
    describirEventoOt(
      evento({ accion: 'cotizacion_lineas_agregadas', datos: { n: 4, origen: 'tareas' } }),
    ).texto,
  ).toBe('agregó 4 líneas desde las tareas');
  expect(
    describirEventoOt(
      evento({
        accion: 'cotizacion_lineas_agregadas',
        datos: { n: 1, origen: 'plantilla', plantilla_id: 2 },
      }),
    ).texto,
  ).toBe('agregó 1 línea desde la plantilla');
});

it('descarga y eliminación del borrador', () => {
  expect(
    describirEventoOt(
      evento({
        accion: 'cotizacion_descargada',
        datos: { cotizacion_id: 4, codigo: 'COT-0218', version: 1, formato: 'xlsx' },
      }),
    ).texto,
  ).toBe('descargó COT-0218 v1 en .xlsx');
  expect(
    describirEventoOt(
      evento({
        accion: 'cotizacion_eliminada',
        valor_anterior: 'COT-0218 v2',
        datos: { cotizacion_id: 5, codigo: 'COT-0218', version: 2 },
      }),
    ).texto,
  ).toBe('eliminó el borrador COT-0218 v2');
});

it('edición de la cotización: cambió el campo de la cotización con el chip de montos', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'neto',
        valor_anterior: '$400.000',
        valor_nuevo: '$475.000',
        datos: { cotizacion_id: 4, version: 2 },
      }),
    ),
  ).toEqual({
    texto: 'cambió el neto de la cotización',
    cambio: '$400.000 → $475.000',
    detalle: 'Versión 2',
  });
  expect(
    describirEventoOt(
      evento({
        campo: 'lineas',
        valor_anterior: '4 líneas',
        valor_nuevo: '5 líneas',
        datos: { cotizacion_id: 4, version: 1 },
      }),
    ).texto,
  ).toBe('cambió las líneas de la cotización');
});

it('el cambio de etapa con cotizacion_id se sigue describiendo como cambio de etapa', () => {
  expect(
    describirEventoOt(
      evento({
        campo: 'etapa',
        valor_anterior: 'Borrador',
        valor_nuevo: 'Cotizada',
        datos: { cotizacion_id: 4, codigo: 'COT-0218', version: 1 },
      }),
    ),
  ).toEqual({ texto: 'cambió la etapa', cambio: 'Borrador → Cotizada' });
});

it('un cambio de contacto de la OT (sin cotizacion_id) no se confunde con el de la cotización', () => {
  expect(
    describirEventoOt(evento({ campo: 'contacto', valor_anterior: 'A', valor_nuevo: 'B' })).texto,
  ).toBe('cambió el contacto');
});
