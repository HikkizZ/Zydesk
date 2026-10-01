import type {
  CotizacionResumenDatos,
  CotizacionSalidaDatos,
  PlantillaCotizacionSalidaDatos,
  TarifasSalidaDatos,
} from '@/features/cotizador/api';

// Las 5 líneas del diseño "Cotizador COT-0218": neto 475.000 y total 565.250 con IVA 19 %.
export const LINEAS_DISENO: CotizacionSalidaDatos['lineas'] = [
  {
    id: 1,
    orden: 1,
    tipo: 'mano_de_obra',
    descripcion: 'Diagnóstico y revisión de logs del ERP',
    cantidad: 3,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
    total: 114000,
  },
  {
    id: 2,
    orden: 2,
    tipo: 'mano_de_obra',
    descripcion: 'Carga de nuevo CAF y pruebas en ambiente QA',
    cantidad: 4,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
    total: 152000,
  },
  {
    id: 3,
    orden: 3,
    tipo: 'mano_de_obra',
    descripcion: 'Paso a producción y acompañamiento (horario extendido)',
    cantidad: 2,
    unidad: 'h',
    precio_unitario: 45000,
    descuento_pct: 0,
    total: 90000,
  },
  {
    id: 4,
    orden: 4,
    tipo: 'mano_de_obra',
    descripcion: 'Capacitación breve al equipo de facturación',
    cantidad: 1,
    unidad: 'h',
    precio_unitario: 38000,
    descuento_pct: 0,
    total: 38000,
  },
  {
    id: 5,
    orden: 5,
    tipo: 'servicio',
    descripcion: 'Soporte remoto post-implementación (7 días)',
    cantidad: 1,
    unidad: 'gl',
    precio_unitario: 90000,
    descuento_pct: 10,
    total: 81000,
  },
];

// COT-0218 v1 de la OT-0218: enviada, vigente, solo lectura.
export function cotizacionDePrueba(
  cambios: Partial<CotizacionSalidaDatos> = {},
): CotizacionSalidaDatos {
  return {
    id: 4,
    ot_id: 21,
    codigo: 'COT-0218',
    version: 1,
    estado: 'enviada',
    moneda: 'CLP',
    neto: 475000,
    total: 565250,
    neto_clp: 475000,
    enviada_en: '2026-09-30T13:55:00.000Z',
    actualizado_en: '2026-09-30T13:55:00.000Z',
    ot: {
      id: 21,
      codigo: 'OT-0218',
      titulo: 'Regularización de folios de facturación electrónica',
      tipo: 'facturable',
      etapa: 'cotizada',
      ticket: { id: 7, codigo: 'TK-1048' },
    },
    cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    contacto: { id: 11, nombre: 'Paula Herrera', correo: 'paula@santaclara.cl', area: 'Finanzas' },
    fecha_emision: '2026-09-30',
    validez_dias: 30,
    vence_el: '2026-10-30',
    valor_uf: null,
    aplica_iva: true,
    iva_pct: 19,
    condiciones: 'Forma de pago: 30 días desde la factura.',
    nota_interna: 'Paula pidió detallar el soporte por separado.',
    lineas: LINEAS_DISENO,
    totales: { subtotal: 484000, descuentos: 9000, neto: 475000, iva: 90250, total: 565250 },
    total_clp: 565250,
    versiones: [
      {
        id: 4,
        version: 1,
        estado: 'enviada',
        total: 565250,
        enviada_en: '2026-09-30T13:55:00.000Z',
        aprobada_en: null,
      },
    ],
    vigente: true,
    editable: false,
    duplicable: true,
    enviada_por: { id: 2, nombre: 'Camila Rojas' },
    rechazada_en: null,
    aprobada_en: null,
    creado_por: { id: 2, nombre: 'Camila Rojas' },
    creado_en: '2026-09-30T13:40:00.000Z',
    ...cambios,
  };
}

// Mismo contenido en borrador editable (p. ej. una v2 recién duplicada).
export function borradorDePrueba(
  cambios: Partial<CotizacionSalidaDatos> = {},
): CotizacionSalidaDatos {
  return cotizacionDePrueba({
    id: 5,
    version: 2,
    estado: 'borrador',
    enviada_en: null,
    enviada_por: null,
    editable: true,
    duplicable: false,
    versiones: [
      {
        id: 4,
        version: 1,
        estado: 'enviada',
        total: 565250,
        enviada_en: '2026-09-30T13:55:00.000Z',
        aprobada_en: null,
      },
      { id: 5, version: 2, estado: 'borrador', total: 565250, enviada_en: null, aprobada_en: null },
    ],
    ...cambios,
  });
}

export function resumenDeCotizacionDePrueba(
  cambios: Partial<CotizacionResumenDatos> = {},
): CotizacionResumenDatos {
  return {
    id: 4,
    ot_id: 21,
    codigo: 'COT-0218',
    version: 1,
    estado: 'enviada',
    moneda: 'CLP',
    neto: 475000,
    total: 565250,
    neto_clp: 475000,
    enviada_en: '2026-09-30T13:55:00.000Z',
    actualizado_en: '2026-09-30T13:55:00.000Z',
    ot: { id: 21, codigo: 'OT-0218', titulo: 'Regularización de folios', etapa: 'cotizada' },
    cliente: { id: 1, nombre: 'Viña Santa Clara', es_interno: false },
    contacto_nombre: 'Paula Herrera',
    fecha_emision: '2026-09-30',
    vence_el: '2026-10-30',
    vigente: true,
    ...cambios,
  };
}

export function tarifasDePrueba(cambios: Partial<TarifasSalidaDatos> = {}): TarifasSalidaDatos {
  return {
    hora_normal: 38000,
    hora_extendida: 45000,
    hora_urgencia: null,
    traslado_km: null,
    costo_interno: 18000,
    iva_pct: 19,
    validez_dias_defecto: 30,
    condiciones_defecto: null,
    ...cambios,
  };
}

export function plantillaDePrueba(
  cambios: Partial<PlantillaCotizacionSalidaDatos> = {},
): PlantillaCotizacionSalidaDatos {
  return {
    id: 2,
    nombre: 'Soporte por horas',
    descripcion: 'Bloque de horas de soporte',
    condiciones: null,
    activo: true,
    lineas: [
      {
        id: 1,
        orden: 1,
        tipo: 'mano_de_obra',
        descripcion: 'Diagnóstico',
        cantidad: 1,
        unidad: 'h',
        precio_unitario: null,
        descuento_pct: 0,
      },
    ],
    creado_en: '2026-09-29T13:02:00.000Z',
    actualizado_en: '2026-09-29T13:02:00.000Z',
    ...cambios,
  };
}
