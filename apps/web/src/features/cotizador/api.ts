import type { QueryClient } from '@tanstack/react-query';
import type {
  CotizacionEntradaDatos,
  CotizacionResumenDatos,
  CotizacionSalidaDatos,
  CotizacionesQueryDatos,
  PlantillaCotizacionSalidaDatos,
  TarifasSalidaDatos,
} from '@zydesk/shared';
import { invalidarOt } from '@/features/ots/api';
import { conQuery, enviar, obtener } from '@/lib/api';

export type {
  CotizacionEntradaDatos,
  CotizacionResumenDatos,
  CotizacionSalidaDatos,
  PlantillaCotizacionSalidaDatos,
  TarifasSalidaDatos,
};

export interface PaginaCotizaciones {
  datos: CotizacionResumenDatos[];
  total: number;
  pagina: number;
  por_pagina: number;
}

// Filtros de `GET /api/cotizaciones` (`estado` es una lista separada por comas).
export type ConsultaCotizaciones = Partial<
  Pick<CotizacionesQueryDatos, 'pagina' | 'por_pagina' | 'q' | 'cliente_id' | 'ot_id' | 'orden'>
> & { estado?: string; solo_vigentes?: boolean };

// Claves de TanStack Query (spec fase 4 §11.1).
export const clavesCotizacion = {
  lista: (consulta: ConsultaCotizaciones) => ['cotizaciones', consulta] as const,
  una: (id: number) => ['cotizacion', id] as const,
  tarifas: ['tarifas'] as const,
  plantillas: ['plantillas'] as const,
};

export const STALE_COTIZACIONES = 30_000;

// Lectura ---------------------------------------------------------------------------------
export const cotizaciones = (consulta: ConsultaCotizaciones) =>
  obtener<PaginaCotizaciones>(conQuery('/api/cotizaciones', { ...consulta }));

export const cotizacion = (id: number) => obtener<CotizacionSalidaDatos>(`/api/cotizaciones/${id}`);

export const tarifas = () => obtener<TarifasSalidaDatos>('/api/config/tarifas');

// Solo las plantillas activas (la API las devuelve por defecto).
export const plantillas = () =>
  obtener<PlantillaCotizacionSalidaDatos[]>('/api/config/plantillas-cotizacion');

// Escritura -------------------------------------------------------------------------------
export const crearCotizacion = (otId: number) =>
  enviar<CotizacionSalidaDatos>('POST', `/api/ots/${otId}/cotizaciones`);

export const guardarCotizacion = (id: number, entrada: CotizacionEntradaDatos) =>
  enviar<CotizacionSalidaDatos>('PUT', `/api/cotizaciones/${id}`, entrada);

export const importarHoras = (id: number, origen: 'estimadas' | 'reales' | 'registradas') =>
  enviar<CotizacionSalidaDatos>('POST', `/api/cotizaciones/${id}/importar-horas`, { origen });

export const aplicarPlantilla = (id: number, plantillaId: number) =>
  enviar<CotizacionSalidaDatos>('POST', `/api/cotizaciones/${id}/aplicar-plantilla`, {
    plantilla_id: plantillaId,
  });

export const enviarCotizacion = (id: number) =>
  enviar<CotizacionSalidaDatos>('POST', `/api/cotizaciones/${id}/enviar`);

export const duplicarCotizacion = (id: number) =>
  enviar<CotizacionSalidaDatos>('POST', `/api/cotizaciones/${id}/duplicar`);

export const eliminarCotizacion = (id: number) => enviar<void>('DELETE', `/api/cotizaciones/${id}`);

export const urlDescarga = (id: number, formato: 'xlsx' | 'pdf') =>
  `/api/cotizaciones/${id}/descargar.${formato}`;

// Tras cualquier mutación de una cotización: ella, la lista y la OT (detalle, listas y ticket).
export async function invalidarCotizacion(
  queryClient: QueryClient,
  id: number,
  otId: number,
  ticketId?: number,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cotizacion', id] }),
    queryClient.invalidateQueries({ queryKey: ['cotizaciones'] }),
    invalidarOt(queryClient, otId, ticketId),
  ]);
}
