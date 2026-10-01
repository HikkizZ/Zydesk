import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cancelarOt, invalidarOt, type OtDatos } from '@/features/ots/api';
import { esDesactualizada, mensajeDeOt } from '@/features/ots/errores';

function Contenido({ ot, onCerrar }: { ot: OtDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelar = useMutation({
    mutationFn: () => cancelarOt(ot.id, { motivo: motivo.trim() }),
    onSuccess: async () => {
      toast.success('OT cancelada');
      await invalidarOt(queryClient, ot.id, ot.ticket.id);
      onCerrar();
    },
    onError: (err) => {
      if (esDesactualizada(err)) {
        toast.error(mensajeDeOt(err));
        void invalidarOt(queryClient, ot.id, ot.ticket.id);
        onCerrar();
      } else {
        setError(mensajeDeOt(err));
      }
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancelar {ot.codigo}</DialogTitle>
        <DialogDescription>
          Una OT cancelada no se factura. Las tareas pendientes se quedan en la OT.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (motivo.trim() !== '') cancelar.mutate();
        }}
      >
        <Campo etiqueta="Motivo de la cancelación">
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
        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={motivo.trim() === '' || cancelar.isPending}
          >
            {cancelar.isPending ? 'Cancelando…' : 'Cancelar OT'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoCancelarOt({
  ot,
  abierto,
  onCerrar,
}: {
  ot: OtDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? <Contenido ot={ot} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
