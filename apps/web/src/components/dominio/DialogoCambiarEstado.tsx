import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ESPERA_DE,
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_TICKET,
  esCerrado,
  transicionesDesde,
  type CambioEstadoTicketDatos,
  type EsperaDe,
  type EstadoTicket,
} from '@zydesk/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { Codigo } from '@/components/dominio/Codigo';
import { PillEstado } from '@/components/dominio/PillEstado';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  cambiarEstado,
  claves,
  invalidarTicket,
  tickets,
  type TicketResumenDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export type TicketParaEstado = Pick<TicketResumenDatos, 'id' | 'codigo' | 'estado'>;

interface OtAbierta {
  id: number;
  codigo: string;
  etapa?: string;
}

const ETIQUETAS_ESPERA = ESPERA_DE.map((valor) => ({
  valor,
  etiqueta: ETIQUETA_ESPERA_DE[valor].replace(/^./, (c) => c.toUpperCase()),
}));

function BuscadorOriginal({
  ticket,
  elegido,
  onElegir,
}: {
  ticket: TicketParaEstado;
  elegido: TicketResumenDatos | null;
  onElegir: (t: TicketResumenDatos | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const espera = setTimeout(() => setQ(busqueda.trim()), 300);
    return () => clearTimeout(espera);
  }, [busqueda]);
  const consulta = useQuery({
    queryKey: claves.tickets({ q, por_pagina: 8 }),
    queryFn: () => tickets({ q, por_pagina: 8 }),
    enabled: q !== '',
  });
  const resultados = (consulta.data?.datos ?? []).filter(
    (t) => t.id !== ticket.id && t.estado !== 'duplicado',
  );

  if (elegido) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-superficie-suave px-3 py-2 text-sm">
        <Codigo>{elegido.codigo}</Codigo>
        <span className="min-w-0 flex-1 truncate">{elegido.asunto}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onElegir(null)}>
          Cambiar
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Campo etiqueta="Ticket original" ayuda="Busca por código, número o asunto.">
        {(p) => (
          <Input
            {...p}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej.: TK-1040 o VPN"
          />
        )}
      </Campo>
      {q !== '' && !consulta.isPending && resultados.length === 0 ? (
        <p className="text-sm text-tinta-2">Sin resultados</p>
      ) : null}
      {resultados.length > 0 ? (
        <ul
          aria-label="Resultados"
          className="flex max-h-44 flex-col overflow-y-auto rounded-md border"
        >
          {resultados.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onElegir(t)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-superficie-suave"
              >
                <Codigo>{t.codigo}</Codigo>
                <span className="min-w-0 flex-1 truncate">{t.asunto}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Contenido({
  ticket,
  estadoDestino,
  opciones,
  onCerrar,
}: {
  ticket: TicketParaEstado;
  estadoDestino: EstadoTicket | undefined;
  opciones: EstadoTicket[] | undefined;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const cerrado = esCerrado(ticket.estado);
  const permitidas = transicionesDesde(ticket.estado).filter(
    (e) => !opciones || opciones.includes(e),
  );
  const [estado, setEstado] = useState<EstadoTicket | null>(
    estadoDestino && permitidas.includes(estadoDestino)
      ? estadoDestino
      : permitidas.length === 1
        ? (permitidas[0] ?? null)
        : null,
  );
  const [esperaDe, setEsperaDe] = useState<EsperaDe | ''>('');
  const [detalle, setDetalle] = useState('');
  const [motivo, setMotivo] = useState('');
  const [original, setOriginal] = useState<TicketResumenDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otsAbiertas, setOtsAbiertas] = useState<OtAbierta[] | null>(null);

  const payload = ((): CambioEstadoTicketDatos | null => {
    switch (estado) {
      case null:
        return null;
      case 'en_espera':
        return esperaDe === ''
          ? null
          : {
              estado,
              espera_de: esperaDe,
              ...(detalle.trim() === '' ? {} : { espera_detalle: detalle.trim() }),
            };
      case 'descartado':
        return motivo.trim() === '' ? null : { estado, motivo: motivo.trim() };
      case 'duplicado':
        return original ? { estado, duplicado_de_id: original.id } : null;
      default:
        return { estado };
    }
  })();

  const cambiar = useMutation({
    mutationFn: (entrada: CambioEstadoTicketDatos) => cambiarEstado(ticket.id, entrada),
    onSuccess: async (_, entrada) => {
      toast.success(`Estado cambiado a ${ETIQUETA_ESTADO_TICKET[entrada.estado]}`);
      await invalidarTicket(queryClient, ticket.id);
      onCerrar();
    },
    onError: (err, entrada) => {
      if (err instanceof ErrorApi && err.codigo === 'OT_ABIERTA') {
        setOtsAbiertas((err.detalles?.['ots'] as OtAbierta[] | undefined) ?? []);
      } else if (err instanceof ErrorApi && err.codigo === 'TRANSICION_INVALIDA') {
        toast.error(
          `No se puede pasar de ${ETIQUETA_ESTADO_TICKET[ticket.estado]} a ${ETIQUETA_ESTADO_TICKET[entrada.estado]}`,
        );
        void invalidarTicket(queryClient, ticket.id);
      } else {
        setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.');
      }
    },
  });

  if (otsAbiertas) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Este ticket tiene OT abiertas</DialogTitle>
          <DialogDescription>Cierra o cancela la OT primero.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {otsAbiertas.map((ot) => (
            <li key={ot.id}>
              <Link to={`/ots/${ot.id}`} className="text-acento underline underline-offset-2">
                {ot.codigo}
              </Link>
              {ot.etapa ? <span className="text-sm text-tinta-2"> · {ot.etapa}</span> : null}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Entendido
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Cambiar estado · <Codigo>{ticket.codigo}</Codigo>
        </DialogTitle>
        <DialogDescription>
          Hoy está <PillEstado estado={ticket.estado} />
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (payload) cambiar.mutate(payload);
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">
            {cerrado ? 'Reabrir' : 'Nuevo estado'}
          </legend>
          {permitidas.map((e) => (
            <label
              key={e}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-1.5',
                estado === e && 'border-acento bg-media-fondo',
              )}
            >
              <input
                type="radio"
                name="estado-destino"
                value={e}
                checked={estado === e}
                onChange={() => setEstado(e)}
                className="size-4 accent-[var(--color-acento)]"
              />
              {cerrado ? (
                <span className="text-sm font-medium">Reabrir (En curso)</span>
              ) : (
                <PillEstado estado={e} />
              )}
            </label>
          ))}
        </fieldset>

        {estado === 'en_espera' ? (
          <>
            <Campo etiqueta="¿De quién se espera?">
              {(p) => (
                <Select value={esperaDe} onValueChange={(v) => setEsperaDe(v as EsperaDe)}>
                  <SelectTrigger id={p.id} aria-label="¿De quién se espera?" className="w-full">
                    <SelectValue placeholder="Elegir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ETIQUETAS_ESPERA.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Campo>
            <Campo etiqueta="Detalle (opcional)">
              {(p) => (
                <Input
                  {...p}
                  value={detalle}
                  maxLength={120}
                  onChange={(e) => setDetalle(e.target.value)}
                />
              )}
            </Campo>
          </>
        ) : null}
        {estado === 'descartado' ? (
          <Campo etiqueta="Motivo">
            {(p) => (
              <Textarea
                {...p}
                value={motivo}
                maxLength={500}
                rows={3}
                onChange={(e) => setMotivo(e.target.value)}
              />
            )}
          </Campo>
        ) : null}
        {estado === 'duplicado' ? (
          <BuscadorOriginal ticket={ticket} elegido={original} onElegir={setOriginal} />
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={payload === null || cambiar.isPending}>
            {cambiar.isPending ? 'Guardando…' : 'Cambiar estado'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// Cambia el estado con los campos que pide cada uno (ADR 0004). `opciones` limita los destinos
// (p. ej. solo los cerrados al soltar en la columna Cerrados del tablero).
export function DialogoCambiarEstado({
  ticket,
  estadoDestino,
  opciones,
  abierto,
  onCerrar,
}: {
  ticket: TicketParaEstado;
  estadoDestino?: EstadoTicket;
  opciones?: EstadoTicket[];
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? (
          <Contenido
            ticket={ticket}
            estadoDestino={estadoDestino}
            opciones={opciones}
            onCerrar={onCerrar}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
