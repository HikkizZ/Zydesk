import {
  enClp,
  formatearMonto,
  type Moneda,
  type TotalesCotizacion as Totales,
} from '@zydesk/shared';
import { Monto } from '@/components/dominio/Monto';
import { cn } from '@/lib/utils';

// Totales calculados en vivo con `calcularCotizacion` (ADR 0007); la API los vuelve a calcular al guardar.
export function TotalesCotizacion({
  totales,
  moneda,
  aplicaIva,
  ivaPct,
  valorUf,
  procedencia,
  className,
}: {
  totales: Totales;
  moneda: Moneda;
  aplicaIva: boolean;
  ivaPct: number;
  valorUf: number | null;
  /** De dónde viene el valor UF («del 5 oct 2026», «ingresado a mano»); sin dato, «indicado». */
  procedencia?: string | undefined;
  className?: string;
}) {
  const enPesos = moneda === 'UF' ? enClp(totales.total, moneda, valorUf) : null;
  const pctIva = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(ivaPct);
  return (
    <section
      aria-label="Totales"
      className={cn('rounded-lg border border-borde bg-superficie p-4 shadow-sm', className)}
    >
      <h2 className="mb-2 font-titulo text-base font-semibold">Totales</h2>
      <dl className="flex flex-col gap-1 text-sm">
        <Fila etiqueta="Subtotal">
          <Monto valor={totales.subtotal} moneda={moneda} />
        </Fila>
        <Fila etiqueta="Descuentos">
          {totales.descuentos > 0 ? (
            <span className="text-right font-mono text-alta tabular-nums">
              {formatearMonto(-totales.descuentos, moneda)}
            </span>
          ) : (
            <Monto valor={0} moneda={moneda} />
          )}
        </Fila>
        <Fila etiqueta="Neto" fuerte>
          <Monto valor={totales.neto} moneda={moneda} className="font-semibold" />
        </Fila>
        <Fila etiqueta={aplicaIva ? `IVA ${pctIva} %` : 'IVA'}>
          {aplicaIva ? (
            <Monto valor={totales.iva} moneda={moneda} />
          ) : (
            <span className="text-tinta-2">Exento</span>
          )}
        </Fila>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2">
          <dt className="font-semibold">Total</dt>
          <dd>
            <Monto
              valor={totales.total}
              moneda={moneda}
              className="font-titulo text-2xl font-bold"
            />
          </dd>
        </div>
      </dl>
      {moneda === 'UF' ? (
        <p className="mt-1 text-right text-sm text-tinta-2">
          {enPesos === null ? (
            'Indica el valor de la UF para ver el equivalente en pesos'
          ) : (
            <>
              ≈ <Monto valor={enPesos} className="text-tinta-2" /> al valor UF{' '}
              {procedencia ?? 'indicado'}
            </>
          )}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-tinta-3">La API vuelve a calcular al guardar</p>
    </section>
  );
}

function Fila({
  etiqueta,
  fuerte,
  children,
}: {
  etiqueta: string;
  fuerte?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-tinta-2', fuerte && 'font-semibold text-tinta')}>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}
