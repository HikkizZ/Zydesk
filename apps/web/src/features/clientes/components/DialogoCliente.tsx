import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClienteEntrada } from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorApi } from '@/lib/api';
import { crearCliente, editarCliente, type ClienteSalidaDatos } from '../api';
import { errorZodACampos, nuloSiVacio } from '../formato';

interface Valores {
  nombre: string;
  rut: string;
  direccion: string;
  tipo: 'cliente' | 'interno';
  condicion_pago: string;
  exige_oc: boolean;
  notas: string;
}

function valoresIniciales(c?: ClienteSalidaDatos): Valores {
  return {
    nombre: c?.nombre ?? '',
    rut: c?.rut ?? '',
    direccion: c?.direccion ?? '',
    tipo: c?.es_interno ? 'interno' : 'cliente',
    condicion_pago: c?.condicion_pago ?? '',
    exige_oc: c?.exige_oc ?? false,
    notas: c?.notas ?? '',
  };
}

// Crear (sin `cliente`) o editar la ficha. Las áreas internas no tienen RUT, dirección,
// condición de pago, exigencia de OC ni notas.
function FormularioCliente({
  alCambiar,
  cliente,
  alGuardar,
}: {
  alCambiar: (abierto: boolean) => void;
  cliente?: ClienteSalidaDatos | undefined;
  alGuardar?: ((c: ClienteSalidaDatos) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,

    setError,
    formState: { errors },
  } = useForm<Valores>({ defaultValues: valoresIniciales(cliente) });
  const interno = useWatch({ control, name: 'tipo' }) === 'interno';

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof ClienteEntrada.parse>) =>
      cliente ? editarCliente(cliente.id, entrada) : crearCliente(entrada),
    onSuccess: async (c) => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', c.id] }),
      ]);
      alCambiar(false);
      alGuardar?.(c);
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.status === 409) {
        const campo = err.detalles?.['campo'];
        if (campo === 'nombre' || campo === 'rut') {
          setError(campo, {
            message:
              campo === 'nombre'
                ? 'Ya existe un cliente con ese nombre'
                : 'Ya existe un cliente con ese RUT',
          });
          return;
        }
      }
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      );
    },
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const esInterno = v.tipo === 'interno';
    const resultado = ClienteEntrada.safeParse({
      nombre: v.nombre,
      rut: esInterno ? null : nuloSiVacio(v.rut),
      direccion: esInterno ? null : nuloSiVacio(v.direccion),
      es_interno: esInterno,
      condicion_pago: esInterno ? null : nuloSiVacio(v.condicion_pago),
      exige_oc: esInterno ? false : v.exige_oc,
      notas: esInterno ? null : nuloSiVacio(v.notas),
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
        <DialogTitle>{cliente ? 'Editar ficha' : 'Nuevo cliente'}</DialogTitle>
        <DialogDescription>
          {interno ? 'Área interna de la organización.' : 'Datos del cliente.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo etiqueta="Tipo">
          {(p) => (
            <Controller
              control={control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={p.id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="interno">Área interna</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </Campo>
        <Campo etiqueta="Nombre" error={errors.nombre?.message}>
          {(p) => <Input {...p} {...register('nombre')} />}
        </Campo>
        {interno ? null : (
          <>
            <Campo etiqueta="RUT" error={errors.rut?.message} ayuda="Ej.: 76123456-K">
              {(p) => <Input {...p} {...register('rut')} />}
            </Campo>
            <Campo etiqueta="Dirección" error={errors.direccion?.message}>
              {(p) => <Input {...p} {...register('direccion')} />}
            </Campo>
            <Campo etiqueta="Condición de pago" error={errors.condicion_pago?.message}>
              {(p) => <Input {...p} {...register('condicion_pago')} />}
            </Campo>
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="exige_oc"
                render={({ field }) => (
                  <Checkbox
                    id="cliente-exige-oc"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <Label htmlFor="cliente-exige-oc">Exige orden de compra para facturar</Label>
            </div>
            <Campo etiqueta="Notas" error={errors.notas?.message}>
              {(p) => <Input {...p} {...register('notas')} />}
            </Campo>
          </>
        )}
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

export function DialogoCliente({
  abierto,
  alCambiar,
  cliente,
  alGuardar,
}: {
  alCambiar: (abierto: boolean) => void;
  cliente?: ClienteSalidaDatos | undefined;
  alGuardar?: ((c: ClienteSalidaDatos) => void) | undefined;
  abierto: boolean;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <FormularioCliente alCambiar={alCambiar} cliente={cliente} alGuardar={alGuardar} />
      </DialogContent>
    </Dialog>
  );
}
