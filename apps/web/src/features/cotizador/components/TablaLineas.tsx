import {
  ETIQUETA_TIPO_LINEA,
  ETIQUETA_UNIDAD,
  TIPOS_LINEA,
  UNIDADES,
  type CotizacionEntradaDatos,
  type Moneda,
} from '@zydesk/shared';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form';
import { BotonConPista } from '@/components/dominio/BotonConPista';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Monto } from '@/components/dominio/Monto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { cn } from '@/lib/utils';
import { type ValoresCotizacion, type ValoresLinea } from '../formulario';

export type FormularioCotizacion = UseFormReturn<
  ValoresCotizacion,
  unknown,
  CotizacionEntradaDatos
>;

const OPCIONES_TIPO = TIPOS_LINEA.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_LINEA[t] }));
const OPCIONES_UNIDAD = UNIDADES.map((u) => ({ valor: u, etiqueta: ETIQUETA_UNIDAD[u] }));

function ErrorCampo({ mensaje }: { mensaje: string | undefined }) {
  return mensaje ? (
    <p role="alert" className="mt-0.5 text-xs text-urgente">
      {mensaje}
    </p>
  ) : null;
}

function Rotulo({
  texto,
  clase,
  children,
}: {
  texto: string;
  clase?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1', clase)}>
      <span aria-hidden="true" className="text-xs text-tinta-2">
        {texto}
      </span>
      {children}
    </div>
  );
}

export function TablaLineas({
  form,
  moneda,
  totalesLinea,
  editable,
  precioNuevaLinea,
  vistaTarjetas,
  pistaBloqueo,
  alImportar,
  alAplicarPlantilla,
}: {
  form: FormularioCotizacion;
  moneda: Moneda;
  totalesLinea: number[];
  editable: boolean;
  precioNuevaLinea: number;
  vistaTarjetas: boolean;
  /** Motivo por el que importar y aplicar plantilla están bloqueados (cambios sin guardar). */
  pistaBloqueo: string | null;
  alImportar: () => void;
  alAplicarPlantilla: () => void;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });
  const stepPrecio = moneda === 'UF' ? '0.01' : '1';

  const agregar = () =>
    append({
      tipo: 'mano_de_obra',
      descripcion: '',
      cantidad: 1,
      unidad: 'h',
      precio_unitario: precioNuevaLinea,
      descuento_pct: 0,
    } satisfies ValoresLinea);

  if (fields.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin líneas"
        descripcion={
          editable
            ? 'Importa las horas de las tareas, aplica una plantilla o agrega una línea.'
            : 'Esta cotización no tiene líneas.'
        }
        {...(editable
          ? {
              accion: (
                <div className="flex flex-wrap justify-center gap-2">
                  <BotonConPista
                    type="button"
                    variant="outline"
                    disabled={pistaBloqueo !== null}
                    pista={pistaBloqueo}
                    onClick={alImportar}
                  >
                    Importar horas de las tareas
                  </BotonConPista>
                  <BotonConPista
                    type="button"
                    variant="outline"
                    disabled={pistaBloqueo !== null}
                    pista={pistaBloqueo}
                    onClick={alAplicarPlantilla}
                  >
                    Aplicar plantilla
                  </BotonConPista>
                  <Button type="button" onClick={agregar}>
                    Agregar línea
                  </Button>
                </div>
              ),
            }
          : {})}
      />
    );
  }

  const celdas = (i: number) => {
    const e = errors.lineas?.[i];
    const n = i + 1;
    return {
      tipo: (
        <Controller
          control={control}
          name={`lineas.${i}.tipo`}
          render={({ field }) => (
            <Seleccion
              etiqueta={`Tipo de la línea ${n}`}
              valor={field.value}
              alCambiar={field.onChange}
              opciones={OPCIONES_TIPO}
              disabled={!editable}
            />
          )}
        />
      ),
      descripcion: (
        <>
          <Input
            aria-label={`Descripción de la línea ${n}`}
            aria-invalid={Boolean(e?.descripcion)}
            disabled={!editable}
            {...register(`lineas.${i}.descripcion`)}
          />
          <ErrorCampo mensaje={e?.descripcion?.message} />
        </>
      ),
      cantidad: (
        <>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            className="text-right font-mono"
            aria-label={`Cantidad de la línea ${n}`}
            aria-invalid={Boolean(e?.cantidad)}
            disabled={!editable}
            {...register(`lineas.${i}.cantidad`, { valueAsNumber: true })}
          />
          <ErrorCampo mensaje={e?.cantidad?.message} />
        </>
      ),
      unidad: (
        <Controller
          control={control}
          name={`lineas.${i}.unidad`}
          render={({ field }) => (
            <Seleccion
              etiqueta={`Unidad de la línea ${n}`}
              valor={field.value}
              alCambiar={field.onChange}
              opciones={OPCIONES_UNIDAD}
              disabled={!editable}
            />
          )}
        />
      ),
      precio: (
        <>
          <Input
            type="number"
            step={stepPrecio}
            min="0"
            inputMode="decimal"
            className="text-right font-mono"
            aria-label={`Precio unitario de la línea ${n}`}
            aria-invalid={Boolean(e?.precio_unitario)}
            disabled={!editable}
            {...register(`lineas.${i}.precio_unitario`, { valueAsNumber: true })}
          />
          <ErrorCampo mensaje={e?.precio_unitario?.message} />
        </>
      ),
      descuento: (
        <>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            className="text-right font-mono"
            aria-label={`Descuento de la línea ${n}`}
            aria-invalid={Boolean(e?.descuento_pct)}
            disabled={!editable}
            {...register(`lineas.${i}.descuento_pct`, { valueAsNumber: true })}
          />
          <ErrorCampo mensaje={e?.descuento_pct?.message} />
        </>
      ),
      total: <Monto valor={totalesLinea[i] ?? 0} moneda={moneda} />,
      quitar: editable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Quitar la línea ${n}`}
          onClick={() => remove(i)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null,
    };
  };

  return (
    <div data-vista={vistaTarjetas ? 'tarjetas' : 'tabla'} className="flex flex-col gap-3">
      {vistaTarjetas ? (
        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => {
            const c = celdas(i);
            return (
              <li key={f.id} className="rounded-lg border border-borde bg-superficie-suave-2 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">Línea {i + 1}</span>
                  {c.quitar}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Rotulo clase="col-span-2" texto="Tipo">
                    {c.tipo}
                  </Rotulo>
                  <Rotulo clase="col-span-2" texto="Descripción">
                    {c.descripcion}
                  </Rotulo>
                  <Rotulo texto="Cantidad">{c.cantidad}</Rotulo>
                  <Rotulo texto="Unidad">{c.unidad}</Rotulo>
                  <Rotulo texto="Precio unitario">{c.precio}</Rotulo>
                  <Rotulo texto="Desc. %">{c.descuento}</Rotulo>
                </div>
                <p className="mt-3 flex items-baseline justify-between border-t pt-2 text-sm">
                  <span className="text-tinta-2">Total de la línea</span>
                  {c.total}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-superficie-suave text-left text-xs text-tinta-2">
              <tr>
                <th className="w-10 px-2 py-2 font-medium">N°</th>
                <th className="w-40 px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">Descripción</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Cantidad</th>
                <th className="w-24 px-2 py-2 font-medium">Unidad</th>
                <th className="w-36 px-2 py-2 text-right font-medium">Precio unitario</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Desc. %</th>
                <th className="w-32 px-2 py-2 text-right font-medium">Total</th>
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => {
                const c = celdas(i);
                return (
                  <tr key={f.id} className="border-t align-top">
                    <td className="px-2 py-3 font-mono text-tinta-2">{i + 1}</td>
                    <td className="px-2 py-2">{c.tipo}</td>
                    <td className="px-2 py-2">{c.descripcion}</td>
                    <td className="px-2 py-2">{c.cantidad}</td>
                    <td className="px-2 py-2">{c.unidad}</td>
                    <td className="px-2 py-2">{c.precio}</td>
                    <td className="px-2 py-2">{c.descuento}</td>
                    <td className="px-2 py-3 text-right">{c.total}</td>
                    <td className="px-1 py-1.5">{c.quitar}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable ? (
        <div>
          <Button type="button" variant="outline" onClick={agregar}>
            Agregar línea
          </Button>
        </div>
      ) : null}
    </div>
  );
}
