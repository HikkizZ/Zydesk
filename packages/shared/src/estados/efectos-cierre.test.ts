import { describe, expect, it } from 'vitest';
import { efectosCierreOt, type ContextoCierreOt } from './efectos-cierre.js';

const ticket: ContextoCierreOt['ticket'] = {
  codigo: 'TK-1048',
  estado: 'en_curso',
  responsables: [{ nombre: 'Felipe Castro' }, { nombre: 'Sofía Díaz' }],
  seguidores: [{ nombre: 'Sofía Díaz' }, { nombre: 'Nora Vega' }],
};
const facturable = (neto: number | null): ContextoCierreOt['ot'] => ({
  codigo: 'OT-0218',
  tipo: 'facturable',
  neto,
});
const interna: ContextoCierreOt['ot'] = { codigo: 'OT-0215', tipo: 'interna', neto: null };

const AVISOS = 'Se avisa a Felipe Castro y Sofía Díaz (responsables) y a quienes siguen el ticket.';

describe('efectosCierreOt', () => {
  it('sí resolvió, facturable con neto', () => {
    const e = efectosCierreOt(
      { ot: facturable(1_190_000), ticket, responsable_siguiente: null },
      { resolvio_ticket: true, resumen: 'Listo' },
    );
    expect(e.ot).toBe(
      'Pasa a Cerrada y queda «Por facturar» ($1.190.000 neto). Se factura aunque no haya resuelto el ticket.',
    );
    expect(e.ticket).toBe('Pasa a Resuelto.');
    expect(e.historial).toBe(
      'En TK-1048 se registra «OT-0218 cerrada · resolvió el ticket» junto al resumen.',
    );
    expect(e.avisos).toBe(AVISOS);
    expect(e.ticket_estado_final).toBe('resuelto');
    expect(e.estado_facturacion_final).toBe('por_facturar');
    expect(e.crea_nueva_ot).toBe(false);
    expect(e.destinatarios).toEqual(['Felipe Castro', 'Sofía Díaz', 'Nora Vega']);
  });

  it('sí resolvió, facturable sin neto', () => {
    const e = efectosCierreOt(
      { ot: facturable(null), ticket, responsable_siguiente: null },
      { resolvio_ticket: true, resumen: 'Listo' },
    );
    expect(e.ot).toBe(
      'Pasa a Cerrada y queda «Por facturar». Se factura aunque no haya resuelto el ticket.',
    );
  });

  it('sí resolvió, interna', () => {
    const e = efectosCierreOt(
      { ot: interna, ticket, responsable_siguiente: null },
      { resolvio_ticket: true, resumen: 'Listo' },
    );
    expect(e.ot).toBe('Pasa a Cerrada. Es interna: no se factura.');
    expect(e.estado_facturacion_final).toBe('no_aplica');
    expect(e.ticket_estado_final).toBe('resuelto');
  });

  it('no resolvió, vuelve a En curso', () => {
    const e = efectosCierreOt(
      { ot: facturable(null), ticket, responsable_siguiente: { nombre: 'Sofía Díaz' } },
      {
        resolvio_ticket: false,
        resumen: 'Falta',
        siguiente: { accion: 'en_curso', responsable_id: 2 },
      },
    );
    expect(e.ticket).toBe('No se resuelve: sigue abierto y vuelve a En curso con Sofía Díaz');
    expect(e.historial).toBe(
      'En TK-1048 se registra «OT-0218 cerrada · no resolvió el ticket» junto al resumen.',
    );
    expect(e.ticket_estado_final).toBe('en_curso');
    expect(e.crea_nueva_ot).toBe(false);
  });

  it('no resolvió, pasa a En espera', () => {
    const e = efectosCierreOt(
      { ot: facturable(null), ticket, responsable_siguiente: { nombre: 'Nora Vega' } },
      {
        resolvio_ticket: false,
        resumen: 'Falta',
        siguiente: { accion: 'en_espera', responsable_id: 3, espera_de: 'proveedor' },
      },
    );
    expect(e.ticket).toBe(
      'No se resuelve: sigue abierto y pasa a En espera (proveedor) con Nora Vega',
    );
    expect(e.ticket_estado_final).toBe('en_espera');
    expect(e.crea_nueva_ot).toBe(false);
  });

  it('no resolvió, nueva OT', () => {
    const e = efectosCierreOt(
      { ot: interna, ticket, responsable_siguiente: { nombre: 'Felipe Castro' } },
      {
        resolvio_ticket: false,
        resumen: 'Falta',
        siguiente: { accion: 'nueva_ot', responsable_id: 1 },
      },
    );
    expect(e.ticket).toBe(
      'No se resuelve: sigue abierto y se crea una OT nueva vinculada, a cargo de Felipe Castro',
    );
    expect(e.ticket_estado_final).toBe('en_curso');
    expect(e.crea_nueva_ot).toBe(true);
    expect(e.estado_facturacion_final).toBe('no_aplica');
  });

  it('sin responsables: solo avisa a los seguidores', () => {
    const e = efectosCierreOt(
      { ot: interna, ticket: { ...ticket, responsables: [] }, responsable_siguiente: null },
      { resolvio_ticket: true, resumen: 'Listo' },
    );
    expect(e.avisos).toBe('Se avisa a quienes siguen el ticket.');
    expect(e.destinatarios).toEqual(['Sofía Díaz', 'Nora Vega']);
  });
});
