import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CONCEPTOS_TARIFA,
  ETIQUETA_CONCEPTO_TARIFA,
  TarifaClienteEntrada,
  type ConceptoTarifa,
} from '@zydesk/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
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
import { ErrorApi } from '@/lib/api';
import { guardarTarifas, type TarifaClienteSalidaDatos } from '../api';

type Fila = { global: boolean; valor: string };
type Filas = Record<ConceptoTarifa, Fila>;

function filasIniciales(tarifas: TarifaClienteSalidaDatos[]): Filas {
  const filas = {} as Filas;
  for (const concepto of CONCEPTOS_TARIFA) {
    const t = tarifas.find((x) => x.concepto === concepto);
    filas[concepto] = t ? { global: false, valor: String(t.valor) } : { global: true, valor: '' };
  }
  return filas;
}

function FormularioTarifas({
  alCambiar,
  clienteId,
  tarifas,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
  tarifas: TarifaClienteSalidaDatos[];
}) {
  const queryClient = useQueryClient();
  const [filas, setFilas] = useState<Filas>(() => filasIniciales(tarifas));
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof TarifaClienteEntrada.parse>) =>
      guardarTarifas(clienteId, entrada),
    onSuccess: async () => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] }),
      ]);
      alCambiar(false);
    },
    onError: (err) =>
      setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.'),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // "Usar tarifa global" = no enviar el concepto.
    const entrada = CONCEPTOS_TARIFA.filter((c) => !filas[c].global).map((concepto) => ({
      concepto,
      valor: filas[concepto].valor.trim() === '' ? NaN : Number(filas[concepto].valor),
    }));
    const resultado = TarifaClienteEntrada.safeParse(entrada);
    if (!resultado.success) {
      setError('Escribe un valor válido (número, 0 o mayor) en cada tarifa propia.');
      return;
    }
    guardar.mutate(resultado.data);
  };

  const cambiar = (concepto: ConceptoTarifa, cambios: Partial<Fila>) =>
    setFilas((f) => ({ ...f, [concepto]: { ...f[concepto], ...cambios } }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar tarifas</DialogTitle>
        <DialogDescription>Valores netos en pesos, más IVA.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        {CONCEPTOS_TARIFA.map((concepto) => (
          <div key={concepto} className="flex flex-col gap-1.5">
            <Label htmlFor={`tarifa-${concepto}`}>{ETIQUETA_CONCEPTO_TARIFA[concepto]}</Label>
            <Input
              id={`tarifa-${concepto}`}
              inputMode="numeric"
              disabled={filas[concepto].global}
              value={filas[concepto].valor}
              onChange={(e) => cambiar(concepto, { valor: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`global-${concepto}`}
                checked={filas[concepto].global}
                onCheckedChange={(v) => cambiar(concepto, { global: v === true })}
              />
              <Label htmlFor={`global-${concepto}`} className="font-normal">
                Usar tarifa global
              </Label>
            </div>
          </div>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => alCambiar(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoTarifas({
  abierto,
  alCambiar,
  clienteId,
  tarifas,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
  tarifas: TarifaClienteSalidaDatos[];
  abierto: boolean;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <FormularioTarifas alCambiar={alCambiar} clienteId={clienteId} tarifas={tarifas} />
      </DialogContent>
    </Dialog>
  );
}
