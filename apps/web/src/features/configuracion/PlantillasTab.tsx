import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_TIPO_LINEA, type PlantillaCotizacionSalidaDatos } from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cambiarActivoPlantilla, plantillas } from './api';
import { DialogoPlantilla } from './DialogoPlantilla';
import { Tarjeta } from './Tarjeta';

function resumenLineas(p: PlantillaCotizacionSalidaDatos): string {
  const n = p.lineas.length;
  if (n === 0) return 'Sin líneas';
  const detalle = p.lineas.map((l) => `${ETIQUETA_TIPO_LINEA[l.tipo]} · ${l.unidad}`).join(', ');
  return `${n} ${n === 1 ? 'línea' : 'líneas'}: ${detalle}`;
}

export function PlantillasTab() {
  const queryClient = useQueryClient();
  const [inactivas, setInactivas] = useState(false);
  const [editando, setEditando] = useState<PlantillaCotizacionSalidaDatos | 'nueva' | null>(null);
  const [desactivando, setDesactivando] = useState<PlantillaCotizacionSalidaDatos | null>(null);

  const consulta = useQuery({
    queryKey: ['plantillas', { inactivas }],
    queryFn: () => plantillas(inactivas ? 'false' : undefined),
  });

  const cambiarActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      cambiarActivoPlantilla(id, activo),
    onSuccess: async (_p, { activo }) => {
      toast.success(activo ? 'Plantilla reactivada' : 'Plantilla desactivada');
      await queryClient.invalidateQueries({ queryKey: ['plantillas'] });
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  let contenido;
  if (consulta.isPending) contenido = <Cargando />;
  else if (consulta.isError) {
    contenido = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.length === 0) {
    contenido = (
      <EstadoVacio titulo={inactivas ? 'Sin plantillas inactivas' : 'Aún no hay plantillas'} />
    );
  } else {
    contenido = (
      <ul className="flex flex-col divide-y divide-borde">
        {consulta.data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{p.nombre}</p>
              {p.descripcion ? <p className="text-sm text-tinta-2">{p.descripcion}</p> : null}
              <p className="text-sm text-tinta-2">{resumenLineas(p)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditando(p)}>
                Editar
              </Button>
              {p.activo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDesactivando(p)}
                >
                  Desactivar…
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cambiarActivo.isPending}
                  onClick={() => cambiarActivo.mutate({ id: p.id, activo: true })}
                >
                  Reactivar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Tarjeta
      titulo="Plantillas de cotización"
      acciones={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="ver-inactivas" checked={inactivas} onCheckedChange={setInactivas} />
            <Label htmlFor="ver-inactivas">Ver inactivas</Label>
          </div>
          <Button type="button" onClick={() => setEditando('nueva')}>
            Nueva plantilla
          </Button>
        </div>
      }
    >
      {contenido}

      {editando ? (
        <DialogoPlantilla
          {...(editando === 'nueva' ? {} : { plantilla: editando })}
          alCerrar={() => setEditando(null)}
        />
      ) : null}

      <AlertDialog open={desactivando !== null} onOpenChange={(a) => !a && setDesactivando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar la plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              {desactivando?.nombre} dejará de ofrecerse en el cotizador. Las cotizaciones ya
              creadas no cambian y puedes reactivarla después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (desactivando) cambiarActivo.mutate({ id: desactivando.id, activo: false });
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tarjeta>
  );
}
