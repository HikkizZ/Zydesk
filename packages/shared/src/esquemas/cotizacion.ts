import { z } from 'zod';
import { ESTADOS_COTIZACION, MONEDAS, TIPOS_LINEA, UNIDADES } from '../enums/cotizacion.js';
import { ETAPAS_OT, TIPOS_OT } from '../enums/ot.js';
import {
  ClienteBreve,
  booleanoTexto,
  csv,
  esquemaPaginacion,
  fechaIso,
  id,
  idQuery,
  instante,
  referencia,
  texto,
} from './comunes.js';

const validez = z.union([z.literal(15), z.literal(30)]);
const moneda = z.enum(MONEDAS);
const estado = z.enum(ESTADOS_COTIZACION);

export const LineaCotizacionEntrada = z.object({
  tipo: z.enum(TIPOS_LINEA),
  descripcion: texto(300),
  cantidad: z.number().positive().max(999_999).multipleOf(0.01),
  unidad: z.enum(UNIDADES),
  precio_unitario: z.number().min(0).max(999_999_999).multipleOf(0.01),
  descuento_pct: z.number().min(0).max(100).multipleOf(0.01).default(0),
});

// Sin `iva_pct` ni totales: la API los pone (ADR 0007). Zod descarta las claves desconocidas.
export const CotizacionEntrada = z
  .object({
    contacto_id: id.nullable(),
    fecha_emision: fechaIso,
    validez_dias: validez,
    moneda,
    valor_uf: z.number().positive().max(999_999).multipleOf(0.01).nullable(),
    aplica_iva: z.boolean(),
    condiciones: texto(5000).nullable(),
    nota_interna: texto(5000).nullable(),
    lineas: z.array(LineaCotizacionEntrada).max(100),
  })
  .refine((v) => v.moneda !== 'UF' || v.valor_uf !== null, {
    path: ['valor_uf'],
    message: 'Indica el valor de la UF',
  });

export const ImportarHorasEntrada = z.object({
  origen: z.enum(['estimadas', 'reales']).default('estimadas'),
});

export const AplicarPlantillaEntrada = z.object({ plantilla_id: id });

export const LineaCotizacionSalida = LineaCotizacionEntrada.extend({
  id,
  orden: z.number().int(),
  total: z.number(),
});

export const CotizacionBreve = z.object({
  id,
  ot_id: id,
  codigo: z.string(),
  version: z.number().int(),
  estado,
  moneda,
  neto: z.number(),
  total: z.number(),
  neto_clp: z.number().nullable(), // enClp(neto)
  enviada_en: instante.nullable(),
  actualizado_en: instante,
});

export const CotizacionVersion = z.object({
  id,
  version: z.number().int(),
  estado,
  total: z.number(),
  enviada_en: instante.nullable(),
  aprobada_en: instante.nullable(),
});

export const CotizacionSalida = CotizacionBreve.extend({
  ot: z.object({
    id,
    codigo: z.string(),
    titulo: z.string(),
    tipo: z.enum(TIPOS_OT),
    etapa: z.enum(ETAPAS_OT),
    ticket: z.object({ id, codigo: z.string() }),
  }),
  cliente: ClienteBreve.nullable(),
  contacto: z
    .object({
      id,
      nombre: z.string(),
      correo: z.string().nullable(),
      area: z.string().nullable(),
    })
    .nullable(),
  fecha_emision: fechaIso,
  validez_dias: validez,
  vence_el: fechaIso,
  valor_uf: z.number().nullable(),
  aplica_iva: z.boolean(),
  iva_pct: z.number(),
  condiciones: z.string().nullable(),
  nota_interna: z.string().nullable(),
  lineas: z.array(LineaCotizacionSalida),
  totales: z.object({
    subtotal: z.number(),
    descuentos: z.number(),
    neto: z.number(),
    iva: z.number(),
    total: z.number(),
  }),
  total_clp: z.number().nullable(),
  versiones: z.array(CotizacionVersion), // todas las de la OT, por version
  vigente: z.boolean(), // es la de mayor versión
  editable: z.boolean(), // vigente && borrador && OT no final
  duplicable: z.boolean(), // vigente && enviada|rechazada && OT en borrador|cotizada
  enviada_por: referencia.nullable(),
  rechazada_en: instante.nullable(),
  aprobada_en: instante.nullable(),
  creado_por: referencia.nullable(),
  creado_en: instante,
});

export const CotizacionResumen = CotizacionBreve.extend({
  ot: z.object({ id, codigo: z.string(), titulo: z.string(), etapa: z.enum(ETAPAS_OT) }),
  cliente: ClienteBreve.nullable(),
  contacto_nombre: z.string().nullable(),
  fecha_emision: fechaIso,
  vence_el: fechaIso,
  vigente: z.boolean(),
});

export const CotizacionesQuery = esquemaPaginacion.extend({
  q: texto(80).optional(),
  estado: csv(ESTADOS_COTIZACION).optional(),
  cliente_id: idQuery.optional(),
  ot_id: idQuery.optional(),
  solo_vigentes: booleanoTexto.optional(),
  orden: z.enum(['-actualizado_en', '-fecha_emision']).default('-actualizado_en'),
});

export type LineaCotizacionEntradaDatos = z.infer<typeof LineaCotizacionEntrada>;
export type CotizacionEntradaDatos = z.infer<typeof CotizacionEntrada>;
export type ImportarHorasEntradaDatos = z.infer<typeof ImportarHorasEntrada>;
export type AplicarPlantillaEntradaDatos = z.infer<typeof AplicarPlantillaEntrada>;
export type LineaCotizacionSalidaDatos = z.infer<typeof LineaCotizacionSalida>;
export type CotizacionBreveDatos = z.infer<typeof CotizacionBreve>;
export type CotizacionVersionDatos = z.infer<typeof CotizacionVersion>;
export type CotizacionSalidaDatos = z.infer<typeof CotizacionSalida>;
export type CotizacionResumenDatos = z.infer<typeof CotizacionResumen>;
export type CotizacionesQueryDatos = z.infer<typeof CotizacionesQuery>;
