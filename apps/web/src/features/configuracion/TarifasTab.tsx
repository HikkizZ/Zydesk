import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CONCEPTOS_TARIFA,
  ETIQUETA_CONCEPTO_TARIFA,
  ETIQUETA_FUENTE_UF,
  TarifasEntrada,
  formatearValorUf,
  type ConceptoTarifa,
  type Moneda,
  type TarifasEntradaDatos,
  type TarifasSalidaDatos,
} from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { formatearDiaAnio } from '@/features/clientes/formato';
import { indicadorUf, clavesCotizacion, STALE_UF } from '@/features/cotizador/api';
import { Campo } from '@/components/dominio/Campo';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { guardarTarifas, tarifas } from './api';
import { EntradaTarifa } from './EntradaTarifa';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

// Vacío = sin definir (`null`, se muestra "[TARIFA]").
const aMonto = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
const aTextoOpcional = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

const UNIDAD_CONCEPTO: Record<ConceptoTarifa | 'costo_interno', string> = {
  hora_normal: 'por hora',
  hora_extendida: 'por hora',
  hora_urgencia: 'por hora',
  traslado_km: 'por km',
  costo_interno: 'por hora',
};

type Texto = Record<ConceptoTarifa, string>;
type Monedas = Record<ConceptoTarifa, Moneda>;

// Línea informativa con el indicador diario de la UF (el admin no lo edita aquí).
function LineaUf() {
  const consulta = useQuery({
    queryKey: clavesCotizacion.uf,
    queryFn: indicadorUf,
    staleTime: STALE_UF,
  });
  if (!consulta.isSuccess) return null;
  const uf = consulta.data;
  if (uf === null) {
    return (
      <p className="text-sm text-tinta-3">
        Sin valor de la UF todavía: en cada cotización puedes escribirlo a mano
      </p>
    );
  }
  const fuente = ETIQUETA_FUENTE_UF[uf.fuente];
  return uf.desactualizado ? (
    <p className="text-sm text-tinta-3">
      UF del {formatearDiaAnio(uf.fecha)} ({formatearValorUf(uf.valor)}, {fuente}):{' '}
      <strong className="font-semibold text-alta">puede estar desactualizada</strong>
    </p>
  ) : (
    <p className="text-sm text-tinta-3">
      UF del día: {formatearValorUf(uf.valor)} · {formatearDiaAnio(uf.fecha)} · {fuente}
    </p>
  );
}

function FormularioTarifas({ datos }: { datos: TarifasSalidaDatos }) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TarifasEntradaDatos>({
    resolver: zodResolver(TarifasEntrada),
    defaultValues: datos,
  });
  // El texto escrito y la moneda elegida viven aparte para no perder "0." ni la moneda de una tarifa vacía.
  const [textos, setTextos] = useState<Texto>(
    () =>
      Object.fromEntries(CONCEPTOS_TARIFA.map((c) => [c, String(datos[c]?.valor ?? '')])) as Texto,
  );
  const [monedas, setMonedas] = useState<Monedas>(
    () =>
      Object.fromEntries(CONCEPTOS_TARIFA.map((c) => [c, datos[c]?.moneda ?? 'CLP'])) as Monedas,
  );
  const fijar = (concepto: ConceptoTarifa, texto: string, moneda: Moneda) => {
    setTextos((t) => ({ ...t, [concepto]: texto }));
    setMonedas((m) => ({ ...m, [concepto]: moneda }));
    // Vacío = sin definir (`null`, se muestra "[TARIFA]").
    setValue(concepto, texto.trim() === '' ? null : { moneda, valor: Number(texto) }, {
      shouldDirty: true,
    });
  };

  const guardar = useMutation({
    mutationFn: guardarTarifas,
    onSuccess: async (guardadas) => {
      toast.success('Tarifas guardadas');
      reset(guardadas);
      setTextos(
        Object.fromEntries(
          CONCEPTOS_TARIFA.map((c) => [c, String(guardadas[c]?.valor ?? '')]),
        ) as Texto,
      );
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
          {CONCEPTOS_TARIFA.map((concepto) => (
            <Campo
              key={concepto}
              etiqueta={ETIQUETA_CONCEPTO_TARIFA[concepto]}
              error={errors[concepto]?.valor?.message ?? errors[concepto]?.message}
              ayuda={UNIDAD_CONCEPTO[concepto]}
            >
              {(p) => (
                <EntradaTarifa
                  id={p.id}
                  etiqueta={ETIQUETA_CONCEPTO_TARIFA[concepto]}
                  moneda={monedas[concepto]}
                  texto={textos[concepto]}
                  alCambiarMoneda={(m) => fijar(concepto, textos[concepto], m)}
                  alCambiarTexto={(t) => fijar(concepto, t, monedas[concepto])}
                  invalido={p['aria-invalid']}
                  describedby={p['aria-describedby']}
                />
              )}
            </Campo>
          ))}
          <Campo
            etiqueta={ETIQUETA_CONCEPTO_TARIFA.costo_interno}
            error={errors.costo_interno?.message}
            ayuda={UNIDAD_CONCEPTO.costo_interno}
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
                  {...register('costo_interno', { setValueAs: aMonto })}
                />
              </div>
            )}
          </Campo>
          <LineaUf />
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
