import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { FILTROS_AVISO, type FiltroAviso } from '@zydesk/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  avisos,
  clavesAvisos,
  guardarPreferencias,
  invalidarAvisos,
  marcarLeido,
  marcarTodosLeidos,
  preferencias,
  type AvisoDatos,
  type AvisosDatos,
  type ConsultaAvisos,
  type NoLeidosDatos,
  type PreferenciaFilaDatos,
  type PreferenciasDatos,
} from '../api';
import { ListaAvisos } from '../components/ListaAvisos';
import { TablaPreferencias } from '../components/TablaPreferencias';
import { TarjetaTelegram } from '../components/TarjetaTelegram';

const ETIQUETA_FILTRO: Record<FiltroAviso, string> = {
  todos: 'Todos',
  menciones: 'Menciones',
  asignaciones: 'Asignaciones',
  vencimientos: 'Vencimientos',
};

type PaginasAvisos = InfiniteData<AvisosDatos, number>;

const esPaginas = (datos: unknown): datos is PaginasAvisos =>
  typeof datos === 'object' && datos !== null && 'pages' in datos;

function useConsulta(): [ConsultaAvisos, (cambios: Partial<ConsultaAvisos>) => void] {
  const [params, setParams] = useSearchParams();
  const crudo = params.get('filtro');
  const filtro = FILTROS_AVISO.find((f) => f === crudo) ?? 'todos';
  const consulta: ConsultaAvisos = { filtro, solo_no_leidos: params.get('no_leidos') === 'true' };
  const cambiar = (cambios: Partial<ConsultaAvisos>) =>
    setParams((previos) => {
      const nuevos = new URLSearchParams(previos);
      const f = cambios.filtro ?? filtro;
      const s = cambios.solo_no_leidos ?? consulta.solo_no_leidos;
      if (f === 'todos') nuevos.delete('filtro');
      else nuevos.set('filtro', f);
      if (s) nuevos.set('no_leidos', 'true');
      else nuevos.delete('no_leidos');
      return nuevos;
    });
  return [consulta, cambiar];
}

function Lista({ consulta }: { consulta: ConsultaAvisos }) {
  const queryClient = useQueryClient();
  const lista = useInfiniteQuery({
    queryKey: clavesAvisos.lista(consulta),
    queryFn: ({ pageParam }) => avisos(consulta, pageParam),
    initialPageParam: 1,
    getNextPageParam: (ultima) =>
      ultima.pagina * ultima.por_pagina < ultima.total ? ultima.pagina + 1 : undefined,
  });
  const leer = useMutation({
    mutationFn: marcarLeido,
    // Optimista: la fila y el badge cambian al instante; si falla, se recarga lo real.
    onMutate: (id) => {
      queryClient.setQueriesData({ queryKey: clavesAvisos.todos }, (datos: unknown) => {
        if (!esPaginas(datos)) return datos;
        return {
          ...datos,
          pages: datos.pages.map((p) => ({
            ...p,
            no_leidos: Math.max(0, p.no_leidos - 1),
            datos: p.datos.map((a) => (a.id === id ? { ...a, leido: true } : a)),
          })),
        };
      });
      queryClient.setQueryData<NoLeidosDatos>(clavesAvisos.noLeidos, (d) =>
        d ? { no_leidos: Math.max(0, d.no_leidos - 1) } : d,
      );
    },
    onSettled: () => invalidarAvisos(queryClient),
  });
  const todos = useMutation({
    mutationFn: marcarTodosLeidos,
    onSuccess: () => invalidarAvisos(queryClient),
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  if (lista.isPending) return <Cargando />;
  if (lista.isError) {
    return <EstadoError error={lista.error} reintentar={() => void lista.refetch()} />;
  }
  const items = lista.data.pages.flatMap((p) => p.datos);
  const noLeidos = lista.data.pages[0]?.no_leidos ?? 0;

  const alPulsar = (a: AvisoDatos) => {
    if (!a.leido) leer.mutate(a.id);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tinta-2">{noLeidos} sin leer</p>
        <Button
          variant="outline"
          size="sm"
          disabled={noLeidos === 0 || todos.isPending}
          onClick={() => todos.mutate()}
        >
          Marcar todo como leído
        </Button>
      </div>
      <Filtros consulta={consulta} />
      {items.length === 0 ? (
        <EstadoVacio titulo={consulta.solo_no_leidos ? 'Todo leído' : 'Sin avisos'} />
      ) : (
        <ListaAvisos avisos={items} alPulsar={alPulsar} />
      )}
      {lista.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            disabled={lista.isFetchingNextPage}
            onClick={() => void lista.fetchNextPage()}
          >
            Cargar más
          </Button>
        </div>
      ) : null}
    </>
  );
}

// Chips y "Solo sin leer": el estado vive en la URL (ADR 0011).
function Filtros({ consulta }: { consulta: ConsultaAvisos }) {
  const [, cambiar] = useConsulta();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Filtro de avisos" className="flex flex-wrap gap-2">
        {FILTROS_AVISO.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={consulta.filtro === f}
            onClick={() => cambiar({ filtro: f })}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm',
              consulta.filtro === f
                ? 'border-acento bg-acento text-white'
                : 'border-borde-campo bg-superficie hover:bg-superficie-suave',
            )}
          >
            {ETIQUETA_FILTRO[f]}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Switch
          id="solo-no-leidos"
          checked={consulta.solo_no_leidos === true}
          onCheckedChange={(v) => cambiar({ solo_no_leidos: v })}
        />
        <Label htmlFor="solo-no-leidos">Solo sin leer</Label>
      </div>
    </div>
  );
}

function Preferencias() {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: clavesAvisos.preferencias, queryFn: preferencias });
  const guardar = useMutation({
    mutationFn: (fila: PreferenciaFilaDatos) => guardarPreferencias([fila]),
    onMutate: async (fila) => {
      await queryClient.cancelQueries({ queryKey: clavesAvisos.preferencias });
      const previas = queryClient.getQueryData<PreferenciasDatos>(clavesAvisos.preferencias);
      queryClient.setQueryData<PreferenciasDatos>(clavesAvisos.preferencias, (d) =>
        d ? { ...d, filas: d.filas.map((f) => (f.evento === fila.evento ? fila : f)) } : d,
      );
      return { previas };
    },
    onError: (err, _fila, contexto) => {
      queryClient.setQueryData(clavesAvisos.preferencias, contexto?.previas);
      toast.error(mensajeDeError(err));
    },
  });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  }
  return (
    <TablaPreferencias preferencias={consulta.data} alCambiar={(fila) => guardar.mutate(fila)} />
  );
}

export function AvisosPage() {
  const [consulta] = useConsulta();
  const [vista, setVista] = useState<'lista' | 'preferencias'>('lista');
  // Bajo 1024 px las dos vistas son pestañas; desde 1024 px se ven a la vez (lista 2/3, preferencias 1/3).
  return (
    <div className="flex flex-col gap-4">
      <TituloPagina titulo="Avisos" />
      <Tabs
        value={vista}
        onValueChange={(v) => setVista(v === 'preferencias' ? 'preferencias' : 'lista')}
        className="lg:hidden"
      >
        <TabsList>
          <TabsTrigger value="lista">Avisos</TabsTrigger>
          <TabsTrigger value="preferencias">Preferencias</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={cn('lg:col-span-2', vista !== 'lista' && 'hidden lg:block')}>
          <Lista consulta={consulta} />
        </div>
        <div className={cn('flex flex-col gap-4', vista !== 'preferencias' && 'hidden lg:flex')}>
          <section
            aria-labelledby="titulo-preferencias"
            className="rounded-lg border border-borde bg-superficie p-4"
          >
            <h2 id="titulo-preferencias" className="mb-3 text-lg font-semibold">
              Preferencias
            </h2>
            <Preferencias />
          </section>
          <TarjetaTelegram />
        </div>
      </div>
    </div>
  );
}
