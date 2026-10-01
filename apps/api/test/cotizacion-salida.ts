import { calcularCotizacion, enClp, venceEl, type Moneda } from '@zydesk/shared';
import type { CotizacionSalidaDatos } from '../src/modulos/cotizaciones/cotizaciones.tipos.js';

type Linea = CotizacionSalidaDatos['lineas'][number];

// Las 5 líneas del diseño COT-0218: neto 475.000, IVA 90.250, total 565.250.
export const LINEAS_DISENO: Omit<Linea, 'id' | 'orden' | 'total'>[] = [
  {
    tipo: 'mano_de_obra',
    descripcion: 'Diagnóstico y revisión de logs del ERP',
    cantidad: 3,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Carga de nuevo CAF y pruebas en QA',
    cantidad: 4,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Paso a producción (horario extendido)',
    cantidad: 2,
    unidad: 'h',
    precio_unitario: 45000,
    descuento_pct: 0,
  },
  {
    tipo: 'mano_de_obra',
    descripcion: 'Capacitación breve al equipo',
    cantidad: 1,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
  },
  {
    tipo: 'servicio',
    descripcion: 'Soporte remoto post-implementación',
    cantidad: 1,
    unidad: 'un',
    precio_unitario: 90000,
    descuento_pct: 10,
  },
];

// `CotizacionSalida` armada con `calcularCotizacion`, sin BD (para probar los exportadores).
export function cotizacionDePrueba(
  extra: Partial<Omit<CotizacionSalidaDatos, 'lineas'>> & {
    lineas?: Omit<Linea, 'id' | 'orden' | 'total'>[];
  } = {},
): CotizacionSalidaDatos {
  const moneda: Moneda = extra.moneda ?? 'CLP';
  const aplica_iva = extra.aplica_iva ?? true;
  const iva_pct = extra.iva_pct ?? 19;
  const base = extra.lineas ?? LINEAS_DISENO;
  const r = calcularCotizacion(base, { moneda, aplica_iva, iva_pct });
  const valor_uf = extra.valor_uf !== undefined ? extra.valor_uf : moneda === 'UF' ? 38000 : null;
  const fecha_emision = extra.fecha_emision ?? '2026-09-29';
  const validez_dias = extra.validez_dias ?? 30;
  const resto: Partial<Omit<CotizacionSalidaDatos, 'lineas'>> = { ...extra };
  delete (resto as { lineas?: unknown }).lineas;
  return {
    id: 1,
    ot_id: 1,
    codigo: 'COT-0218',
    version: 1,
    estado: 'enviada',
    moneda,
    neto: r.neto,
    total: r.total,
    neto_clp: enClp(r.neto, moneda, valor_uf),
    enviada_en: '2026-09-29T14:00:00.000Z',
    actualizado_en: '2026-09-29T14:00:00.000Z',
    ot: {
      id: 1,
      codigo: 'OT-0218',
      titulo: 'Regularización de folios',
      tipo: 'facturable',
      etapa: 'cotizada',
      ticket: { id: 1, codigo: 'TK-1048' },
    },
    cliente: { id: 1, nombre: 'Comercial Andes SpA', es_interno: false },
    contacto: { id: 1, nombre: 'Paula Herrera', correo: 'paula@andes.cl', area: null },
    fecha_emision,
    validez_dias,
    vence_el: venceEl(fecha_emision, validez_dias),
    valor_uf,
    aplica_iva,
    iva_pct,
    condiciones: 'Pago a 30 días desde la factura.',
    nota_interna: null,
    lineas: base.map((l, i) => ({ ...l, id: i + 1, orden: i + 1, total: r.lineas[i]! })),
    totales: {
      subtotal: r.subtotal,
      descuentos: r.descuentos,
      neto: r.neto,
      iva: r.iva,
      total: r.total,
    },
    total_clp: enClp(r.total, moneda, valor_uf),
    versiones: [],
    vigente: true,
    editable: false,
    duplicable: true,
    enviada_por: null,
    rechazada_en: null,
    aprobada_en: null,
    creado_por: null,
    creado_en: '2026-09-29T13:00:00.000Z',
    ...resto,
  };
}
