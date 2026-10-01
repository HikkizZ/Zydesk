import { useMutation, useQueryClient } from '@tanstack/react-query';
import { iniciales } from '@zydesk/shared';
import { History } from 'lucide-react';
import type { Ref } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/dominio/Avatar';
import { Button } from '@/components/ui/button';
import { usePermiso } from '@/features/auth/SesionProvider';
import { copiarAlTicket, invalidarOt } from '@/features/ots/api';
import { avisarErrorOt } from '@/features/ots/errores';
import { describirEventoOt } from '@/features/ots/eventos';
import { TarjetaMensaje } from '@/features/tickets/components/ActividadLista';
import type { ActividadDatos, MensajeDatos } from '@/features/tickets/api';
import type { EventoDatos } from '@/features/tickets/eventos';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';

function LineaEventoOt({ evento }: { evento: EventoDatos }) {
  const d = describirEventoOt(evento);
  return (
    <div className="flex items-start gap-2 px-1 text-sm text-tinta-2">
      {evento.autor ? (
        <Avatar
          iniciales={iniciales(evento.autor.nombre)}
          color="#E8E5DD"
          className="mt-0.5 size-5 text-[8px]"
        />
      ) : (
        <History aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="break-words">
          {evento.autor ? (
            <>
              <strong className="font-semibold text-tinta">{evento.autor.nombre}</strong>{' '}
            </>
          ) : null}
          {d.texto}
          {d.cambio ? (
            <>
              {' '}
              <span className="rounded bg-superficie-suave px-1.5 py-0.5 font-mono text-xs text-tinta">
                {d.cambio}
              </span>
            </>
          ) : null}
        </p>
        {d.detalle ? <p className="text-xs break-words">{d.detalle}</p> : null}
      </div>
      <time dateTime={evento.creado_en} className="shrink-0 text-xs">
        {formatearFechaHora(evento.creado_en)}
      </time>
    </div>
  );
}

// Pie de cada mensaje de la OT: "Copiado al ticket" o el botón para copiarlo.
function PieMensaje({
  mensaje,
  otId,
  ticketId,
}: {
  mensaje: MensajeDatos;
  otId: number;
  ticketId: number;
}) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const refrescar = () => invalidarOt(queryClient, otId, ticketId);
  const copiar = useMutation({
    mutationFn: () => copiarAlTicket(mensaje.id),
    onSuccess: async () => {
      toast.success('Copiado al ticket');
      await refrescar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'MENSAJE_YA_COPIADO') void refrescar();
      avisarErrorOt(err, refrescar);
    },
  });

  if (mensaje.copiado_al_ticket) {
    return <p className="mt-1 px-1 text-xs text-tinta-2">Copiado al ticket</p>;
  }
  if (!puedeEditar) return null;
  return (
    <div className="mt-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={copiar.isPending}
        onClick={() => copiar.mutate()}
      >
        Copiar al ticket
      </Button>
    </div>
  );
}

// Lista cronológica de la OT (lo más nuevo abajo): mensajes como tarjetas, eventos como líneas.
export function ActividadOt({
  items,
  otId,
  ticketId,
  ultimoRef,
}: {
  items: ActividadDatos['items'];
  otId: number;
  ticketId: number;
  ultimoRef?: Ref<HTMLDivElement>;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-tinta-2">Sin actividad todavía</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={`${item.tipo}-${item.tipo === 'mensaje' ? item.mensaje.id : item.evento.id}`}>
          {item.tipo === 'mensaje' ? (
            <>
              <TarjetaMensaje mensaje={item.mensaje} />
              <PieMensaje mensaje={item.mensaje} otId={otId} ticketId={ticketId} />
            </>
          ) : (
            <LineaEventoOt evento={item.evento} />
          )}
          {i === items.length - 1 ? <div ref={ultimoRef} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
