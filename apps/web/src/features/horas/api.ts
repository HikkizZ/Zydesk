import type { QueryClient } from '@tanstack/react-query';
import type {
  PlanillaSemanal,
  RegistroHorasEditar,
  RegistroHorasEntrada,
  RegistroHorasSalida,
} from '@zydesk/shared';
import type { z } from 'zod';
import { invalidarOt } from '@/features/ots/api';
import { conQuery, enviar, obtener } from '@/lib/api';

export type PlanillaDatos = z.infer<typeof PlanillaSemanal>;
export type FilaDatos = PlanillaDatos['filas'][number];
export type CeldaDatos = FilaDatos['celdas'][number];
export type RegistroCeldaDatos = CeldaDatos['registros'][number];
export type DestinoDatos = FilaDatos['destino'];
export type DiaDatos = PlanillaDatos['dias'][number];
export type RegistroHorasDatos = z.infer<typeof RegistroHorasSalida>;
export type RegistroHorasEntradaDatos = z.input<typeof RegistroHorasEntrada>;
export type RegistroHorasEditarDatos = z.input<typeof RegistroHorasEditar>;

export interface ConsultaPlanilla {
  usuario_id?: number;
  semana?: string;
}

// Claves de TanStack Query: `['horas', usuario_id ?? 'yo', semana ?? 'actual']`.
export const clavesHoras = {
  todas: ['horas'] as const,
  planilla: (consulta: ConsultaPlanilla) =>
    ['horas', consulta.usuario_id ?? 'yo', consulta.semana ?? 'actual'] as const,
};

export const planilla = (consulta: ConsultaPlanilla) =>
  obtener<PlanillaDatos>(conQuery('/api/horas', { ...consulta }));

export const crearRegistro = (entrada: RegistroHorasEntradaDatos) =>
  enviar<RegistroHorasDatos>('POST', '/api/horas', entrada);

export const editarRegistro = (id: number, cambios: RegistroHorasEditarDatos) =>
  enviar<RegistroHorasDatos>('PATCH', `/api/horas/${id}`, cambios);

export const eliminarRegistro = (id: number) => enviar<void>('DELETE', `/api/horas/${id}`);

// Tras cada mutación: las planillas y, si la fila es de OT, la OT (horas registradas y costo interno).
export async function invalidarHoras(queryClient: QueryClient, otId?: number) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: clavesHoras.todas }),
    otId === undefined ? undefined : invalidarOt(queryClient, otId),
  ]);
}
