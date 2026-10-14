import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatearFecha } from '@zydesk/shared';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { CabeceraPagina } from '@/app/CabeceraPagina';
import { AtajosSecciones } from '@/components/dominio/AtajosSecciones';
import { Cargando } from '@/components/dominio/Cargando';
import { Chip } from '@/components/dominio/Chip';
import { Codigo } from '@/components/dominio/Codigo';
import { DialogoCambiarEstado } from '@/components/dominio/DialogoCambiarEstado';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesHora } from '@/components/dominio/formato-fecha';
import { FranjaPlazo } from '@/components/dominio/FranjaPlazo';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { PillTipo } from '@/components/dominio/PillTipo';
import { ListaTareas } from '@/components/dominio/ListaTareas';
import { RedactorPlegable } from '@/components/dominio/RedactorPlegable';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermiso } from '@/features/auth/SesionProvider';
import {
  actividad,
  claves,
  STALE_TICKETS,
  ticket as obtenerTicket,
  type TipoActividad,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { useEsMovil } from '@/lib/useMediaQuery';
import { ActividadLista } from '../components/ActividadLista';
import { BotonConvertir } from '../components/BotonConvertir';
import { CorreoOriginal } from '../components/CorreoOriginal';
import { DialogoConvertirEnOt } from '../components/DialogoConvertirEnOt';
import { DialogoEditarTicket } from '../components/DialogoEditarTicket';
import {
  etiquetaDeMensaje,
  GaleriaArchivos,
  type ArchivoConOrigen,
} from '../components/GaleriaArchivos';
import { PanelTicket } from '../components/PanelTicket';

const TIPOS: TipoActividad[] = ['todo', 'seguimiento', 'nota_interna', 'historial'];
const ETIQUETA_TIPO: Record<TipoActividad, string> = {
  todo: 'Actividad',
  seguimiento: 'Seguimiento',
  nota_interna: 'Notas internas',
  historial: 'Historial',
};
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

function Tarjeta({
  titulo,
  id,
  className,
  children,
}: {
  titulo: string;
  id: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={`scroll-mt-4 rounded-md border border-linea bg-panel p-4 ${className}`}
    >
      <h2 className="mb-3 text-sm font-semibold text-tinta">{titulo}</h2>
      {children}
    </section>
  );
}

function NoEncontrado() {
  return (
    <EstadoVacio
      titulo="Ticket no encontrado"
      descripcion="Puede que se haya movido o que el enlace no sea correcto."
      accion={
        <Button asChild variant="outline">
          <Link to="/tickets">Ir al tablero</Link>
        </Button>
      }
    />
  );
}

export function TicketDetallePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const valido = Number.isInteger(id) && id > 0;
  const puedeEditar = usePermiso('tickets.editar');
  const esMovil = useEsMovil();
  const [params, setParams] = useSearchParams();
  const pedido = params.get('actividad');
  const tipo: TipoActividad = TIPOS.find((t) => t === pedido) ?? 'todo';
  const [estadoAbierto, setEstadoAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const ultimo = useRef<HTMLDivElement>(null);

  const consulta = useQuery({
    queryKey: claves.ticket(id),
    queryFn: () => obtenerTicket(id),
    enabled: valido,
    staleTime: STALE_TICKETS,
    retry: (intentos, err) => !(err instanceof ErrorApi && err.status === 404) && intentos < 2,
  });
  const cargado = consulta.data !== undefined;
  const todo = useQuery({
    queryKey: claves.actividad(id, 'todo'),
    queryFn: () => actividad(id, 'todo'),
    enabled: cargado,
    staleTime: STALE_TICKETS,
  });
  const filtrada = useQuery({
    queryKey: claves.actividad(id, tipo),
    queryFn: () => actividad(id, tipo),
    enabled: cargado && tipo !== 'todo',
    staleTime: STALE_TICKETS,
    placeholderData: keepPreviousData,
  });
  const visible = tipo === 'todo' ? todo : filtrada;
  const cantidad = visible.data?.items.length ?? 0;

  // Lo más nuevo queda abajo, junto al redactor.
  useEffect(() => {
    if (cantidad > 0) ultimo.current?.scrollIntoView?.({ block: 'nearest' });
  }, [cantidad, tipo]);

  if (!valido) return <NoEncontrado />;
  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return consulta.error instanceof ErrorApi && consulta.error.status === 404 ? (
      <NoEncontrado />
    ) : (
      <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
    );
  }

  const t = consulta.data;
  const cerrado = t.cerrado_en !== null;
  const conteos = (visible.data ?? todo.data)?.conteos;
  const archivos: ArchivoConOrigen[] = [
    ...t.archivos.map((archivo) => ({ archivo })),
    ...(todo.data?.items ?? []).flatMap((item) =>
      item.tipo === 'mensaje'
        ? item.mensaje.archivos.map((archivo) => ({
            archivo,
            etiqueta: etiquetaDeMensaje(item.mensaje.tipo, item.mensaje.creado_en),
          }))
        : [],
    ),
  ];

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
      <header className="-mx-4 -mt-4 flex flex-col gap-3 border-b border-linea bg-panel px-4 py-5 lg:-mx-7 lg:-mt-7 lg:px-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/tickets"
            aria-label="Volver a tickets"
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-tinta-2 hover:bg-lienzo hover:text-tinta lg:size-8"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
          <Codigo className="text-sm text-tinta">{t.codigo}</Codigo>
          <span aria-hidden="true" className="h-4 border-l border-linea-fuerte" />
          <PillEstado estado={t.estado} espera_de={t.espera_de} />
          <PillPrioridad prioridad={t.prioridad} />
          {t.ot_vinculada ? <PillTipo tipo={t.tipo} codigo={t.ot_vinculada.codigo} /> : null}
          {t.correo ? <Chip tono="neutro">Correo adjunto</Chip> : null}
          {t.archivado_en ? <Chip tono="neutro">Archivado</Chip> : null}
        </div>
        <div className="*:mb-0">
          <CabeceraPagina titulo={t.asunto} codigo={t.codigo} />
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <FranjaPlazo ticket={t} variante="ancha" className="min-w-0 lg:flex-1" />
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            {puedeEditar ? (
              <>
                <Button
                  type="button"
                  className="flex-1 lg:flex-none"
                  onClick={() => setEstadoAbierto(true)}
                >
                  Cambiar estado
                </Button>
                {cerrado ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex">
                        <Button type="button" variant="outline" disabled>
                          Editar
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Reabre el ticket para editarlo</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setEditando(true)}>
                    Editar
                  </Button>
                )}
              </>
            ) : (
              <span className="text-sm text-tinta-2">Solo lectura</span>
            )}
            {puedeEditar ? (
              <BotonConvertir ticket={t} onConvertir={() => setConvirtiendo(true)} />
            ) : null}
          </div>
        </div>
      </header>

      <AtajosSecciones
        etiqueta="En este ticket"
        secciones={[
          { id: 'datos', etiqueta: 'Datos' },
          { id: 'descripcion', etiqueta: 'Descripción' },
          { id: 'tareas', etiqueta: 'Tareas' },
          { id: 'actividad', etiqueta: 'Actividad' },
          ...(t.correo ? [{ id: 'correo', etiqueta: 'Correo' }] : []),
          { id: 'archivos', etiqueta: 'Archivos' },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        {/* Bajo lg, las secciones son hijas directas del grid (display: contents) para poder reordenarlas con `order`; el DOM no cambia. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {cerrado ? (
            <div
              role="status"
              className="order-1 flex flex-wrap items-center gap-3 rounded-md border border-linea bg-panel-hundido px-4 py-3 text-sm lg:order-none"
            >
              <span>
                {t.archivado_en
                  ? `Archivado el ${formatearFecha(t.archivado_en)}`
                  : `Cerrado el ${formatearFecha(t.cerrado_en!)} · se archivará el ${formatearFecha(
                      new Date(new Date(t.cerrado_en!).getTime() + SIETE_DIAS),
                    )}`}
                {t.duplicado_de ? ` · Duplicado de ${t.duplicado_de.codigo}` : ''}
                {t.estado === 'descartado' && t.motivo_cierre ? ` · ${t.motivo_cierre}` : ''}
              </span>
              {puedeEditar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEstadoAbierto(true)}
                >
                  Reabrir
                </Button>
              ) : null}
            </div>
          ) : null}

          <Tarjeta titulo="Descripción" id="descripcion" className="order-3 lg:order-none">
            {t.descripcion ? (
              <p className="text-sm break-words whitespace-pre-wrap text-tinta">{t.descripcion}</p>
            ) : (
              <p className="text-sm text-tinta-2">Sin descripción</p>
            )}
          </Tarjeta>

          {t.correo ? (
            <Tarjeta titulo="Correo original" id="correo" className="order-7 lg:order-none">
              <CorreoOriginal correo={t.correo} />
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="Archivos del ticket" id="archivos" className="order-8 lg:order-none">
            <GaleriaArchivos archivos={archivos} />
          </Tarjeta>

          <section
            id="tareas"
            aria-label="Tareas"
            className="order-4 scroll-mt-4 rounded-md border border-linea bg-panel p-4 lg:order-none"
          >
            <ListaTareas ticketId={t.id} tareas={t.tareas} cerrado={cerrado} />
          </section>

          <section
            id="actividad"
            aria-label="Actividad"
            className="order-5 scroll-mt-4 rounded-md border border-linea bg-panel p-4 lg:order-none"
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold text-tinta">
                Actividad
                {todo.data ? (
                  <span className="ml-2 rounded-sm border border-linea bg-panel px-1.5 text-xs font-medium text-tinta-2 tabular-nums">
                    {todo.data.conteos.todo}
                  </span>
                ) : null}
              </h2>
              <p className="text-xs text-tinta-3">Creado {diaMesHora(t.creado_en)}</p>
            </div>
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
                  <ActividadLista items={visible.data.items} ultimoRef={ultimo} />
                )}
              </TabsContent>
            </Tabs>
          </section>

          {puedeEditar ? (
            <RedactorPlegable ticketId={t.id} className="order-6 lg:order-none" />
          ) : null}
        </div>

        <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1 lg:border-l lg:border-linea lg:pl-6">
          <PanelTicket
            plegable={esMovil}
            ticket={t}
            puedeEditar={puedeEditar}
            onCambiarEstado={() => setEstadoAbierto(true)}
            onConvertir={() => setConvirtiendo(true)}
          />
        </div>
      </div>

      <DialogoCambiarEstado
        ticket={t}
        abierto={estadoAbierto}
        onCerrar={() => setEstadoAbierto(false)}
      />
      <DialogoEditarTicket ticket={t} abierto={editando} onCerrar={() => setEditando(false)} />
      <DialogoConvertirEnOt
        ticket={t}
        abierto={convirtiendo}
        onCerrar={() => setConvirtiendo(false)}
      />
    </>
  );
}
