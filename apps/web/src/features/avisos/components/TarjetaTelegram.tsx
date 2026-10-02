import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { mensajeDeError } from '@/components/dominio/EstadoError';
import { diaMes } from '@/components/dominio/formato-fecha';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { clavesAvisos, desvincularTelegram, telegram } from '../api';
import { DialogoVincular } from './DialogoVincular';

export function TarjetaTelegram() {
  const queryClient = useQueryClient();
  const [vinculando, setVinculando] = useState(false);
  const estado = useQuery({ queryKey: clavesAvisos.telegram, queryFn: telegram });
  const desvincular = useMutation({
    mutationFn: desvincularTelegram,
    onSuccess: async () => {
      toast.success('Telegram desvinculado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clavesAvisos.telegram }),
        queryClient.invalidateQueries({ queryKey: clavesAvisos.preferencias }),
      ]);
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  // Si la API no ofrece el endpoint (aún no existe) o falla, la tarjeta no se muestra.
  if (!estado.data) return null;
  const t = estado.data;

  let cuerpo: React.ReactNode;
  if (!t.disponible) {
    cuerpo = (
      <p className="text-sm text-tinta-2">
        El bot de Telegram no está configurado en este servidor
      </p>
    );
  } else if (!t.vinculado) {
    cuerpo = <Button onClick={() => setVinculando(true)}>Vincular Telegram</Button>;
  } else {
    cuerpo = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">
          Vinculado
          {t.telegram_usuario ? ` · @${t.telegram_usuario}` : ''}
          {t.vinculado_en ? ` · desde ${diaMes(t.vinculado_en)}` : ''}
        </p>
        {t.sesion_bot_activa ? null : (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md bg-alta-fondo p-3 text-sm text-alta"
          >
            <p>Los comandos del bot caducaron: envía /vincular con un código nuevo</p>
            <Button variant="outline" size="sm" onClick={() => setVinculando(true)}>
              Generar código
            </Button>
          </div>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={desvincular.isPending}>
              Desvincular
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Desvincular Telegram?</AlertDialogTitle>
              <AlertDialogDescription>
                Dejarás de recibir avisos por Telegram y el bot cerrará tu sesión
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => desvincular.mutate()}>
                Desvincular
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo-telegram"
      className="rounded-lg border border-borde bg-superficie p-4"
    >
      <h2 id="titulo-telegram" className="mb-3 text-lg font-semibold">
        Telegram
      </h2>
      {cuerpo}
      <DialogoVincular abierto={vinculando} yaVinculado={t.vinculado} alCambiar={setVinculando} />
    </section>
  );
}
