import type { QueryClient } from '@tanstack/react-query';
import type {
  AvisoSalida,
  AvisosSalida,
  CodigoVinculoSalida,
  FiltroAviso,
  LeerTodosSalida,
  NoLeidosSalida,
  PreferenciaFila,
  PreferenciasSalida,
  TelegramEstadoSalida,
} from '@zydesk/shared';
import type { z } from 'zod';
import { conQuery, enviar, obtener } from '@/lib/api';

export type AvisoDatos = z.infer<typeof AvisoSalida>;
export type AvisosDatos = z.infer<typeof AvisosSalida>;
export type NoLeidosDatos = z.infer<typeof NoLeidosSalida>;
export type LeerTodosDatos = z.infer<typeof LeerTodosSalida>;
export type PreferenciaFilaDatos = z.infer<typeof PreferenciaFila>;
export type PreferenciasDatos = z.infer<typeof PreferenciasSalida>;
export type TelegramEstadoDatos = z.infer<typeof TelegramEstadoSalida>;
export type CodigoVinculoDatos = z.infer<typeof CodigoVinculoSalida>;

export const POR_PAGINA = 30;

export interface ConsultaAvisos {
  filtro: FiltroAviso;
  solo_no_leidos?: boolean;
}

// Claves de TanStack Query (spec fase 6 §15.1).
export const clavesAvisos = {
  todos: ['avisos'] as const,
  lista: (consulta: ConsultaAvisos) => ['avisos', consulta] as const,
  noLeidos: ['avisos', 'no-leidos'] as const,
  preferencias: ['avisos', 'preferencias'] as const,
  telegram: ['telegram'] as const,
};

export const avisos = (consulta: ConsultaAvisos, pagina = 1) =>
  obtener<AvisosDatos>(
    conQuery('/api/avisos', {
      filtro: consulta.filtro === 'todos' ? undefined : consulta.filtro,
      solo_no_leidos: consulta.solo_no_leidos ? true : undefined,
      pagina,
      por_pagina: POR_PAGINA,
    }),
  );

export const noLeidos = () => obtener<NoLeidosDatos>('/api/avisos/no-leidos');

export const marcarLeido = (id: number) => enviar<AvisoDatos>('POST', `/api/avisos/${id}/leer`);

export const marcarTodosLeidos = () => enviar<LeerTodosDatos>('POST', '/api/avisos/leer-todos');

export const preferencias = () => obtener<PreferenciasDatos>('/api/yo/avisos/preferencias');

export const guardarPreferencias = (filas: PreferenciaFilaDatos[]) =>
  enviar<PreferenciasDatos>('PUT', '/api/yo/avisos/preferencias', { filas });

export const telegram = () => obtener<TelegramEstadoDatos>('/api/yo/telegram');

export const generarCodigo = () => enviar<CodigoVinculoDatos>('POST', '/api/yo/telegram/codigo');

export const desvincularTelegram = () => enviar<void>('DELETE', '/api/yo/telegram');

// Tras marcar leído: la lista, el badge y Mi día (que muestra las menciones sin leer).
export async function invalidarAvisos(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: clavesAvisos.todos }),
    queryClient.invalidateQueries({ queryKey: ['mi-dia'] }),
  ]);
}
