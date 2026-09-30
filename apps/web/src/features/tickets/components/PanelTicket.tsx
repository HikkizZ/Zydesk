import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_PRIORIDAD, PRIORIDADES, type Prioridad } from '@zydesk/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Avatares } from '@/components/dominio/Avatares';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { FechaLimite } from '@/components/dominio/FechaLimite';
import { diaMesHora } from '@/components/dominio/formato-fecha';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useYo } from '@/features/auth/SesionProvider';
import { Seleccion } from '@/features/configuracion/Seleccion';
import {
  editarTicket,
  guardarSeguidores,
  invalidarTicket,
  type TicketDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { DialogoResponsables, DialogoSeguidores } from './DialogosPersonas';

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

function Fila({
  etiqueta,
  acciones,
  children,
}: {
  etiqueta: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs font-semibold tracking-wide text-tinta-2 uppercase">{etiqueta}</dt>
        {acciones}
      </div>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const mensajeDe = (err: unknown) =>
  err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.';

function PrimeraRespuesta({ ticket }: { ticket: TicketDatos }) {
  if (ticket.primera_respuesta_en) {
    return <>registrada {diaMesHora(ticket.primera_respuesta_en)}</>;
  }
  if (ticket.respuesta_limite) return <>vence {diaMesHora(ticket.respuesta_limite)}</>;
  return <span className="text-tinta-3">—</span>;
}

// Panel derecho del detalle: estado, prioridad, responsables, seguidores y datos del ticket.
export function PanelTicket({
  ticket,
  puedeEditar,
  onCambiarEstado,
}: {
  ticket: TicketDatos;
  puedeEditar: boolean;
  onCambiarEstado: () => void;
}) {
  const yo = useYo();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<'responsables' | 'seguidores' | null>(null);
  const cerrado = ticket.cerrado_en !== null;
  const sigo = ticket.seguidores.some((s) => s.id === yo.id);

  const cambiarPrioridad = useMutation({
    mutationFn: (prioridad: Prioridad) => editarTicket(ticket.id, { prioridad }),
    onSuccess: () => invalidarTicket(queryClient, ticket.id),
    onError: (err) => toast.error(mensajeDe(err)),
  });
  const seguir = useMutation({
    mutationFn: () => {
      const ids = ticket.seguidores.map((s) => s.id);
      return guardarSeguidores(ticket.id, {
        usuario_ids: sigo ? ids.filter((x) => x !== yo.id) : [...ids, yo.id],
      });
    },
    onSuccess: () => invalidarTicket(queryClient, ticket.id),
    onError: (err) => toast.error(mensajeDe(err)),
  });

  return (
    <aside aria-label="Datos del ticket" className="flex flex-col gap-4">
      <section className="rounded-lg border border-borde bg-superficie px-4">
        <dl className="divide-y">
          <Fila
            etiqueta="Estado"
            acciones={
              puedeEditar ? (
                <Button type="button" variant="outline" size="sm" onClick={onCambiarEstado}>
                  Cambiar
                </Button>
              ) : null
            }
          >
            <PillEstado estado={ticket.estado} espera_de={ticket.espera_de} />
            {ticket.espera_detalle ? (
              <span className="mt-1 block text-tinta-2">{ticket.espera_detalle}</span>
            ) : null}
          </Fila>
          <Fila etiqueta="Prioridad">
            {puedeEditar && !cerrado ? (
              <Seleccion
                etiqueta="Prioridad"
                valor={ticket.prioridad}
                disabled={cambiarPrioridad.isPending}
                alCambiar={(v) => cambiarPrioridad.mutate(v as Prioridad)}
                opciones={PRIORIDADES.map((p) => ({ valor: p, etiqueta: ETIQUETA_PRIORIDAD[p] }))}
              />
            ) : (
              <PillPrioridad prioridad={ticket.prioridad} />
            )}
          </Fila>
          <Fila
            etiqueta="Responsables"
            acciones={
              puedeEditar && !cerrado ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditando('responsables')}
                >
                  Editar
                </Button>
              ) : null
            }
          >
            {ticket.responsables.length === 0 ? (
              <span className="text-alta">Sin asignar</span>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ticket.responsables.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Avatares personas={[r]} />
                    <span>{r.nombre}</span>
                    {r.principal ? <span className="text-xs text-tinta-2">principal</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Fila>
          <Fila
            etiqueta="Seguidores"
            acciones={
              puedeEditar ? (
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={seguir.isPending}
                    onClick={() => seguir.mutate()}
                  >
                    {sigo ? 'Dejar de seguir' : 'Seguir'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditando('seguidores')}
                  >
                    Editar
                  </Button>
                </span>
              ) : null
            }
          >
            {ticket.seguidores.length === 0 ? (
              <span className="text-tinta-3">Sin seguidores</span>
            ) : (
              <span className="flex items-center gap-2">
                <Avatares personas={ticket.seguidores} max={5} />
                <span className="text-tinta-2">
                  {ticket.seguidores.map((s) => s.nombre).join(', ')}
                </span>
              </span>
            )}
          </Fila>
          <Fila etiqueta="Solicitante">
            {ticket.solicitante_nombre || ticket.solicitante_correo ? (
              <span className="break-words">
                {[ticket.solicitante_nombre, ticket.solicitante_correo].filter(Boolean).join(' · ')}
              </span>
            ) : (
              <span className="text-tinta-3">—</span>
            )}
          </Fila>
          <Fila etiqueta="Cliente">
            {ticket.cliente ? (
              <Link
                to={`/clientes/${ticket.cliente.id}`}
                className="text-acento underline underline-offset-2"
              >
                {ticket.cliente.nombre}
              </Link>
            ) : (
              <span className="text-tinta-3">Sin cliente</span>
            )}
          </Fila>
          <Fila etiqueta="Categoría">
            {ticket.categoria?.nombre ?? <span className="text-tinta-3">Sin categoría</span>}
          </Fila>
          <Fila etiqueta="Fecha límite">
            <FechaLimite
              fecha_limite={ticket.fecha_limite}
              vencido={ticket.vencido}
              vence_hoy={ticket.vence_hoy}
            />
          </Fila>
          <Fila etiqueta="Inicio planificado">
            {ticket.inicio_planificado ? (
              formatearFechaHora(ticket.inicio_planificado)
            ) : (
              <span className="text-tinta-3">—</span>
            )}
          </Fila>
          <Fila etiqueta="Horas estimadas">
            {ticket.horas_estimadas === null ? (
              <span className="text-tinta-3">—</span>
            ) : (
              <span className="font-mono">{formatoHoras.format(ticket.horas_estimadas)} h</span>
            )}
          </Fila>
          <Fila etiqueta="Primera respuesta">
            <PrimeraRespuesta ticket={ticket} />
          </Fila>
          <Fila etiqueta="Creado por">
            {ticket.creado_por?.nombre ?? '—'} · {formatearFechaHora(ticket.creado_en)}
          </Fila>
        </dl>
      </section>

      <section className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="mb-3 font-titulo text-base font-semibold">OT vinculadas</h2>
        <EstadoVacio
          titulo="Disponible en la Fase 3"
          descripcion="Aquí aparecerán las órdenes de trabajo de este ticket."
          accion={
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button type="button" variant="outline" disabled>
                    Crear OT
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Fase 3</TooltipContent>
            </Tooltip>
          }
        />
      </section>

      <DialogoResponsables
        ticket={ticket}
        abierto={editando === 'responsables'}
        onCerrar={() => setEditando(null)}
      />
      <DialogoSeguidores
        ticket={ticket}
        abierto={editando === 'seguidores'}
        onCerrar={() => setEditando(null)}
      />
    </aside>
  );
}
