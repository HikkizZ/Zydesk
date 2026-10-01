import { describe, expect, it, vi } from 'vitest';
import { eventosDominio, publicar, publicarPendientes } from './dominio.js';

describe('eventos de dominio', () => {
  it('publicar entrega los datos a un oyente registrado', () => {
    const oyente = vi.fn();
    eventosDominio.on('ot.cerrada', oyente);
    const datos = { ot_id: 1, ticket_id: 2, resolvio_ticket: true, destinatarios_ids: [3, 4] };
    publicar('ot.cerrada', datos);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(oyente).toHaveBeenCalledWith(datos);
    eventosDominio.off('ot.cerrada', oyente);
    publicar('ot.cerrada', datos);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('un oyente solo recibe el evento al que se suscribió', () => {
    const oyente = vi.fn();
    eventosDominio.on('ot.por_facturar', oyente);
    publicar('ot.por_aprobar', { ot_id: 1, aprobador_id: 2 });
    expect(oyente).not.toHaveBeenCalled();
    eventosDominio.off('ot.por_facturar', oyente);
  });

  it('publicarPendientes publica en orden', () => {
    const orden: string[] = [];
    const a = vi.fn(() => orden.push('por_facturar'));
    const b = vi.fn(() => orden.push('cancelada'));
    eventosDominio.on('ot.por_facturar', a);
    eventosDominio.on('ot.cancelada', b);
    publicarPendientes([
      ['ot.por_facturar', { ot_id: 5 }],
      ['ot.cancelada', { ot_id: 6, ticket_id: 7, destinatarios_ids: [] }],
    ]);
    expect(orden).toEqual(['por_facturar', 'cancelada']);
    eventosDominio.off('ot.por_facturar', a);
    eventosDominio.off('ot.cancelada', b);
  });
});
