import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_TIPO_LINEA,
  ETIQUETA_UNIDAD,
  PlantillaCotizacionEntrada,
  TIPOS_LINEA,
  UNIDADES,
  type PlantillaCotizacionEntradaDatos,
  type PlantillaCotizacionSalidaDatos,
} from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Campo } from '@/components/dominio/Campo';
import { mensajeDeError } from '@/components/dominio/EstadoError';
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
import { Textarea } from '@/components/ui/textarea';
import { ErrorApi } from '@/lib/api';
import { crearPlantilla, guardarPlantilla } from './api';
import { Seleccion } from './Seleccion';

// Entrada del formulario (con los `default` de Zod aún sin aplicar) y salida validada.
type Entrada = z.input<typeof PlantillaCotizacionEntrada>;

const aTextoOpcional = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const aNumero = (v: unknown) => (v === '' ? NaN : Number(v));

const LINEA_NUEVA: Entrada['lineas'][number] = {
  tipo: 'mano_de_obra',
  descripcion: '',
  cantidad: 1,
  unidad: 'h',
  precio_unitario: null,
  descuento_pct: 0,
};

// Crea (sin `plantilla`) o edita una plantilla de cotización.
export function DialogoPlantilla({
  plantilla,
  alCerrar,
}: {
  plantilla?: PlantillaCotizacionSalidaDatos;
  alCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Entrada, unknown, PlantillaCotizacionEntradaDatos>({
    resolver: zodResolver(PlantillaCotizacionEntrada),
    defaultValues: {
      nombre: plantilla?.nombre ?? '',
      descripcion: plantilla?.descripcion ?? null,
      condiciones: plantilla?.condiciones ?? null,
      lineas: (plantilla?.lineas ?? []).map((l) => ({
        tipo: l.tipo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.precio_unitario,
        descuento_pct: l.descuento_pct,
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });

  const guardar = useMutation({
    mutationFn: (v: PlantillaCotizacionEntradaDatos) =>
      plantilla ? guardarPlantilla(plantilla.id, v) : crearPlantilla(v),
    onSuccess: async () => {
      toast.success(plantilla ? 'Plantilla guardada' : 'Plantilla creada');
      await queryClient.invalidateQueries({ queryKey: ['plantillas'] });
      alCerrar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
        setError('nombre', { message: 'Ya existe una plantilla con ese nombre' });
      } else setErrorGeneral(mensajeDeError(err));
    },
  });

  const errorLinea = (
    i: number,
    campo: 'descripcion' | 'cantidad' | 'precio_unitario' | 'descuento_pct',
  ) => errors.lineas?.[i]?.[campo]?.message;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{plantilla ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>
            Las líneas se agregan a una cotización en borrador al aplicar la plantilla.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            setErrorGeneral(null);
            void handleSubmit((v) => guardar.mutate(v))(e);
          }}
        >
          <Campo etiqueta="Nombre" error={errors.nombre?.message}>
            {(p) => <Input autoComplete="off" maxLength={80} {...p} {...register('nombre')} />}
          </Campo>
          <Campo etiqueta="Descripción" error={errors.descripcion?.message}>
            {(p) => (
              <Input
                autoComplete="off"
                maxLength={300}
                {...p}
                {...register('descripcion', { setValueAs: aTextoOpcional })}
              />
            )}
          </Campo>
          <Campo etiqueta="Condiciones comerciales" error={errors.condiciones?.message}>
            {(p) => (
              <Textarea
                rows={3}
                {...p}
                {...register('condiciones', { setValueAs: aTextoOpcional })}
              />
            )}
          </Campo>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">Líneas</legend>
            {fields.length === 0 ? (
              <p className="text-sm text-tinta-2">Sin líneas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="text-left text-tinta-2">
                      <th className="w-8 pb-1 font-medium">N°</th>
                      <th className="w-40 pb-1 font-medium">Tipo</th>
                      <th className="pb-1 font-medium">Descripción</th>
                      <th className="w-24 pb-1 font-medium">Cantidad</th>
                      <th className="w-24 pb-1 font-medium">Unidad</th>
                      <th className="w-36 pb-1 font-medium">Precio unitario</th>
                      <th className="w-24 pb-1 font-medium">Desc. %</th>
                      <th className="w-10 pb-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((campo, i) => (
                      <tr key={campo.id} className="align-top">
                        <td className="py-1 pr-2 pt-2.5">{i + 1}</td>
                        <td className="py-1 pr-2">
                          <Controller
                            control={control}
                            name={`lineas.${i}.tipo`}
                            render={({ field }) => (
                              <Seleccion
                                etiqueta={`Tipo de la línea ${i + 1}`}
                                valor={field.value}
                                alCambiar={field.onChange}
                                opciones={TIPOS_LINEA.map((t) => ({
                                  valor: t,
                                  etiqueta: ETIQUETA_TIPO_LINEA[t],
                                }))}
                              />
                            )}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            aria-label={`Descripción de la línea ${i + 1}`}
                            aria-invalid={Boolean(errorLinea(i, 'descripcion'))}
                            maxLength={300}
                            {...register(`lineas.${i}.descripcion`)}
                          />
                          {errorLinea(i, 'descripcion') ? (
                            <p role="alert" className="mt-1 text-xs text-urgente">
                              {errorLinea(i, 'descripcion')}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            type="number"
                            step={0.01}
                            min={0.01}
                            aria-label={`Cantidad de la línea ${i + 1}`}
                            aria-invalid={Boolean(errorLinea(i, 'cantidad'))}
                            {...register(`lineas.${i}.cantidad`, { setValueAs: aNumero })}
                          />
                          {errorLinea(i, 'cantidad') ? (
                            <p role="alert" className="mt-1 text-xs text-urgente">
                              {errorLinea(i, 'cantidad')}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2">
                          <Controller
                            control={control}
                            name={`lineas.${i}.unidad`}
                            render={({ field }) => (
                              <Seleccion
                                etiqueta={`Unidad de la línea ${i + 1}`}
                                valor={field.value}
                                alCambiar={field.onChange}
                                opciones={UNIDADES.map((u) => ({
                                  valor: u,
                                  etiqueta: ETIQUETA_UNIDAD[u],
                                }))}
                              />
                            )}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            type="number"
                            step={0.01}
                            min={0}
                            placeholder="Tarifa"
                            aria-label={`Precio unitario de la línea ${i + 1}`}
                            aria-invalid={Boolean(errorLinea(i, 'precio_unitario'))}
                            {...register(`lineas.${i}.precio_unitario`, {
                              setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                            })}
                          />
                          {errorLinea(i, 'precio_unitario') ? (
                            <p role="alert" className="mt-1 text-xs text-urgente">
                              {errorLinea(i, 'precio_unitario')}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2">
                          <Input
                            type="number"
                            step={0.01}
                            min={0}
                            max={100}
                            aria-label={`Descuento de la línea ${i + 1}`}
                            aria-invalid={Boolean(errorLinea(i, 'descuento_pct'))}
                            {...register(`lineas.${i}.descuento_pct`, { setValueAs: aNumero })}
                          />
                          {errorLinea(i, 'descuento_pct') ? (
                            <p role="alert" className="mt-1 text-xs text-urgente">
                              {errorLinea(i, 'descuento_pct')}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Quitar la línea ${i + 1}`}
                            onClick={() => remove(i)}
                          >
                            ×
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm text-tinta-2">Precio vacío = tarifa vigente al aplicar</p>
            {errors.lineas?.message ? (
              <p role="alert" className="text-sm text-urgente">
                {errors.lineas.message}
              </p>
            ) : null}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={fields.length >= 50}
                onClick={() => append({ ...LINEA_NUEVA })}
              >
                Agregar línea
              </Button>
            </div>
          </fieldset>

          {errorGeneral ? (
            <p role="alert" className="text-sm text-urgente">
              {errorGeneral}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : plantilla ? 'Guardar' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
