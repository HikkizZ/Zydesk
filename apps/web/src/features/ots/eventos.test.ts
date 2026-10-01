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
