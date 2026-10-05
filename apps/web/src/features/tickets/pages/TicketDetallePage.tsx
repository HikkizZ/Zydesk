import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatearFecha } from '@zydesk/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { AtajosSecciones } from '@/components/dominio/AtajosSecciones';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { DialogoCambiarEstado } from '@/components/dominio/DialogoCambiarEstado';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { Pill } from '@/components/dominio/Pill';
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
      className={`scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5 ${className}`}
    >
      <h2 className="mb-3 font-titulo text-base font-semibold">{titulo}</h2>
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
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Codigo className="text-lg">{t.codigo}</Codigo>
          <TituloPagina titulo={t.asunto} codigo={t.codigo} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PillEstado estado={t.estado} espera_de={t.espera_de} />
          <PillPrioridad prioridad={t.prioridad} />
          {t.ot_vinculada ? <PillTipo tipo={t.tipo} codigo={t.ot_vinculada.codigo} /> : null}
          <FechaLimite
            fecha_limite={t.fecha_limite}
            vencido={t.vencido}
            vence_hoy={t.vence_hoy}
            prefijo="Vence"
          />
          {t.correo ? <Pill tono="neutro">Correo adjunto</Pill> : null}
          {t.archivado_en ? <Pill tono="neutro">Archivado</Pill> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar ? (
            <>
              <Button type="button" onClick={() => setEstadoAbierto(true)}>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        {/* Bajo lg, las secciones son hijas directas del grid (display: contents) para poder reordenarlas con `order`; el DOM no cambia. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {cerrado ? (
            <div
              role="status"
              className="order-1 flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie-suave px-4 py-3 text-sm lg:order-none"
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
              <p className="text-sm break-words whitespace-pre-wrap">{t.descripcion}</p>
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
            className="order-4 scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5 lg:order-none"
          >
            <ListaTareas ticketId={t.id} tareas={t.tareas} cerrado={cerrado} />
          </section>

          <section
            id="actividad"
            aria-label="Actividad"
            className="order-5 scroll-mt-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5 lg:order-none"
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
                  <ActividadLista items={visible.data.items} ultimoRef={ultimo} />
                )}
              </TabsContent>
            </Tabs>
          </section>

          {puedeEditar ? (
            <RedactorPlegable ticketId={t.id} className="order-6 lg:order-none" />
          ) : null}
        </div>

        <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
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
