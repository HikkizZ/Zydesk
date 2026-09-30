import { z } from 'zod';
import { CONCEPTOS_TARIFA } from '../enums/tarifa.js';
import { correo, fechaIso, id, instante, texto } from './comunes.js';

// "76.123.456-K" o "76123456-k" → "76123456-K"
export function normalizarRut(valor: string): string {
  const limpio = valor.replace(/[.\s-]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

// Dígito verificador por módulo 11 sobre un RUT ya normalizado.
export function rutValido(rut: string): boolean {
  const m = /^(\d{1,8})-([\dK])$/.exec(rut);
  if (!m) return false;
  const cuerpo = m[1]!;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === m[2];
}

export const rut = z.string().trim().max(20).transform(normalizarRut).refine(rutValido, {
  message: 'RUT inválido',
});

export const ClienteEntrada = z.object({
  nombre: texto(120),
  rut: rut.nullable(),
  direccion: texto(300).nullable(),
  es_interno: z.boolean(),
  condicion_pago: texto(80).nullable(),
  exige_oc: z.boolean(),
  notas: texto(2000).nullable(),
});

export const ClienteResumen = z.object({
  id,
  nombre: z.string(),
  rut: z.string().nullable(),
  es_interno: z.boolean(),
  activo: z.boolean(),
  tiene_bolsa: z.boolean(),
  tickets_abiertos: z.number(),
});

export const ContactoEntrada = z.object({
  nombre: texto(120),
  area: texto(80).nullable(),
  correo: correo.nullable(),
  telefono: texto(40).nullable(),
  aprueba_cotizaciones: z.boolean(),
});

export const ContactoSalida = ContactoEntrada.extend({
  id,
  cliente_id: id,
  activo: z.boolean(),
});

const ContratoBolsaBase = z.object({
  horas_mes: z.number().min(0.5).max(999).multipleOf(0.5),
  vigente_desde: fechaIso,
  vigente_hasta: fechaIso.nullable(),
  fecha_renovacion: fechaIso.nullable(),
  notas: texto(500).nullable(),
});

type BolsaFechas = {
  vigente_desde?: string | undefined;
  vigente_hasta?: string | null | undefined;
};
const hastaDespuesDeDesde = (v: BolsaFechas): boolean =>
  !v.vigente_desde || !v.vigente_hasta || v.vigente_hasta >= v.vigente_desde;
const REFINAMIENTO_BOLSA = {
  message: 'vigente_hasta debe ser igual o posterior a vigente_desde',
  path: ['vigente_hasta'],
};

export const ContratoBolsaEntrada = ContratoBolsaBase.refine(
  hastaDespuesDeDesde,
  REFINAMIENTO_BOLSA,
);
// Zod 4 no permite `.partial()` sobre un objeto con refinamientos: se parte del objeto base.
export const ContratoBolsaEditarEntrada = ContratoBolsaBase.partial().refine(
  hastaDespuesDeDesde,
  REFINAMIENTO_BOLSA,
);

export const ContratoBolsaSalida = ContratoBolsaBase.extend({
  id,
  cliente_id: id,
  vigente: z.boolean(),
  horas_usadas_mes: z.null(), // null en Fase 1 (sin OT); Fase 5 lo calcula (ADR 0015)
});

export const TarifaClienteSalida = z.object({
  concepto: z.enum(CONCEPTOS_TARIFA),
  valor: z.number(),
});

// Reemplaza el conjunto completo; conceptos sin repetir.
export const TarifaClienteEntrada = z
  .array(
    z.object({
      concepto: z.enum(CONCEPTOS_TARIFA),
      valor: z.number().min(0).max(99_999_999),
    }),
  )
  .refine((t) => new Set(t.map((x) => x.concepto)).size === t.length, {
    message: 'Los conceptos no pueden repetirse',
  });

export const ClienteSalida = ClienteEntrada.extend({
  id,
  activo: z.boolean(),
  contactos: z.array(ContactoSalida),
  bolsa: z.object({
    vigente: ContratoBolsaSalida.nullable(),
    historial: z.array(ContratoBolsaSalida),
  }),
  tarifas: z.array(TarifaClienteSalida),
  creado_en: instante,
  actualizado_en: instante,
});

export const ClientesQuery = z.object({
  q: texto(80).optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export type ClienteEntradaDatos = z.infer<typeof ClienteEntrada>;
export type ClienteResumenDatos = z.infer<typeof ClienteResumen>;
export type ClienteSalidaDatos = z.infer<typeof ClienteSalida>;
export type ContactoEntradaDatos = z.infer<typeof ContactoEntrada>;
export type ContactoSalidaDatos = z.infer<typeof ContactoSalida>;
export type ContratoBolsaEntradaDatos = z.infer<typeof ContratoBolsaEntrada>;
export type ContratoBolsaSalidaDatos = z.infer<typeof ContratoBolsaSalida>;
export type TarifaClienteEntradaDatos = z.infer<typeof TarifaClienteEntrada>;
export type TarifaClienteSalidaDatos = z.infer<typeof TarifaClienteSalida>;
export type ClientesQueryDatos = z.infer<typeof ClientesQuery>;
