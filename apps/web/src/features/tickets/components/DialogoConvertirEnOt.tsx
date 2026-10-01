import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TipoOt } from '@zydesk/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { SelectorPersonas } from '@/components/dominio/SelectorPersonas';
import { SelectorTipoOt } from '@/components/dominio/SelectorTipoOt';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { cliente } from '@/features/clientes/api';
import { convertirEnOt, invalidarOt, type OtCrearEntradaDatos } from '@/features/ots/api';
import type { TicketDatos } from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { erroresDeApi, nuloSiVacio } from './formulario';

function Formulario({ ticket, onCerrar }: { ticket: TicketDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const [tipo, setTipo] = useState<TipoOt>('facturable');
  const [titulo, setTitulo] = useState(ticket.asunto);
  const [responsable, setResponsable] = useState<number | null>(
    ticket.responsables.find((r) => r.principal)?.id ?? null,
  );
  const [alcance, setAlcance] = useState('');
  const [descuentaBolsa, setDescuentaBolsa] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const clienteId = ticket.cliente_id;
  const datosCliente = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => cliente(clienteId!),
    enabled: clienteId !== null,
    staleTime: 60_000,
  });
  const conBolsa = tipo === 'facturable' && datosCliente.data?.bolsa.vigente != null;
  const pendientes = ticket.tareas.filter((t) => !t.hecha).length;

  const crear = useMutation({
    mutationFn: (entrada: OtCrearEntradaDatos) => convertirEnOt(ticket.id, entrada),
    onSuccess: async (ot) => {
      toast.success(`${ot.codigo} creada`);
      await invalidarOt(queryClient, ot.id, ticket.id);
      onCerrar();
      void navegar(`/ots/${ot.id}`);
    },
    onError: (err) => {
      const porCampo = erroresDeApi(err);
      if (porCampo) {
        setErrores(porCampo);
        return;
      }
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      );
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    setErrorGeneral(null);
    if (titulo.trim() === '') {
      setErrores({ titulo: 'Escribe el título de la OT' });
      return;
    }
    crear.mutate({
      tipo,
      titulo: titulo.trim(),
      alcance: nuloSiVacio(alcance),
      responsable_tecnico_id: responsable,
      descuenta_bolsa: conBolsa && descuentaBolsa,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Convertir en OT</DialogTitle>
        <DialogDescription>
          Crea una orden de trabajo a partir de {ticket.codigo}. El ticket sigue abierto.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={enviar}
        noValidate
        className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-1"
      >
        <SelectorTipoOt valor={tipo} onChange={setTipo} />
        <Campo etiqueta="Título" error={errores['titulo']}>
          {(p) => (
            <Input
              {...p}
              maxLength={200}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Responsable técnico" error={errores['responsable_tecnico_id']}>
          {(p) => (
            <SelectorPersonas
              id={p.id}
              etiqueta="Responsable técnico"
              valor={responsable}
              onChange={setResponsable}
            />
          )}
        </Campo>
        <Campo etiqueta="Alcance (opcional)" error={errores['alcance']}>
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              value={alcance}
              onChange={(e) => setAlcance(e.target.value)}
            />
          )}
        </Campo>
        {conBolsa ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="descuenta-bolsa"
              checked={descuentaBolsa}
              onCheckedChange={(v) => setDescuentaBolsa(v === true)}
            />
            <Label htmlFor="descuenta-bolsa">Descuenta de la bolsa</Label>
          </div>
        ) : null}
        {errores['descuenta_bolsa'] ? (
          <p role="alert" className="text-sm text-urgente">
            {errores['descuenta_bolsa']}
          </p>
        ) : null}
        {pendientes > 0 ? (
          <p className="text-sm text-tinta-2">
            {pendientes === 1
              ? 'La tarea pendiente pasará a la OT.'
              : `Las ${pendientes} tareas pendientes pasarán a la OT.`}
          </p>
        ) : null}
        {errorGeneral ? (
          <p role="alert" className="text-sm text-urgente">
            {errorGeneral}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear OT'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoConvertirEnOt({
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
      <DialogContent className="sm:max-w-xl">
        {abierto ? <Formulario ticket={ticket} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
