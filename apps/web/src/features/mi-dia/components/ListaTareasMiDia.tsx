import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CasillaTactil } from '@/components/dominio/CasillaTactil';
import { Codigo } from '@/components/dominio/Codigo';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { usePermiso } from '@/features/auth/SesionProvider';
import { editarTarea } from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { clavesMiDia, type MiDiaDatos, type TareaMiDiaDatos } from '../api';

const mensajeError = (err: unknown) =>
  err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.';

// Marcar una tarea es optimista: queda tachada al instante y la lista se refresca al terminar.
export function ListaTareasMiDia({ tareas }: { tareas: TareaMiDiaDatos[] }) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');

  const marcar = useMutation({
    mutationFn: (t: TareaMiDiaDatos) => editarTarea(t.id, { hecha: true }),
    onMutate: async (t) => {
      await queryClient.cancelQueries({ queryKey: clavesMiDia.miDia });
      const previo = queryClient.getQueryData<MiDiaDatos>(clavesMiDia.miDia);
      if (previo) {
        queryClient.setQueryData<MiDiaDatos>(clavesMiDia.miDia, {
          ...previo,
          tareas: previo.tareas.map((x) => (x.id === t.id ? { ...x, hecha: true } : x)),
        });
      }
      return { previo };
    },
    onError: (err, _t, contexto) => {
      if (contexto?.previo) queryClient.setQueryData(clavesMiDia.miDia, contexto.previo);
      toast.error(mensajeError(err));
    },
    onSettled: async (_r, _e, t) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clavesMiDia.miDia }),
        queryClient.invalidateQueries({ queryKey: [t.destino.tipo, t.destino.id] }),
      ]);
    },
  });

  return (
    <ul className="flex flex-col">
      {tareas.map((t) => (
        <li
          key={t.id}
          className="flex min-h-14 items-center gap-1 border-b py-1.5 last:border-b-0 lg:min-h-11"
        >
          <CasillaTactil
            id={`tarea-mi-dia-${t.id}`}
            checked={t.hecha}
            disabled={!puedeEditar || t.hecha}
            aria-label={`Tarea hecha: ${t.titulo}`}
            onCheckedChange={() => marcar.mutate(t)}
          />
          <span className={cn('min-w-0 flex-1 text-sm', t.hecha && 'text-tinta-3 line-through')}>
            {t.titulo}
          </span>
          <Codigo className="text-xs text-tinta-2">{t.destino.codigo}</Codigo>
          {t.fecha ? (
            <span
              className={cn('text-sm', t.vencida ? 'font-semibold text-urgente' : 'text-tinta-2')}
            >
              {diaMesDeFecha(t.fecha)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
