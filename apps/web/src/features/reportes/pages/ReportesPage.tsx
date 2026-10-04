import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { descargar, ErrorApi } from '@/lib/api';
import {
  clavesReportes,
  reporte,
  STALE_REPORTES,
  urlExportarReportes,
  type ReporteSalidaDatos,
} from '../api';
import { FiltrosReportes } from '../components/FiltrosReportes';
import { GraficoCarga } from '../components/GraficoCarga';
import { GraficoHorasSemana } from '../components/GraficoHorasSemana';
import { GraficoPrioridad } from '../components/GraficoPrioridad';
import { IndicadoresReportes } from '../components/IndicadoresReportes';
import { TablaPorCliente } from '../components/TablaPorCliente';
import { consultaDeParams, textoPeriodo } from '../filtros';
import { useBajo1024 } from '../useBajo1024';

const SEMANAS_MOVIL = 8;

// «Período del 1 al 4 de octubre de 2026 · Soporte TI» con los filtros ya resueltos por la API.
function resumenFiltros(f: ReporteSalidaDatos['filtros']): string {
  return [
    `Período ${textoPeriodo(f.desde, f.hasta)}`,
    f.departamento?.nombre,
    f.cliente?.nombre,
    f.usuario?.nombre,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Pantalla 14: indicadores, gráficos, tabla por cliente y exportación (.xlsx). Estado en la URL.
export function ReportesPage() {
  const [params, setParams] = useSearchParams();
  const bajo1024 = useBajo1024();
  const consulta = consultaDeParams(params);

  const cambiar = useCallback(
    (cambios: Record<string, string | null>) =>
      setParams(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor) nuevos.set(clave, valor);
            else nuevos.delete(clave);
          }
          return nuevos;
        },
        { replace: true },
      ),
    [setParams],
  );

  const resultado = useQuery({
    queryKey: clavesReportes.reporte(consulta),
    queryFn: () => reporte(consulta),
    staleTime: STALE_REPORTES,
    placeholderData: keepPreviousData,
  });
  const datos = resultado.data;

  const exportar = async () => {
    toast.info('Exportando…');
    try {
      await descargar(urlExportarReportes(consulta));
    } catch (err) {
      toast.error(err instanceof ErrorApi ? err.message : 'No se pudo exportar. Intenta de nuevo.');
    }
  };

  // Un 400 (período inválido, filtro inexistente) se explica bajo los filtros, no como error de página.
  const errorDeFiltro =
    resultado.error instanceof ErrorApi && resultado.error.status === 400 ? resultado.error : null;

  return (
    <div className="space-y-4">
      <TituloPagina titulo="Reportes" />
      <FiltrosReportes
        params={params}
        resueltos={datos?.filtros}
        onCambiar={cambiar}
        onExportar={() => void exportar()}
      />
      {errorDeFiltro ? (
        <p role="alert" className="text-sm font-medium text-urgente">
          {errorDeFiltro.message}
        </p>
      ) : datos ? (
        <p className="text-sm text-tinta-3">{resumenFiltros(datos.filtros)}</p>
      ) : null}

      {errorDeFiltro ? null : resultado.isError ? (
        <EstadoError error={resultado.error} reintentar={() => void resultado.refetch()} />
      ) : datos ? (
        <>
          <IndicadoresReportes indicadores={datos.indicadores} />
          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoHorasSemana
              semanas={datos.horas_por_semana}
              {...(bajo1024 ? { maxSemanas: SEMANAS_MOVIL } : {})}
            />
            <GraficoCarga carga={datos.carga} />
          </div>
          <GraficoPrioridad resolucion={datos.resolucion_por_prioridad} />
          <TablaPorCliente filas={datos.por_cliente} />
        </>
      ) : (
        <Cargando />
      )}
    </div>
  );
}
