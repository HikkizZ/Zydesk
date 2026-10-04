import { z } from 'zod';
import { PRIORIDADES } from '../enums/prioridad.js';
import { ClienteBreve, UsuarioBreve, fechaIso, idQuery, referencia } from './comunes.js';

export const RANGO_MAX_DIAS = 366;

// Diferencia en días calendario sobre AAAA-MM-DD, sin zona.
function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

export const ReportesQuery = z
  .object({
    desde: fechaIso.optional(), // sin él: primer día del mes actual (Santiago)
    hasta: fechaIso.optional(), // sin él: hoy (Santiago); puede ser futuro
    departamento_id: idQuery.optional(),
    cliente_id: idQuery.optional(),
    usuario_id: idQuery.optional(),
  })
  .refine((v) => !v.desde || !v.hasta || v.desde <= v.hasta, {
    path: ['hasta'],
    message: 'El fin del período es anterior al inicio',
  })
  .refine((v) => !v.desde || !v.hasta || diasEntre(v.desde, v.hasta) < RANGO_MAX_DIAS, {
    path: ['hasta'],
    message: 'El período no puede superar un año',
  });

export const FiltrosReporte = z.object({
  desde: fechaIso,
  hasta: fechaIso,
  departamento: referencia.nullable(),
  cliente: ClienteBreve.nullable(),
  usuario: UsuarioBreve.nullable(),
});

export const IndicadoresReporte = z.object({
  cerrados: z.object({
    total: z.number().int(),
    resueltos: z.number().int(),
    descartados: z.number().int(),
    duplicados: z.number().int(),
  }),
  resolucion: z.object({
    promedio_dias: z.number().nullable(),
    n: z.number().int(),
    sin_calendario: z.number().int(),
  }),
  dentro_de_plazo: z.object({
    pct: z.number().int().nullable(),
    dentro: z.number().int(),
    n: z.number().int(),
  }),
  horas: z.object({
    total: z.number(),
    facturables: z.number(),
    internas: z.number(),
    fuera_de_horario: z.number(),
    pct_facturables: z.number().int().nullable(),
  }),
});

export const SemanaHoras = z.object({
  semana: fechaIso, // lunes
  facturables: z.number(),
  internas: z.number(),
});

export const CargaPersona = z.object({
  usuario: UsuarioBreve,
  departamento: referencia.nullable(),
  tickets_abiertos: z.number().int(),
  horas_estimadas: z.number(),
  capacidad_semanal: z.number().nullable(), // jornadaSemanalHoras × capacidad_tickets_pct / 100; null sin departamento
  pct: z.number().int().nullable(), // round(horas_estimadas / capacidad_semanal × 100), sin tope
});

export const ResolucionPrioridad = z.object({
  prioridad: z.enum(PRIORIDADES),
  n: z.number().int(),
  promedio_dias: z.number().nullable(),
  objetivo_dias: z.number().nullable(),
  sobre_plazo: z.boolean(),
});

export const FilaCliente = z.object({
  cliente: ClienteBreve.nullable(), // null en "Interno" y "Sin cliente"
  nombre: z.string(),
  interno: z.boolean(),
  abiertos: z.number().int(),
  cerrados: z.number().int(),
  horas: z.number(),
  facturado: z.number().nullable(), // CLP; null en "Interno" y "Sin cliente"
  por_facturar: z.number().nullable(),
});

export const ReporteSalida = z.object({
  filtros: FiltrosReporte,
  indicadores: IndicadoresReporte,
  horas_por_semana: z.array(SemanaHoras),
  carga: z.array(CargaPersona),
  resolucion_por_prioridad: z.array(ResolucionPrioridad).length(4),
  por_cliente: z.array(FilaCliente),
});
