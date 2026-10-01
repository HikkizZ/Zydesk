import { useQuery } from '@tanstack/react-query';
import { ETIQUETA_ETAPA_OT, esCerrado, esEtapaFinal } from '@zydesk/shared';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ot, ots, type OtResumenDatos } from '@/features/ots/api';
import { tickets, type TicketResumenDatos } from '@/features/tickets/api';
import { cn } from '@/lib/utils';
import type { NuevaFilaDatos } from '../utiles';

type Pestana = 'ticket' | 'ot' | 'sin_ticket';

const SIN_TAREA = '__sin_tarea__';

function useRetardo(valor: string, ms = 250) {
  const [retardado, setRetardado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retardado;
}

// Lista con búsqueda en el servidor (`q`, 10 resultados): código · título · cliente.
function Buscador<T extends { id: number }>({
  etiqueta,
  claveConsulta,
  buscar,
  elegido,
  onElegir,
  texto,
  inactivo,
}: {
  etiqueta: string;
  claveConsulta: string;
  buscar: (q: string) => Promise<T[]>;
  elegido: number | null;
  onElegir: (item: T) => void;
  texto: (item: T) => string;
  inactivo?: (item: T) => boolean;
}) {
  const [q, setQ] = useState('');
  const retardada = useRetardo(q.trim());
  const consulta = useQuery({
    queryKey: ['horas', 'buscar', claveConsulta, retardada],
    queryFn: () => buscar(retardada),
  });
  const lista = consulta.data ?? [];
  return (
    <Command shouldFilter={false} className="rounded-md border border-borde-campo">
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder={`Buscar ${etiqueta}…`}
        aria-label={`Buscar ${etiqueta}`}
      />
      <CommandList>
        <CommandEmpty>
          {consulta.isPending ? 'Buscando…' : 'Nada coincide con la búsqueda'}
        </CommandEmpty>
        <CommandGroup>
          {lista.map((item) => {
            const deshabilitado = inactivo?.(item) ?? false;
            return (
              <CommandItem
                key={item.id}
                value={String(item.id)}
                disabled={deshabilitado}
                onSelect={() => onElegir(item)}
              >
                <span className={cn('truncate', deshabilitado && 'text-tinta-3')}>
                  {texto(item)}
                </span>
                {item.id === elegido ? (
                  <Check aria-label="Seleccionado" className="ml-auto shrink-0" />
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

const conCliente = (partes: Array<string | undefined>) => partes.filter(Boolean).join(' · ');

function FormularioOt({
  elegida,
  onElegir,
  tareas,
  tareaId,
  onTarea,
}: {
  elegida: OtResumenDatos | null;
  onElegir: (o: OtResumenDatos) => void;
  tareas: Array<{ id: number; titulo: string }>;
  tareaId: string;
  onTarea: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Buscador<OtResumenDatos>
        etiqueta="OT"
        claveConsulta="ot"
        buscar={async (q) => (await ots({ ...(q ? { q } : {}), por_pagina: 10 })).datos}
        elegido={elegida?.id ?? null}
        onElegir={onElegir}
        inactivo={(o) => esEtapaFinal(o.etapa)}
        texto={(o) =>
          conCliente([
            o.codigo,
            o.titulo,
            o.cliente?.nombre,
            o.tipo === 'facturable' ? 'Facturable' : 'Interna',
            esEtapaFinal(o.etapa)
              ? `${ETIQUETA_ETAPA_OT[o.etapa]} (cerrada)`
              : ETIQUETA_ETAPA_OT[o.etapa],
          ])
        }
      />
      {elegida && tareas.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="tarea-nueva-fila">Tarea (opcional)</Label>
          <Select value={tareaId} onValueChange={onTarea}>
            <SelectTrigger id="tarea-nueva-fila" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_TAREA}>Sin tarea</SelectItem>
              {tareas.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

// "Agregar fila": la fila nace en el navegador, sin horas; se guarda al escribir en una celda.
export function DialogoAgregarFila({
  abierto,
  onAbiertoChange,
  onAgregar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onAgregar: (fila: NuevaFilaDatos) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('ticket');
  const [ticket, setTicket] = useState<TicketResumenDatos | null>(null);
  const [otElegida, setOtElegida] = useState<OtResumenDatos | null>(null);
  const [tareaId, setTareaId] = useState(SIN_TAREA);
  const [descripcion, setDescripcion] = useState('');

  const detalleOt = useQuery({
    queryKey: ['ot', otElegida?.id],
    queryFn: () => ot(otElegida!.id),
    enabled: otElegida !== null,
  });

  const descripcionLimpia = descripcion.trim();
  const listo =
    pestana === 'ticket'
      ? ticket !== null
      : pestana === 'ot'
        ? otElegida !== null
        : descripcionLimpia !== '';

  const agregar = () => {
    if (pestana === 'ticket' && ticket) {
      onAgregar({
        destino: {
          tipo: 'ticket',
          id: ticket.id,
          codigo: ticket.codigo,
          titulo: ticket.asunto,
          cliente: ticket.cliente,
          cerrado: esCerrado(ticket.estado),
        },
        tarea: null,
      });
    } else if (pestana === 'ot' && otElegida) {
      const t = detalleOt.data?.tareas.find((x) => String(x.id) === tareaId);
      onAgregar({
        destino: {
          tipo: 'ot',
          id: otElegida.id,
          codigo: otElegida.codigo,
          titulo: otElegida.titulo,
          tipo_ot: otElegida.tipo,
          etapa: otElegida.etapa,
          cliente: otElegida.cliente,
          final: esEtapaFinal(otElegida.etapa),
        },
        tarea: t ? { id: t.id, titulo: t.titulo, hecha: t.hecha } : null,
      });
    } else if (pestana === 'sin_ticket' && descripcionLimpia) {
      onAgregar({ destino: { tipo: 'sin_ticket', descripcion: descripcionLimpia }, tarea: null });
    }
    setTicket(null);
    setOtElegida(null);
    setTareaId(SIN_TAREA);
    setDescripcion('');
    onAbiertoChange(false);
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar fila</DialogTitle>
          <DialogDescription>
            Elige a qué trabajo van las horas. La fila se guarda cuando escribes horas en una celda.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList>
            <TabsTrigger value="ticket">Ticket</TabsTrigger>
            <TabsTrigger value="ot">OT</TabsTrigger>
            <TabsTrigger value="sin_ticket">Sin ticket</TabsTrigger>
          </TabsList>
          <TabsContent value="ticket" className="pt-2">
            <Buscador<TicketResumenDatos>
              etiqueta="ticket"
              claveConsulta="ticket"
              buscar={async (q) => (await tickets({ ...(q ? { q } : {}), por_pagina: 10 })).datos}
              elegido={ticket?.id ?? null}
              onElegir={setTicket}
              texto={(t) => conCliente([t.codigo, t.asunto, t.cliente?.nombre])}
            />
          </TabsContent>
          <TabsContent value="ot" className="pt-2">
            <FormularioOt
              elegida={otElegida}
              onElegir={(o) => {
                setOtElegida(o);
                setTareaId(SIN_TAREA);
              }}
              tareas={detalleOt.data?.tareas ?? []}
              tareaId={tareaId}
              onTarea={setTareaId}
            />
          </TabsContent>
          <TabsContent value="sin_ticket" className="space-y-1.5 pt-2">
            <Label htmlFor="descripcion-sin-ticket">Descripción</Label>
            <Input
              id="descripcion-sin-ticket"
              maxLength={200}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Reunión de equipo y coordinación"
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!listo} onClick={agregar}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
