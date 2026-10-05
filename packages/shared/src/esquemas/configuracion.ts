import { z } from 'zod';
import { MONEDAS, TIPOS_LINEA, UNIDADES } from '../enums/cotizacion.js';
import { booleanoTexto, id, instante, texto } from './comunes.js';

export const MarcaEntrada = z.object({ nombre_app: texto(40) });

export const MarcaSalida = z.object({ nombre_app: z.string(), logo_url: z.string().nullable() });

export const LogoEntrada = z.object({
  tipo_mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  base64: z.string().max(280_000), // ≈ 200 KB
});

export const NumeracionTipo = z.object({
  prefijo: z.string().trim().max(10),
  inicial: z.number().int().min(0).max(99_999_999),
  digitos: z.number().int().min(3).max(8),
  modo: z.enum(['correlativo', 'aleatorio']),
});

export const NumeracionEntrada = z.object({
  ticket: NumeracionTipo,
  ot: NumeracionTipo.omit({ modo: true }),
});

const EstadoNumeracion = {
  ultimo_usado: z.number().nullable(),
  usados: z.number(),
  capacidad: z.number(),
  advertencia: z.boolean(),
};

export const NumeracionSalida = z.object({
  ticket: NumeracionTipo.extend(EstadoNumeracion),
  ot: NumeracionTipo.extend({ modo: z.literal('correlativo'), ...EstadoNumeracion }),
});

export const EventoSalida = z.object({
  id,
  creado_en: instante,
  autor: z.object({ id, nombre: z.string() }).nullable(),
  entidad_id: z.string(),
  valor_anterior: z.string().nullable(),
  valor_nuevo: z.string().nullable(),
});

export type MarcaEntradaDatos = z.infer<typeof MarcaEntrada>;
export type MarcaSalidaDatos = z.infer<typeof MarcaSalida>;
export type LogoEntradaDatos = z.infer<typeof LogoEntrada>;
export type NumeracionEntradaDatos = z.infer<typeof NumeracionEntrada>;
export type NumeracionSalidaDatos = z.infer<typeof NumeracionSalida>;
export type EventoSalidaDatos = z.infer<typeof EventoSalida>;

// Tarifas globales, IVA y validez por defecto (ADR 0007, B10); null = "[TARIFA]" sin definir.
const montoClp = z.number().int().min(0).max(999_999_999);
const validezDefecto = z.union([z.literal(15), z.literal(30)]);

// Tarifa con moneda por concepto (Fase 8b). Las reglas se aplican sobre el objeto ya extendido
// (ADR 0023.19: cuidado con `.partial()`/`.extend()` sobre objetos con `.refine` en Zod 4).
export const TarifaMontoBase = z.object({
  moneda: z.enum(MONEDAS),
  valor: z.number().min(0).max(999_999_999).multipleOf(0.01),
});
export const conReglasDeTarifa = <
  T extends z.ZodObject<{ moneda: z.ZodEnum<{ CLP: 'CLP'; UF: 'UF' }>; valor: z.ZodNumber }>,
>(
  s: T,
) =>
  s
    .refine((t) => t.moneda !== 'CLP' || Number.isInteger(t.valor), {
      path: ['valor'],
      message: 'En pesos, sin decimales',
    })
    .refine((t) => t.moneda !== 'UF' || t.valor <= 99_999, {
      path: ['valor'],
      message: 'Máximo 99.999 UF',
    });
export const TarifaMonto = conReglasDeTarifa(TarifaMontoBase);
export type TarifaMontoDatos = z.infer<typeof TarifaMonto>;

export const TarifasEntrada = z.object({
  hora_normal: TarifaMonto.nullable(),
  hora_extendida: TarifaMonto.nullable(),
  hora_urgencia: TarifaMonto.nullable(),
  traslado_km: TarifaMonto.nullable(),
  costo_interno: montoClp.nullable(),
  iva_pct: z.number().min(0).max(100).multipleOf(0.01),
  validez_dias_defecto: validezDefecto,
  condiciones_defecto: texto(5000).nullable(),
});
export const TarifasSalida = TarifasEntrada;

export const PlantillaLineaEntrada = z.object({
  tipo: z.enum(TIPOS_LINEA),
  descripcion: texto(300),
  cantidad: z.number().positive().max(999_999).multipleOf(0.01).default(1),
  unidad: z.enum(UNIDADES),
  precio_unitario: z.number().min(0).max(999_999_999).multipleOf(0.01).nullable().default(null), // null = de la tarifa
  descuento_pct: z.number().min(0).max(100).multipleOf(0.01).default(0),
});

export const PlantillaCotizacionEntrada = z.object({
  nombre: texto(80),
  descripcion: texto(300).nullable(),
  condiciones: texto(5000).nullable(),
  lineas: z.array(PlantillaLineaEntrada).max(50),
});

export const PlantillaCotizacionSalida = PlantillaCotizacionEntrada.extend({
  id,
  activo: z.boolean(),
  lineas: z.array(PlantillaLineaEntrada.extend({ id, orden: z.number().int() })),
  creado_en: instante,
  actualizado_en: instante,
});

export const PlantillaActivoEntrada = z.object({ activo: z.boolean() });
// Sin `activo` → solo activas (como /api/usuarios); 'false' → inactivas
export const PlantillasQuery = z.object({ activo: booleanoTexto.optional() });

export type TarifasEntradaDatos = z.infer<typeof TarifasEntrada>;
export type TarifasSalidaDatos = z.infer<typeof TarifasSalida>;
export type PlantillaLineaEntradaDatos = z.infer<typeof PlantillaLineaEntrada>;
export type PlantillaCotizacionEntradaDatos = z.infer<typeof PlantillaCotizacionEntrada>;
export type PlantillaCotizacionSalidaDatos = z.infer<typeof PlantillaCotizacionSalida>;
export type PlantillaActivoEntradaDatos = z.infer<typeof PlantillaActivoEntrada>;
export type PlantillasQueryDatos = z.infer<typeof PlantillasQuery>;
