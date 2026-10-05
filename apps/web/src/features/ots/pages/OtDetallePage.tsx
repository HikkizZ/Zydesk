import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Avatares } from '@/components/dominio/Avatares';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { ListaTareas } from '@/components/dominio/ListaTareas';
import { PillEtapaOt } from '@/components/dominio/PillEtapaOt';
import { PillFacturacion } from '@/components/dominio/PillFacturacion';
import { PillTipoOt } from '@/components/dominio/PillTipoOt';
import { Redactor } from '@/components/dominio/Redactor';
import { Etapas } from '@/components/dominio/Etapas';
import { AtajosSecciones } from '@/components/dominio/AtajosSecciones';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermiso } from '@/features/auth/SesionProvider';
import { actividadOt, clavesOt, ot as obtenerOt, STALE_OTS } from '@/features/ots/api';
import {
  claves,
  STALE_TICKETS,
  ticket as obtenerTicket,
  type TipoActividad,
} from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import { useEsMovil } from '@/lib/useMediaQuery';
import { ErrorApi } from '@/lib/api';
import { AccionesOt } from '../components/AccionesOt';
import { ActividadOt } from '../components/ActividadOt';
import { DatosOt } from '../components/DatosOt';
import { archivosDeOt, GaleriaOt } from '../components/GaleriaOt';
import { PanelOt } from '../components/PanelOt';

const TIPOS: TipoActividad[] = ['todo', 'seguimiento', 'nota_interna', 'historial'];
const ETIQUETA_TIPO: Record<TipoActividad, string> = {
  todo: 'Actividad',
  seguimiento: 'Seguimiento',
  nota_interna: 'Notas internas',
  historial: 'Historial',
};

// Bajo `lg` el orden es solo visual (`order-N`): el DOM y los lectores de pantalla siguen el orden de escritorio.
const COLUMNA = 'min-w-0 lg:order-none lg:col-start-1';

function Tarjeta({
  id,
  titulo,
  className,
  children,
}: {
  id: string;
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={cn(
        'scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5',
        className,
      )}
    >
      <h2 className="mb-3 font-titulo text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function NoEncontrada() {
  return (
    <EstadoVacio
      titulo="OT no encontrada"
      descripcion="Puede que se haya movido o que el enlace no sea correcto."
      accion={
        <Button asChild variant="outline">
          <Link to="/ots">Ir a órdenes de trabajo</Link>
        </Button>
      }
    />
  );
}

export function OtDetallePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const valido = Number.isInteger(id) && id > 0;
  const puedeEditar = usePermiso('tickets.editar');
  const [params, setParams] = useSearchParams();
  const pedido = params.get('actividad');
  const tipo: TipoActividad = TIPOS.find((t) => t === pedido) ?? 'todo';
  const ultimo = useRef<HTMLDivElement>(null);
  const esMovil = useEsMovil();

  const consulta = useQuery({
    queryKey: clavesOt.ot(id),
    queryFn: () => obtenerOt(id),
    enabled: valido,
    staleTime: STALE_OTS,
    retry: (intentos, err) => !(err instanceof ErrorApi && err.status === 404) && intentos < 2,
  });
  const cargada = consulta.data !== undefined;
  const ticketId = consulta.data?.ticket.id;
  // El ticket de origen aporta su correo y archivos a la galería (spec §5).
  const ticket = useQuery({
    queryKey: claves.ticket(ticketId ?? 0),
    queryFn: () => obtenerTicket(ticketId as number),
    enabled: ticketId !== undefined,
    staleTime: STALE_TICKETS,
  });
  const todo = useQuery({
    queryKey: clavesOt.actividad(id, 'todo'),
    queryFn: () => actividadOt(id, 'todo'),
    enabled: cargada,
    staleTime: STALE_OTS,
  });
  const filtrada = useQuery({
    queryKey: clavesOt.actividad(id, tipo),
    queryFn: () => actividadOt(id, tipo),
    enabled: cargada && tipo !== 'todo',
    staleTime: STALE_OTS,
    placeholderData: keepPreviousData,
  });
  const visible = tipo === 'todo' ? todo : filtrada;
  const cantidad = visible.data?.items.length ?? 0;

  // Al llegar un mensaje o evento nuevo lo más nuevo queda a la vista; al abrir la OT no se salta al final.
  const anterior = useRef<{ tipo: TipoActividad; cantidad: number } | null>(null);
  useEffect(() => {
    const previo = anterior.current;
    if (previo && previo.tipo === tipo && cantidad > previo.cantidad) {
      ultimo.current?.scrollIntoView?.({ block: 'nearest' });
    }
    anterior.current = visible.data ? { tipo, cantidad } : previo;
  }, [cantidad, tipo, visible.data]);

  if (!valido) return <NoEncontrada />;
  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return consulta.error instanceof ErrorApi && consulta.error.status === 404 ? (
      <NoEncontrada />
    ) : (
      <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
    );
  }

  const ot = consulta.data;
  const final = ot.etapa === 'cerrada' || ot.etapa === 'cancelada';
  const conteos = (visible.data ?? todo.data)?.conteos;
  const archivos = archivosDeOt(ot, ticket.data, todo.data?.items ?? []);
  const eventos = (todo.data?.items ?? []).flatMap((i) => (i.tipo === 'evento' ? [i.evento] : []));

  const cambiarTipo = (nuevo: string) =>
    setParams(
      (actuales) => {
        const siguiente = new URLSearchParams(actuales);
        if (nuevo === 'todo') siguiente.delete('actividad');
        else siguiente.set('actividad', nuevo);
        return siguiente;
      },
      { replace: true },
    );

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Codigo className="text-lg">{ot.codigo}</Codigo>
          <TituloPagina titulo={ot.titulo} codigo={ot.codigo} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PillTipoOt tipo={ot.tipo} />
          <PillEtapaOt etapa={ot.etapa} />
          {ot.tipo === 'facturable' ? <PillFacturacion estado={ot.estado_facturacion} /> : null}
          <span className="text-sm">
            Ticket{' '}
            <Link
              to={`/tickets/${ot.ticket.id}`}
              className="inline-flex min-h-11 items-center font-mono text-acento underline underline-offset-2 lg:min-h-0"
            >
              {ot.ticket.codigo}
            </Link>
          </span>
          {ot.responsable_tecnico ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <Avatares personas={[ot.responsable_tecnico]} />
              {ot.responsable_tecnico.nombre}
            </span>
          ) : (
            <span className="text-sm text-alta">Sin responsable técnico</span>
          )}
          {ot.termino ? (
            <span className={cn('text-sm', ot.vencida && 'font-semibold text-urgente')}>
              {ot.vencida ? 'Vencida' : final ? 'Terminó' : 'Termina'} {diaMesDeFecha(ot.termino)}
            </span>
          ) : null}
        </div>
        <AccionesOt ot={ot} />
      </header>

      <AtajosSecciones
        etiqueta="En esta OT"
        secciones={[
          { id: 'etapas', etiqueta: 'Etapas' },
          { id: 'tareas', etiqueta: 'Tareas' },
          { id: 'fotos', etiqueta: 'Fotos' },
          { id: 'actividad', etiqueta: 'Actividad' },
          { id: 'cotizacion', etiqueta: ot.tipo === 'facturable' ? 'Cotización' : 'Costo' },
          { id: 'aprobacion', etiqueta: 'Aprobación' },
          { id: 'horas', etiqueta: 'Horas' },
          { id: 'datos', etiqueta: 'Datos' },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-6">
        <section
          id="etapas"
          aria-label="Etapas"
          className={cn(
            COLUMNA,
            'order-1 scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5',
          )}
        >
          <Etapas ot={ot} />
        </section>

        <DatosOt
          ot={ot}
          puedeEditar={puedeEditar}
          plegable={esMovil}
          className={cn(COLUMNA, 'order-last')}
        />

        <section
          id="tareas"
          aria-label="Tareas"
          className={cn(
            COLUMNA,
            'order-2 scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5',
          )}
        >
          <ListaTareas
            destino={{ tipo: 'ot', id: ot.id }}
            tareas={ot.tareas}
            cerrado={final}
            conHoras
          />
        </section>

        <Tarjeta id="fotos" titulo="Fotos y archivos" className={cn(COLUMNA, 'order-3')}>
          <GaleriaOt ot={ot} archivos={archivos} />
        </Tarjeta>

        <section
          id="actividad"
          aria-label="Actividad"
          className={cn(
            COLUMNA,
            'order-4 scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5',
          )}
        >
          <Tabs value={tipo} onValueChange={cambiarTipo}>
            <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto">
              {TIPOS.map((x) => (
                <TabsTrigger key={x} value={x} className="min-h-11 flex-none px-3">
                  {ETIQUETA_TIPO[x]}
                  {conteos ? ` (${conteos[x]})` : ''}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={tipo} className="mt-2">
              {visible.isPending ? (
                <Cargando />
              ) : visible.isError ? (
                <EstadoError error={visible.error} reintentar={() => void visible.refetch()} />
              ) : (
                <ActividadOt
                  items={visible.data.items}
                  otId={ot.id}
                  ticketId={ot.ticket.id}
                  ultimoRef={ultimo}
                />
              )}
            </TabsContent>
          </Tabs>
        </section>

        {puedeEditar ? (
          <div
            className={cn(
              COLUMNA,
              'sticky bottom-14 z-[5] order-5 -mx-6 border-t bg-fondo px-6 py-3 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.25)] lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:shadow-none',
            )}
          >
            <Redactor
              destino={{ tipo: 'ot', id: ot.id }}
              copiaAlTicket
              codigoTicket={ot.ticket.codigo}
              sinHoras={ot.etapa === 'cerrada' || ot.etapa === 'cancelada'}
            />
          </div>
        ) : null}

        <PanelOt
          ot={ot}
          eventos={eventos}
          onVerHistorial={() => cambiarTipo('historial')}
          className="order-6 lg:order-none lg:col-start-2 lg:row-span-12 lg:row-start-1"
        />
      </div>
    </>
  );
}
