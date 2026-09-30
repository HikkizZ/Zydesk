import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ContratoBolsaEntrada } from '@zydesk/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { ErrorApi } from '@/lib/api';
import { crearBolsa } from '../api';
import { errorZodACampos, nuloSiVacio } from '../formato';

interface Valores {
  horas_mes: string;
  vigente_desde: string;
  vigente_hasta: string;
  fecha_renovacion: string;
  notas: string;
}

const VACIOS: Valores = {
  horas_mes: '',
  vigente_desde: '',
  vigente_hasta: '',
  fecha_renovacion: '',
  notas: '',
};

function FormularioBolsa({
  alCambiar,
  clienteId,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
}) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Valores>({ defaultValues: VACIOS });

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof ContratoBolsaEntrada.parse>) =>
      crearBolsa(clienteId, entrada),
    onSuccess: async () => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] }),
      ]);
      alCambiar(false);
    },
    onError: (err) => {
      if (err instanceof ErrorApi) {
        if (err.status === 409 && err.detalles?.['motivo'] === 'solapa_vigente') {
          setErrorGeneral(
            'Ya hay un contrato cuyo rango de fechas se solapa con este. Ajusta las fechas.',
          );
          return;
        }
        if (err.status === 400 && err.detalles?.['vigente_hasta']) {
          setError('vigente_hasta', {
            message: 'Debe ser igual o posterior a la fecha de inicio',
          });
          return;
        }
        setErrorGeneral(err.message);
        return;
      }
      setErrorGeneral('No se pudo conectar. Intenta de nuevo.');
    },
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const resultado = ContratoBolsaEntrada.safeParse({
      horas_mes: v.horas_mes.trim() === '' ? undefined : Number(v.horas_mes.replace(',', '.')),
      vigente_desde: v.vigente_desde,
      vigente_hasta: nuloSiVacio(v.vigente_hasta),
      fecha_renovacion: nuloSiVacio(v.fecha_renovacion),
      notas: nuloSiVacio(v.notas),
    });
    if (!resultado.success) {
      errorZodACampos(resultado.error, setError);
      return;
    }
    guardar.mutate(resultado.data);
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agregar bolsa de horas</DialogTitle>
        <DialogDescription>Contrato de soporte con horas mensuales.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo
          etiqueta="Horas al mes"
          error={errors.horas_mes?.message}
          ayuda="Múltiplos de 0,5 (máx. 999)."
        >
          {(p) => <Input inputMode="decimal" {...p} {...register('horas_mes')} />}
        </Campo>
        <Campo etiqueta="Vigente desde" error={errors.vigente_desde?.message}>
          {(p) => <Input type="date" {...p} {...register('vigente_desde')} />}
        </Campo>
        <Campo
          etiqueta="Vigente hasta"
          error={errors.vigente_hasta?.message}
          ayuda="Déjalo vacío si el contrato no tiene fecha de término."
        >
          {(p) => <Input type="date" {...p} {...register('vigente_hasta')} />}
        </Campo>
        <Campo etiqueta="Fecha de renovación" error={errors.fecha_renovacion?.message}>
          {(p) => <Input type="date" {...p} {...register('fecha_renovacion')} />}
        </Campo>
        <Campo etiqueta="Notas" error={errors.notas?.message}>
          {(p) => <Input {...p} {...register('notas')} />}
        </Campo>
        {errorGeneral ? (
          <p role="alert" className="text-sm text-urgente">
            {errorGeneral}
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

export function DialogoBolsa({
  abierto,
  alCambiar,
  clienteId,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
  abierto: boolean;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <FormularioBolsa alCambiar={alCambiar} clienteId={clienteId} />
      </DialogContent>
    </Dialog>
  );
}
