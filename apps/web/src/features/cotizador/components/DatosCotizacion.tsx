import { ETIQUETA_MONEDA, MONEDAS, venceEl, type CotizacionSalidaDatos } from '@zydesk/shared';
import { Controller, useWatch } from 'react-hook-form';
import { Campo } from '@/components/dominio/Campo';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { SIN_VALOR } from '../formulario';
import type { FormularioCotizacion } from './TablaLineas';

const formatoFechaLarga = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const aTextoOpcional = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

export interface ContactoOpcion {
  id: number;
  nombre: string;
  aprueba_cotizaciones: boolean;
}

export function DatosCotizacion({
  form,
  cotizacion,
  contactos,
  editable,
}: {
  form: FormularioCotizacion;
  cotizacion: CotizacionSalidaDatos;
  contactos: ContactoOpcion[];
  editable: boolean;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const fecha = useWatch({ control, name: 'fecha_emision' });
  const validez = useWatch({ control, name: 'validez_dias' });
  const moneda = useWatch({ control, name: 'moneda' });
  const vence = /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')
    ? formatoFechaLarga.format(new Date(`${venceEl(fecha, validez)}T00:00:00Z`))
    : null;

  return (
    <section
      aria-label="Datos de la cotización"
      className="rounded-lg border border-borde bg-superficie p-4 sm:p-5"
    >
      <h2 className="mb-3 font-titulo text-base font-semibold">Datos</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Contacto" error={errors.contacto_id?.message}>
          {(p) => (
            <Controller
              control={control}
              name="contacto_id"
              render={({ field }) => (
                <Seleccion
                  id={p.id}
                  etiqueta="Contacto"
                  valor={field.value === null ? SIN_VALOR : String(field.value)}
                  alCambiar={(v) => field.onChange(v === SIN_VALOR ? null : Number(v))}
                  opciones={[
                    { valor: SIN_VALOR, etiqueta: 'Elegir…' },
                    ...contactos.map((c) => ({
                      valor: String(c.id),
                      etiqueta: c.aprueba_cotizaciones ? `${c.nombre} · aprueba` : c.nombre,
                    })),
                  ]}
                  disabled={!editable}
                  invalido={p['aria-invalid']}
                />
              )}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de emisión" error={errors.fecha_emision?.message}>
          {(p) => <Input {...p} type="date" disabled={!editable} {...register('fecha_emision')} />}
        </Campo>
        <Campo
          etiqueta="Validez"
          error={errors.validez_dias?.message}
          ayuda={vence ? `Vence el ${vence}` : undefined}
        >
          {(p) => (
            <Controller
              control={control}
              name="validez_dias"
              render={({ field }) => (
                <Seleccion
                  id={p.id}
                  etiqueta="Validez"
                  valor={String(field.value)}
                  alCambiar={(v) => field.onChange(Number(v))}
                  opciones={[
                    { valor: '15', etiqueta: '15 días' },
                    { valor: '30', etiqueta: '30 días' },
                  ]}
                  disabled={!editable}
                />
              )}
            />
          )}
        </Campo>
        <Campo etiqueta="Moneda" error={errors.moneda?.message}>
          {(p) => (
            <Controller
              control={control}
              name="moneda"
              render={({ field }) => (
                <Seleccion
                  id={p.id}
                  etiqueta="Moneda"
                  valor={field.value}
                  alCambiar={field.onChange}
                  opciones={MONEDAS.map((m) => ({ valor: m, etiqueta: ETIQUETA_MONEDA[m] }))}
                  disabled={!editable}
                />
              )}
            />
          )}
        </Campo>
        {moneda === 'UF' ? (
          <Campo etiqueta="Valor UF" error={errors.valor_uf?.message}>
            {(p) => (
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-tinta-2">
                  $
                </span>
                <Input
                  {...p}
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="font-mono"
                  disabled={!editable}
                  {...register('valor_uf', {
                    setValueAs: (v) =>
                      v === '' || v === null || v === undefined ? null : Number(v),
                  })}
                />
              </div>
            )}
          </Campo>
        ) : null}
        <div className="flex items-center gap-2 self-end sm:min-h-9">
          <Controller
            control={control}
            name="aplica_iva"
            render={({ field }) => (
              <Checkbox
                id="cotizacion-aplica-iva"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                disabled={!editable}
                className="size-5"
              />
            )}
          />
          <Label htmlFor="cotizacion-aplica-iva">Aplica IVA {cotizacion.iva_pct} %</Label>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <Campo
          etiqueta="Condiciones comerciales"
          error={errors.condiciones?.message}
          ayuda="Va en la planilla y el PDF"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              disabled={!editable}
              {...register('condiciones', { setValueAs: aTextoOpcional })}
            />
          )}
        </Campo>
        <Campo
          etiqueta="Nota interna"
          error={errors.nota_interna?.message}
          ayuda="Solo el equipo la ve; no va en los documentos"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              className="border-nota-interna-borde bg-nota-interna-fondo"
              disabled={!editable}
              {...register('nota_interna', { setValueAs: aTextoOpcional })}
            />
          )}
        </Campo>
      </div>
    </section>
  );
}
