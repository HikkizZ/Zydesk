import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ContactoEntrada } from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { ErrorApi } from '@/lib/api';
import { crearContacto, editarContacto, type ContactoSalidaDatos } from '../api';
import { errorZodACampos, nuloSiVacio } from '../formato';

interface Valores {
  nombre: string;
  area: string;
  correo: string;
  telefono: string;
  aprueba_cotizaciones: boolean;
}

const valoresIniciales = (c?: ContactoSalidaDatos): Valores => ({
  nombre: c?.nombre ?? '',
  area: c?.area ?? '',
  correo: c?.correo ?? '',
  telefono: c?.telefono ?? '',
  aprueba_cotizaciones: c?.aprueba_cotizaciones ?? false,
});

function FormularioContacto({
  alCambiar,
  clienteId,
  contacto,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
  contacto?: ContactoSalidaDatos | undefined;
}) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Valores>({ defaultValues: valoresIniciales(contacto) });

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof ContactoEntrada.parse>) =>
      contacto
        ? editarContacto(clienteId, contacto.id, entrada)
        : crearContacto(clienteId, entrada),
    onSuccess: async () => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] }),
      ]);
      alCambiar(false);
    },
    onError: (err) =>
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      ),
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const resultado = ContactoEntrada.safeParse({
      nombre: v.nombre,
      area: nuloSiVacio(v.area),
      correo: nuloSiVacio(v.correo),
      telefono: nuloSiVacio(v.telefono),
      aprueba_cotizaciones: v.aprueba_cotizaciones,
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
        <DialogTitle>{contacto ? 'Editar contacto' : 'Agregar contacto'}</DialogTitle>
        <DialogDescription>Persona de contacto del cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <Campo etiqueta="Nombre" error={errors.nombre?.message}>
          {(p) => <Input {...p} {...register('nombre')} />}
        </Campo>
        <Campo etiqueta="Área" error={errors.area?.message}>
          {(p) => <Input {...p} {...register('area')} />}
        </Campo>
        <Campo etiqueta="Correo" error={errors.correo?.message}>
          {(p) => <Input type="email" {...p} {...register('correo')} />}
        </Campo>
        <Campo etiqueta="Teléfono" error={errors.telefono?.message}>
          {(p) => <Input type="tel" {...p} {...register('telefono')} />}
        </Campo>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="aprueba_cotizaciones"
            render={({ field }) => (
              <Checkbox
                id="contacto-aprueba"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
            )}
          />
          <Label htmlFor="contacto-aprueba">Aprueba cotizaciones</Label>
        </div>
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

export function DialogoContacto({
  abierto,
  alCambiar,
  clienteId,
  contacto,
}: {
  alCambiar: (abierto: boolean) => void;
  clienteId: number;
  contacto?: ContactoSalidaDatos | undefined;
  abierto: boolean;
}) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent>
        <FormularioContacto alCambiar={alCambiar} clienteId={clienteId} contacto={contacto} />
      </DialogContent>
    </Dialog>
  );
}
