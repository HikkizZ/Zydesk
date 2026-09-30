import { z } from 'zod';
import { fechaIso, hora, id, instante, texto } from './comunes.js';

const minutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// Se llama HorarioDiaEsquema para no chocar con el tipo `HorarioDia` del motor de horas hábiles.
export const HorarioDiaEsquema = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    activo: z.boolean(),
    entrada: hora,
    salida: hora,
    colacion_inicio: hora,
    colacion_min: z.number().int().min(0).max(240),
  })
  .refine(
    (d) => {
      if (!d.activo) return true;
      const entrada = minutos(d.entrada);
      const salida = minutos(d.salida);
      if (d.colacion_min === 0) return entrada < salida;
      const inicio = minutos(d.colacion_inicio);
      return entrada < inicio && inicio + d.colacion_min <= salida;
    },
    { message: 'Horario inválido: revisa entrada, colación y salida', path: ['entrada'] },
  );

export const DepartamentoEntrada = z.object({
  nombre: texto(80),
  hora_extendida_desde: hora,
  capacidad_tickets_pct: z.number().int().min(0).max(100),
  horario: z
    .array(HorarioDiaEsquema)
    .length(7)
    .refine((h) => new Set(h.map((d) => d.dia_semana)).size === 7, {
      message: 'dia_semana no puede repetirse',
    }),
});

export const DepartamentoSalida = DepartamentoEntrada.extend({
  id,
  jornada_semanal_horas: z.number(),
  personas: z.number().int(),
  creado_en: instante,
  actualizado_en: instante,
});

export const FeriadoEntrada = z.object({
  fecha: fechaIso,
  nombre: texto(80),
  departamento_id: id.nullable().default(null),
});

export const FeriadoSalida = FeriadoEntrada.extend({ id });

export const FeriadosQuery = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  departamento_id: z.coerce.number().int().positive().optional(),
});

export type DepartamentoEntradaDatos = z.infer<typeof DepartamentoEntrada>;
export type DepartamentoSalidaDatos = z.infer<typeof DepartamentoSalida>;
export type FeriadoEntradaDatos = z.infer<typeof FeriadoEntrada>;
export type FeriadoSalidaDatos = z.infer<typeof FeriadoSalida>;
export type FeriadosQueryDatos = z.infer<typeof FeriadosQuery>;
