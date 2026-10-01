import { useMutation, useQuery } from '@tanstack/react-query';
import { ETIQUETA_UNIDAD, type PlantillaCotizacionSalidaDatos } from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  aplicarPlantilla,
  clavesCotizacion,
  plantillas as obtenerPlantillas,
  type CotizacionSalidaDatos,
} from '../api';

// "3 líneas: Diagnóstico · h, Pruebas · h, Informe · gl"
function resumenLineas(p: PlantillaCotizacionSalidaDatos): string {
  const n = p.lineas.length;
  const lista = p.lineas.map((l) => `${l.descripcion} · ${ETIQUETA_UNIDAD[l.unidad]}`).join(', ');
  return `${n} ${n === 1 ? 'línea' : 'líneas'}${n > 0 ? `: ${lista}` : ''}`;
}

function Contenido({
  cotizacion,
  onCerrar,
  onHecho,
}: {
  cotizacion: CotizacionSalidaDatos;
  onCerrar: () => void;
  onHecho: (c: CotizacionSalidaDatos) => void;
}) {
  const [elegida, setElegida] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: clavesCotizacion.plantillas,
    queryFn: obtenerPlantillas,
    staleTime: 60_000,
  });
  const aplicar = useMutation({
    mutationFn: (plantillaId: number) => aplicarPlantilla(cotizacion.id, plantillaId),
    onSuccess: (c) => {
      toast.success('Plantilla aplicada');
      onHecho(c);
    },
    onError: (err) => setError(mensajeDeError(err)),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aplicar plantilla</DialogTitle>
        <DialogDescription>
          Las líneas de la plantilla se suman a las que ya hay. Las horas y los kilómetros toman la
          tarifa vigente si la plantilla no fija un precio.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (elegida !== null) aplicar.mutate(elegida);
        }}
      >
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-tinta-2">No hay plantillas activas.</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Plantillas</legend>
            {consulta.data.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3',
                  elegida === p.id ? 'border-2 border-acento bg-media-fondo/40' : 'bg-superficie',
                )}
              >
                <input
                  type="radio"
                  name="plantilla"
                  checked={elegida === p.id}
                  onChange={() => setElegida(p.id)}
                  className="mt-1 size-4 accent-[var(--color-acento)]"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{p.nombre}</span>
                  {p.descripcion ? (
                    <span className="text-sm text-tinta-2">{p.descripcion}</span>
                  ) : null}
                  <span className="text-xs break-words text-tinta-3">{resumenLineas(p)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={elegida === null || aplicar.isPending}>
            {aplicar.isPending ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoPlantilla({
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
