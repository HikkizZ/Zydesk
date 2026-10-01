import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { BotonConPista } from '@/components/dominio/BotonConPista';
import { mensajeDeError } from '@/components/dominio/EstadoError';
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
import { usePermiso } from '@/features/auth/SesionProvider';
import { descargar } from '@/lib/api';
import {
  clavesCotizacion,
  duplicarCotizacion,
  eliminarCotizacion,
  enviarCotizacion,
  invalidarCotizacion,
  urlDescarga,
  type CotizacionSalidaDatos,
} from '../api';

type Confirmacion = 'enviar' | 'eliminar' | null;

// Acciones del encabezado del cotizador según permisos y estado (spec fase 4 §11.4 punto 1).
export function AccionesCotizacion({
  cotizacion,
  hayCambios,
  puedeGuardar,
  guardando,
  onGuardar,
  onImportar,
  onAplicarPlantilla,
}: {
  cotizacion: CotizacionSalidaDatos;
  hayCambios: boolean;
  puedeGuardar: boolean;
  guardando: boolean;
  onGuardar: () => void;
  onImportar: () => void;
  onAplicarPlantilla: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const puedeEditar = usePermiso('tickets.editar');
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);
  const [descargando, setDescargando] = useState(false);

  const refrescar = () =>
    invalidarCotizacion(queryClient, cotizacion.id, cotizacion.ot.id, cotizacion.ot.ticket.id);
  // 409 (no editable, aprobada, tarifa faltante, OT cerrada…): mensaje de la API y se vuelve a leer.
  const alError = (err: unknown) => {
    setConfirmar(null);
    toast.error(mensajeDeError(err));
    void refrescar();
  };

  const enviar = useMutation({
    mutationFn: () => enviarCotizacion(cotizacion.id),
    onSuccess: async (c) => {
      queryClient.setQueryData(clavesCotizacion.una(c.id), c);
      setConfirmar(null);
      toast.success(`Marcada como enviada · ${cotizacion.ot.codigo} pasó a Cotizada`);
      await refrescar();
    },
    onError: alError,
  });
  const duplicar = useMutation({
    mutationFn: () => duplicarCotizacion(cotizacion.id),
    onSuccess: async (c) => {
      queryClient.setQueryData(clavesCotizacion.una(c.id), c);
      toast.success(`${c.codigo} v${c.version} creada`);
      navigate(`/cotizaciones/${c.id}`);
      await refrescar();
    },
    onError: alError,
  });
  const eliminar = useMutation({
    mutationFn: () => eliminarCotizacion(cotizacion.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: clavesCotizacion.una(cotizacion.id) });
      setConfirmar(null);
      toast.success('Borrador eliminado');
      navigate(`/ots/${cotizacion.ot.id}`);
      await refrescar();
    },
    onError: alError,
  });
  const ocupado = enviar.isPending || duplicar.isPending || eliminar.isPending;

  const bajar = async (formato: 'xlsx' | 'pdf') => {
    setDescargando(true);
    try {
      await descargar(urlDescarga(cotizacion.id, formato));
      toast.success('Descarga registrada en el historial de la OT');
      void queryClient.invalidateQueries({ queryKey: ['ot', cotizacion.ot.id] });
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setDescargando(false);
    }
  };

  const pistaGuardar = hayCambios ? 'Guarda primero' : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {puedeEditar && cotizacion.editable ? (
        <>
          <Button
            type="button"
            disabled={!hayCambios || !puedeGuardar || guardando}
            onClick={onGuardar}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
          <BotonConPista
            type="button"
            variant="outline"
            disabled={hayCambios || ocupado}
            pista={pistaGuardar}
            onClick={onImportar}
          >
            Importar horas de las tareas…
          </BotonConPista>
          <BotonConPista
            type="button"
            variant="outline"
            disabled={hayCambios || ocupado}
            pista={pistaGuardar}
            onClick={onAplicarPlantilla}
          >
            Aplicar plantilla…
          </BotonConPista>
          <BotonConPista
            type="button"
            variant="outline"
            disabled={hayCambios || ocupado}
            pista={pistaGuardar}
            onClick={() => setConfirmar('enviar')}
          >
            Marcar como enviada…
          </BotonConPista>
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={() => setConfirmar('eliminar')}
          >
            Eliminar borrador…
          </Button>
        </>
      ) : null}
      {puedeEditar && cotizacion.duplicable ? (
        <Button type="button" disabled={ocupado} onClick={() => duplicar.mutate()}>
          Duplicar como v{cotizacion.version + 1}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={descargando}
        onClick={() => void bajar('xlsx')}
      >
        Descargar .xlsx
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={descargando}
        onClick={() => void bajar('pdf')}
      >
        Descargar PDF
      </Button>
      {!puedeEditar ? <span className="text-sm text-tinta-2">Solo lectura</span> : null}

      <AlertDialog open={confirmar === 'enviar'} onOpenChange={(a) => !a && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como enviada</AlertDialogTitle>
            <AlertDialogDescription>
              Descarga el documento y envíalo al cliente fuera de la app. Al confirmar, la OT pasa a
              Cotizada y esta versión deja de ser editable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviar.isPending}
              onClick={(e) => {
                e.preventDefault();
                enviar.mutate();
              }}
            >
              Marcar como enviada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmar === 'eliminar'} onOpenChange={(a) => !a && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar borrador</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará {cotizacion.codigo} v{cotizacion.version} con todas sus líneas. No se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={eliminar.isPending}
              onClick={(e) => {
                e.preventDefault();
                eliminar.mutate();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
