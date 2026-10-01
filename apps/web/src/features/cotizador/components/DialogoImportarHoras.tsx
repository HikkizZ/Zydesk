import { useMutation, useQuery } from '@tanstack/react-query';
import { formatearCLP } from '@zydesk/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePermiso } from '@/features/auth/SesionProvider';
import { cliente as obtenerCliente } from '@/features/clientes/api';
import { clavesOt, ot as obtenerOt } from '@/features/ots/api';
import { mensajeDeOt } from '@/features/ots/errores';
import { cn } from '@/lib/utils';
import {
  clavesCotizacion,
  importarHoras,
  tarifas as obtenerTarifas,
  type CotizacionSalidaDatos,
} from '../api';

type Origen = 'estimadas' | 'reales';

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

function Contenido({
  cotizacion,
  onCerrar,
  onHecho,
}: {
  cotizacion: CotizacionSalidaDatos;
  onCerrar: () => void;
  onHecho: (c: CotizacionSalidaDatos) => void;
}) {
  const puedeConfigurar = usePermiso('config.editar');
  const [origen, setOrigen] = useState<Origen>('estimadas');
  const [error, setError] = useState<string | null>(null);
  const ot = useQuery({
    queryKey: clavesOt.ot(cotizacion.ot.id),
    queryFn: () => obtenerOt(cotizacion.ot.id),
    staleTime: 30_000,
  });
  const tarifas = useQuery({
    queryKey: clavesCotizacion.tarifas,
    queryFn: obtenerTarifas,
    staleTime: 60_000,
  });
  const clienteId = cotizacion.cliente?.id;
  const cliente = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => obtenerCliente(clienteId as number),
    enabled: clienteId !== undefined,
    staleTime: 60_000,
  });

  const importar = useMutation({
    mutationFn: () => importarHoras(cotizacion.id, origen),
    onSuccess: (c) => {
      toast.success('Horas importadas');
      onHecho(c);
    },
    onError: (err) => setError(mensajeDeOt(err)),
  });

  const horas = ot.data?.horas;
  const horasDe = (o: Origen) => (horas ? horas[o === 'estimadas' ? 'estimadas' : 'reales'] : null);
  const tarifaCliente = cliente.data?.tarifas.find((t) => t.concepto === 'hora_normal')?.valor;
  const tarifaGlobal = tarifas.data?.hora_normal ?? null;
  const tarifa =
    tarifaCliente !== undefined
      ? { texto: `Tarifa del cliente ${formatearCLP(tarifaCliente)}/h` }
      : tarifaGlobal !== null
        ? { texto: `Tarifa global ${formatearCLP(tarifaGlobal)}/h` }
        : null;
  const cargando =
    ot.isPending || tarifas.isPending || (clienteId !== undefined && cliente.isPending);
  const enUf = cotizacion.moneda === 'UF';
  const sinHoras = horasDe(origen) === 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Importar horas de las tareas</DialogTitle>
        <DialogDescription>
          Agrega una línea de mano de obra por cada tarea de {cotizacion.ot.codigo} con horas. Las
          líneas se suman a las que ya hay.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          importar.mutate();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Horas a importar</legend>
          {(['estimadas', 'reales'] as const).map((o) => (
            <label
              key={o}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3',
                origen === o ? 'border-2 border-acento bg-media-fondo/40' : 'bg-superficie',
              )}
            >
              <input
                type="radio"
                name="origen-horas"
                checked={origen === o}
                onChange={() => setOrigen(o)}
                className="size-4 accent-[var(--color-acento)]"
              />
              <span className="text-sm">
                <span className="font-semibold">{o === 'estimadas' ? 'Estimadas' : 'Reales'}</span>
                {horasDe(o) !== null ? (
                  <span className="text-tinta-2"> · {formatoHoras.format(horasDe(o) ?? 0)} h</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        {cargando ? (
          <p role="status" className="text-sm text-tinta-2">
            Cargando tarifa…
          </p>
        ) : enUf ? (
          <p role="alert" className="text-sm text-alta">
            Las tarifas están en pesos: cambia la moneda a CLP para importar horas.
          </p>
        ) : tarifa ? (
          <p className="text-sm text-tinta-2">{tarifa.texto}</p>
        ) : (
          <p role="alert" className="text-sm text-alta">
            No hay tarifa de hora normal.{' '}
            {puedeConfigurar ? (
              <Link
                to="/configuracion/tarifas"
                className="text-acento underline underline-offset-2"
              >
                Configúrala en Configuración → Tarifas
              </Link>
            ) : (
              'Pide a Administración configurarla.'
            )}
          </p>
        )}
        {sinHoras ? (
          <p className="text-sm text-tinta-2">Las tareas no tienen horas {origen}.</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={cargando || enUf || tarifa === null || sinHoras || importar.isPending}
          >
            {importar.isPending ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoImportarHoras({
  cotizacion,
  abierto,
  onCerrar,
  onHecho,
}: {
  cotizacion: CotizacionSalidaDatos;
  abierto: boolean;
  onCerrar: () => void;
  onHecho: (c: CotizacionSalidaDatos) => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? (
          <Contenido cotizacion={cotizacion} onCerrar={onCerrar} onHecho={onHecho} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
