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
import { Input } from '@/components/ui/input';
import { facturarOt, invalidarOt, type OtDatos } from '@/features/ots/api';
import { esDesactualizada, mensajeDeOt } from '@/features/ots/errores';

function Contenido({ ot, onCerrar }: { ot: OtDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [factura, setFactura] = useState('');
  const [error, setError] = useState<string | null>(null);
  const facturar = useMutation({
    mutationFn: () => facturarOt(ot.id, { n_factura: factura.trim() }),
    onSuccess: async () => {
      toast.success('OT marcada como facturada');
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
        <DialogTitle>Marcar {ot.codigo} como facturada</DialogTitle>
        <DialogDescription>Registra el número de la factura emitida.</DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (factura.trim() !== '') facturar.mutate();
        }}
      >
        <Campo etiqueta="N° de factura">
          {(p) => (
            <Input
              {...p}
              value={factura}
              maxLength={40}
              onChange={(e) => setFactura(e.target.value)}
              className="font-mono"
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
            Cancelar
          </Button>
          <Button type="submit" disabled={factura.trim() === '' || facturar.isPending}>
            {facturar.isPending ? 'Guardando…' : 'Marcar facturada'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoFacturar({
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
