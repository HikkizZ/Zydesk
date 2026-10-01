import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CONCEPTOS_TARIFA_GLOBAL,
  ETIQUETA_CONCEPTO_TARIFA,
  TarifasEntrada,
  type TarifasEntradaDatos,
  type TarifasSalidaDatos,
} from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { guardarTarifas, tarifas } from './api';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

// Vacío = sin definir (`null`, se muestra "[TARIFA]").
const aMonto = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
const aTextoOpcional = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

const UNIDAD_CONCEPTO: Record<(typeof CONCEPTOS_TARIFA_GLOBAL)[number], string> = {
  hora_normal: 'por hora',
  hora_extendida: 'por hora',
  hora_urgencia: 'por hora',
  traslado_km: 'por km',
  costo_interno: 'por hora',
};

function FormularioTarifas({ datos }: { datos: TarifasSalidaDatos }) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TarifasEntradaDatos>({
    resolver: zodResolver(TarifasEntrada),
    defaultValues: datos,
  });

  const guardar = useMutation({
    mutationFn: guardarTarifas,
    onSuccess: async (guardadas) => {
      toast.success('Tarifas guardadas');
      reset(guardadas);
      await queryClient.invalidateQueries({ queryKey: ['tarifas'] });
    },
    onError: (err) => setErrorGeneral(mensajeDeError(err)),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        setErrorGeneral(null);
        void handleSubmit((v) => guardar.mutate(v))(e);
      }}
    >
      <Tarjeta titulo="Tarifas">
        <div className="flex flex-col gap-4">
          {CONCEPTOS_TARIFA_GLOBAL.map((concepto) => (
            <div key={concepto} className="grid items-start gap-2 sm:grid-cols-[1fr_auto] sm:gap-4">
              <Campo
                etiqueta={ETIQUETA_CONCEPTO_TARIFA[concepto]}
                error={errors[concepto]?.message}
                ayuda={UNIDAD_CONCEPTO[concepto]}
              >
                {(p) => (
                  <div className="flex max-w-xs items-center gap-2">
                    <span className="text-tinta-2">$</span>
                    <Input
                      type="number"
                      step={1}
                      min={0}
                      placeholder="[TARIFA]"
                      className="font-mono"
                      {...p}
                      {...register(concepto, { setValueAs: aMonto })}
                    />
                  </div>
                )}
              </Campo>
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Cotizaciones">
        <div className="flex flex-col gap-4">
          <Campo
            etiqueta="IVA %"
            error={errors.iva_pct?.message}
            ayuda="Cambiar el IVA solo afecta a cotizaciones nuevas"
          >
            {(p) => (
              <Input
                type="number"
                step={0.01}
                min={0}
                max={100}
                className="max-w-xs font-mono"
                {...p}
                {...register('iva_pct', { setValueAs: (v) => (v === '' ? NaN : Number(v)) })}
              />
            )}
          </Campo>
          <Campo etiqueta="Validez por defecto" error={errors.validez_dias_defecto?.message}>
            {(p) => (
              <Controller
                control={control}
                name="validez_dias_defecto"
                render={({ field }) => (
                  <Seleccion
                    id={p.id}
                    className="max-w-xs"
                    valor={String(field.value)}
                    alCambiar={(v) => field.onChange(Number(v))}
                    opciones={[
                      { valor: '15', etiqueta: '15 días' },
                      { valor: '30', etiqueta: '30 días' },
                    ]}
                  />
                )}
              />
            )}
          </Campo>
          <Campo
            etiqueta="Condiciones comerciales por defecto"
            error={errors.condiciones_defecto?.message}
          >
            {(p) => (
              <Textarea
                rows={4}
                {...p}
                {...register('condiciones_defecto', { setValueAs: aTextoOpcional })}
              />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {errorGeneral ? (
        <p role="alert" className="text-sm text-urgente">
          {errorGeneral}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}

export function TarifasTab() {
  const consulta = useQuery({ queryKey: ['tarifas'], queryFn: tarifas });
  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  }
  return <FormularioTarifas datos={consulta.data} />;
}
