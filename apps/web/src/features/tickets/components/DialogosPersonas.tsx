import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { SelectorPersonas } from '@/components/dominio/SelectorPersonas';
import {
  SelectorResponsables,
  type ValorResponsables,
} from '@/components/dominio/SelectorResponsables';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  guardarResponsables,
  guardarSeguidores,
  invalidarTicket,
  type TicketDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { erroresDeApi } from './formulario';

function mensajeDe(err: unknown): string {
  const porCampo = erroresDeApi(err);
  if (porCampo) return Object.values(porCampo)[0] ?? 'Datos inválidos';
  return err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.';
}

function FormularioResponsables({
  ticket,
  onCerrar,
}: {
  ticket: TicketDatos;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState<ValorResponsables>({
    principal_id: ticket.responsables.find((r) => r.principal)?.id ?? null,
    otros_ids: ticket.responsables.filter((r) => !r.principal).map((r) => r.id),
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () => guardarResponsables(ticket.id, valor),
    onSuccess: async () => {
      toast.success('Responsables guardados');
      await invalidarTicket(queryClient, ticket.id);
      onCerrar();
    },
    onError: (err) => setError(mensajeDe(err)),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Responsables</DialogTitle>
        <DialogDescription>
          El principal responde por el ticket. Cambiarlos no recalcula las fechas.
        </DialogDescription>
      </DialogHeader>
      <SelectorResponsables valor={valor} onChange={setValor} />
      {error ? (
        <p role="alert" className="text-sm text-urgente">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="button" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </>
  );
}

function FormularioSeguidores({ ticket, onCerrar }: { ticket: TicketDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [ids, setIds] = useState(ticket.seguidores.map((s) => s.id));
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () => guardarSeguidores(ticket.id, { usuario_ids: ids }),
    onSuccess: async () => {
      toast.success('Seguidores guardados');
      await invalidarTicket(queryClient, ticket.id);
      onCerrar();
    },
    onError: (err) => setError(mensajeDe(err)),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Seguidores</DialogTitle>
        <DialogDescription>Reciben los avisos del ticket sin ser responsables.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dialogo-seguidores">Seguidores</Label>
        <SelectorPersonas
          multiple
          id="dialogo-seguidores"
          etiqueta="Seguidores"
          valor={ids}
          onChange={setIds}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-urgente">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="button" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function DialogoResponsables({
  ticket,
  abierto,
  onCerrar,
}: {
  ticket: TicketDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? <FormularioResponsables ticket={ticket} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function DialogoSeguidores({
  ticket,
  abierto,
  onCerrar,
}: {
  ticket: TicketDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? <FormularioSeguidores ticket={ticket} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
