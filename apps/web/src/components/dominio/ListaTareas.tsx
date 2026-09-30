import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/dominio/Avatar';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { SelectorPersonas } from '@/components/dominio/SelectorPersonas';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { usePermiso } from '@/features/auth/SesionProvider';
import {
  crearTarea,
  editarTarea,
  invalidarTicket,
  quitarTarea,
  type TareaDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const mensajeError = (err: unknown) =>
  err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.';

// Tareas del ticket: progreso, marcar, quitar (con confirmación) y alta al pie. Con `cerrado` no se
// puede agregar ni quitar, pero sí marcar (spec fase 2 §6.2).
export function ListaTareas({
  ticketId,
  tareas,
  cerrado,
}: {
  ticketId: number;
  tareas: TareaDatos[];
  cerrado: boolean;
}) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const [titulo, setTitulo] = useState('');
  const [responsable, setResponsable] = useState<number | null>(null);
  const [fecha, setFecha] = useState('');
  const [porQuitar, setPorQuitar] = useState<TareaDatos | null>(null);

  const hechas = tareas.filter((t) => t.hecha).length;
  const porcentaje = tareas.length === 0 ? 0 : Math.round((hechas / tareas.length) * 100);

  const alCambiar = () => invalidarTicket(queryClient, ticketId);
  const marcar = useMutation({
    mutationFn: (t: TareaDatos) => editarTarea(t.id, { hecha: !t.hecha }),
    onSuccess: alCambiar,
    onError: (err) => toast.error(mensajeError(err)),
  });
  const agregar = useMutation({
    mutationFn: () =>
      crearTarea(ticketId, {
        titulo: titulo.trim(),
        responsable_id: responsable,
        fecha: fecha === '' ? null : fecha,
      }),
    onSuccess: async () => {
      setTitulo('');
      setResponsable(null);
      setFecha('');
      await alCambiar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });
  const quitar = useMutation({
    mutationFn: (t: TareaDatos) => quitarTarea(t.id),
    onSuccess: async () => {
      setPorQuitar(null);
      await alCambiar();
    },
    onError: (err) => {
      setPorQuitar(null);
      toast.error(mensajeError(err));
    },
  });

  const enviarAlta = (e: FormEvent) => {
    e.preventDefault();
    if (titulo.trim() !== '' && !agregar.isPending) agregar.mutate();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-titulo text-base font-semibold">
          Tareas · {hechas}/{tareas.length}
        </h3>
        <Progress
          value={porcentaje}
          aria-label="Progreso de tareas"
          className="h-1.5 max-w-40 flex-1"
        />
      </div>

      {tareas.length === 0 ? <p className="text-sm text-tinta-2">Sin tareas</p> : null}
      <ul className="flex flex-col">
        {tareas.map((t) => (
          <li
            key={t.id}
            className="flex min-h-11 items-center gap-3 border-b py-1.5 last:border-b-0"
          >
            <Checkbox
              checked={t.hecha}
              disabled={!puedeEditar || marcar.isPending}
              aria-label={`Tarea hecha: ${t.titulo}`}
              onCheckedChange={() => marcar.mutate(t)}
              className="size-5"
            />
            <span className={cn('flex-1 text-sm', t.hecha && 'text-tinta-3 line-through')}>
              {t.titulo}
            </span>
            {t.responsable ? (
              <span title={t.responsable.nombre}>
                <Avatar
                  iniciales={t.responsable.iniciales}
                  color={t.responsable.color_avatar}
                  className="size-6 text-[9px]"
                />
                <span className="sr-only">{t.responsable.nombre}</span>
              </span>
            ) : null}
            {t.fecha ? (
              <span
                className={cn('text-sm', t.vencida ? 'font-semibold text-urgente' : 'text-tinta-2')}
              >
                {diaMesDeFecha(t.fecha)}
              </span>
            ) : null}
            {puedeEditar && !cerrado ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar tarea: ${t.titulo}`}
                onClick={() => setPorQuitar(t)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {puedeEditar && !cerrado ? (
        <form onSubmit={enviarAlta} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Nueva tarea"
            placeholder="Nueva tarea"
            value={titulo}
            maxLength={200}
            onChange={(e) => setTitulo(e.target.value)}
            className="min-w-48 flex-1"
          />
          <div className="w-44">
            <SelectorPersonas
              etiqueta="Responsable de la tarea"
              placeholder="Responsable"
              valor={responsable}
              onChange={setResponsable}
            />
          </div>
          <Input
            type="date"
            aria-label="Fecha de la tarea"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-40"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={titulo.trim() === '' || agregar.isPending}
          >
            Agregar
          </Button>
        </form>
      ) : null}

      <AlertDialog
        open={porQuitar !== null}
        onOpenChange={(abierto) => !abierto && setPorQuitar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar la tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              «{porQuitar?.titulo}» se quitará de la lista y quedará registrado en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (porQuitar) quitar.mutate(porQuitar);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
