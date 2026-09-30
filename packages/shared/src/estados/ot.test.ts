import { describe, expect, it } from 'vitest';
import { ETAPAS_OT, TIPOS_OT, type EtapaOt, type TipoOt } from '../enums/ot.js';
import {
  CambioEtapaOt,
  CancelarOt,
  CierreOt,
  esEtapaFinal,
  estadoFacturacionInicial,
  etapasDe,
  FacturarOt,
  pasoVisual,
  puedeCambiarEtapa,
  transicionesEtapaDesde,
} from './ot.js';

const PERMITIDAS: Record<TipoOt, Record<EtapaOt, EtapaOt[]>> = {
  facturable: {
    borrador: ['cotizada', 'cancelada'],
    cotizada: ['aprobada', 'borrador', 'cancelada'],
    aprobada: ['en_ejecucion', 'cancelada'],
    en_ejecucion: ['cerrada', 'cancelada'],
    cerrada: [],
    cancelada: [],
  },
  interna: {
    borrador: ['aprobada', 'cancelada'],
    cotizada: [],
    aprobada: ['en_ejecucion', 'cancelada'],
    en_ejecucion: ['cerrada', 'cancelada'],
    cerrada: [],
    cancelada: [],
  },
};

describe('máquina de etapas de la OT', () => {
  const combinaciones = TIPOS_OT.flatMap((tipo) =>
    ETAPAS_OT.flatMap((desde) =>
      ETAPAS_OT.map(
        (hasta) => [tipo, desde, hasta, PERMITIDAS[tipo][desde].includes(hasta)] as const,
      ),
    ),
  );

  it.each(combinaciones)('%s: %s → %s: %s', (tipo, desde, hasta, esperado) => {
    expect(puedeCambiarEtapa(tipo, desde, hasta)).toBe(esperado);
  });

  it('cubre las 72 combinaciones', () => {
    expect(combinaciones).toHaveLength(72);
  });

  it('transicionesEtapaDesde coincide con la tabla', () => {
    for (const tipo of TIPOS_OT) {
      for (const e of ETAPAS_OT) {
        expect(transicionesEtapaDesde(tipo, e)).toEqual(PERMITIDAS[tipo][e]);
      }
    }
  });

  it('etapasDe', () => {
    expect(etapasDe('facturable')).toEqual([
      'borrador',
      'cotizada',
      'aprobada',
      'en_ejecucion',
      'cerrada',
    ]);
    expect(etapasDe('interna')).toEqual(['borrador', 'aprobada', 'en_ejecucion', 'cerrada']);
  });

  it('esEtapaFinal', () => {
    expect(ETAPAS_OT.filter(esEtapaFinal)).toEqual(['cerrada', 'cancelada']);
  });

  it('estadoFacturacionInicial', () => {
    expect(estadoFacturacionInicial('facturable')).toBe('pendiente');
    expect(estadoFacturacionInicial('interna')).toBe('no_aplica');
  });
});

describe('pasoVisual', () => {
  it('facturable en cotizada: actual 1, seis pasos con Facturada al final', () => {
    const v = pasoVisual({
      tipo: 'facturable',
      etapa: 'cotizada',
      estado_facturacion: 'pendiente',
    });
    expect(v.actual).toBe(1);
    expect(v.pasos).toEqual([
      'Borrador',
      'Cotizada',
      'Aprobada',
      'En ejecución',
      'Cerrada',
      'Facturada',
    ]);
  });
  it('facturable cerrada y facturada: actual 5 (Facturada)', () => {
    const v = pasoVisual({
      tipo: 'facturable',
      etapa: 'cerrada',
      estado_facturacion: 'facturada',
    });
    expect(v.actual).toBe(5);
    expect(v.pasos[5]).toBe('Facturada');
  });
  it('facturable cerrada por facturar: actual 4 (Cerrada)', () => {
    expect(
      pasoVisual({ tipo: 'facturable', etapa: 'cerrada', estado_facturacion: 'por_facturar' })
        .actual,
    ).toBe(4);
  });
  it('interna en ejecución: actual 2, sin Facturada', () => {
    const v = pasoVisual({
      tipo: 'interna',
      etapa: 'en_ejecucion',
      estado_facturacion: 'no_aplica',
    });
    expect(v.actual).toBe(2);
    expect(v.pasos).toEqual(['Borrador', 'Aprobada', 'En ejecución', 'Cerrada']);
  });
  it('cancelada: actual null', () => {
    expect(
      pasoVisual({ tipo: 'facturable', etapa: 'cancelada', estado_facturacion: 'no_aplica' })
        .actual,
    ).toBeNull();
    expect(
      pasoVisual({ tipo: 'interna', etapa: 'cancelada', estado_facturacion: 'no_aplica' }).actual,
    ).toBeNull();
  });
});

describe('esquemas de etapa, cierre, cancelación y facturación', () => {
  it('CambioEtapaOt acepta solo borrador, cotizada y en_ejecucion', () => {
    for (const etapa of ['borrador', 'cotizada', 'en_ejecucion']) {
      expect(CambioEtapaOt.safeParse({ etapa }).success).toBe(true);
    }
    for (const etapa of ['aprobada', 'cerrada', 'cancelada']) {
      expect(CambioEtapaOt.safeParse({ etapa }).success).toBe(false);
    }
  });

  it('CierreOt: resolvió sí solo pide resumen', () => {
    expect(CierreOt.safeParse({ resolvio_ticket: true, resumen: 'Listo' }).success).toBe(true);
  });
  it('CierreOt rechaza resolvio_ticket false sin siguiente', () => {
    expect(CierreOt.safeParse({ resolvio_ticket: false, resumen: 'Falta' }).success).toBe(false);
  });
  it('CierreOt rechaza en_espera sin espera_de', () => {
    const r = CierreOt.safeParse({
      resolvio_ticket: false,
      resumen: 'x',
      siguiente: { accion: 'en_espera', responsable_id: 1 },
    });
    expect(r.success).toBe(false);
  });
  it('CierreOt acepta los tres siguientes pasos', () => {
    const base = { resolvio_ticket: false, resumen: 'x' };
    expect(
      CierreOt.safeParse({ ...base, siguiente: { accion: 'en_curso', responsable_id: 1 } }).success,
    ).toBe(true);
    expect(
      CierreOt.safeParse({ ...base, siguiente: { accion: 'nueva_ot', responsable_id: 1 } }).success,
    ).toBe(true);
    expect(
      CierreOt.safeParse({
        ...base,
        siguiente: { accion: 'en_espera', responsable_id: 1, espera_de: 'cliente' },
      }).success,
    ).toBe(true);
  });
  it('CierreOt rechaza resumen vacío', () => {
    expect(CierreOt.safeParse({ resolvio_ticket: true, resumen: '   ' }).success).toBe(false);
  });
  it('CancelarOt y FacturarOt exigen texto', () => {
    expect(CancelarOt.safeParse({ motivo: '' }).success).toBe(false);
    expect(CancelarOt.safeParse({ motivo: 'Cliente desiste' }).success).toBe(true);
    expect(FacturarOt.safeParse({ n_factura: '' }).success).toBe(false);
    expect(FacturarOt.safeParse({ n_factura: 'F-1001' }).success).toBe(true);
  });
});
