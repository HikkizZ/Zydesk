import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/dominio/Avatar';
import { CasillaTactil } from '@/components/dominio/CasillaTactil';
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
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { usePermiso } from '@/features/auth/SesionProvider';
import { crearTareaOt, invalidarOt } from '@/features/ots/api';
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

export interface DestinoTareas {
  tipo: 'ticket' | 'ot';
  id: number;
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

// Horas válidas: vacío (sin horas) o múltiplo de 0,25 entre 0 y 999.
const horasValidas = (texto: string) => {
  if (texto.trim() === '') return true;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 && n <= 999 && Number.isInteger(n * 4);
};

// Input de horas de una tarea de OT: guarda con `PATCH` al perder el foco si el valor cambió.
function CampoHoras({
  etiqueta,
  valor,
  disabled,
  onGuardar,
}: {
  etiqueta: string;
  valor: number | null;
  disabled: boolean;
  onGuardar: (horas: number | null) => void;
}) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));
  // Si el valor guardado cambia desde fuera (refetch), el campo lo sigue.
  const [valorPrevio, setValorPrevio] = useState(valor);
  if (valor !== valorPrevio) {
    setValorPrevio(valor);
    setTexto(valor === null ? '' : String(valor));
  }
  const valido = horasValidas(texto);
  return (
    <Input
      type="number"
      step={0.25}
      min={0}
      max={999}
      inputMode="decimal"
      aria-label={etiqueta}
      aria-invalid={!valido}
      disabled={disabled}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (!valido) {
          setTexto(valor === null ? '' : String(valor));
          return;
        }
        const nuevo = texto.trim() === '' ? null : Number(texto);
        if (nuevo !== valor) onGuardar(nuevo);
      }}
      className="h-11 w-20 px-2 text-right font-mono lg:h-9 lg:w-[72px]"
    />
  );
}

// Tareas de un ticket o de una OT: progreso, marcar, quitar (con confirmación) y alta al pie. Con
// `cerrado` no se puede agregar, quitar ni editar horas, pero sí marcar (spec fase 2 §6.2, fase 3 §6.1).
// `conHoras` (OT) agrega las columnas "Est." y "Real". `ticketId` es la forma anterior de `destino`.
export function ListaTareas({
  destino: destinoProp,
  ticketId,
  tareas,
  cerrado,
  conHoras = false,
}: {
  destino?: DestinoTareas;
  ticketId?: number;
  tareas: TareaDatos[];
  cerrado: boolean;
  conHoras?: boolean;
}) {
  const destino: DestinoTareas = destinoProp ?? { tipo: 'ticket', id: ticketId ?? 0 };
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const [titulo, setTitulo] = useState('');
  const [responsable, setResponsable] = useState<number | null>(null);
  const [fecha, setFecha] = useState('');
  const [horasAlta, setHorasAlta] = useState('');
  const [porQuitar, setPorQuitar] = useState<TareaDatos | null>(null);

  const hechas = tareas.filter((t) => t.hecha).length;
  const porcentaje = tareas.length === 0 ? 0 : Math.round((hechas / tareas.length) * 100);

  const estimadas = tareas.reduce((suma, t) => suma + (t.horas_estimadas ?? 0), 0);
  const reales = tareas.reduce((suma, t) => suma + (t.horas_reales ?? 0), 0);

  const alCambiar = () =>
    destino.tipo === 'ot'
      ? invalidarOt(queryClient, destino.id)
      : invalidarTicket(queryClient, destino.id);
  const marcar = useMutation({
    mutationFn: (t: TareaDatos) => editarTarea(t.id, { hecha: !t.hecha }),
    onSuccess: alCambiar,
    onError: (err) => toast.error(mensajeError(err)),
  });
  const guardarHoras = useMutation({
    mutationFn: ({
      tarea,
      campo,
      horas,
    }: {
      tarea: TareaDatos;
      campo: 'horas_estimadas' | 'horas_reales';
      horas: number | null;
    }) => editarTarea(tarea.id, { [campo]: horas }),
    onSuccess: alCambiar,
    onError: (err) => {
      toast.error(mensajeError(err));
      void alCambiar();
    },
  });
  const agregar = useMutation({
    mutationFn: () => {
      const base = {
        titulo: titulo.trim(),
        responsable_id: responsable,
        fecha: fecha === '' ? null : fecha,
      };
      return destino.tipo === 'ot'
        ? crearTareaOt(destino.id, {
            ...base,
            horas_estimadas: horasAlta.trim() === '' ? null : Number(horasAlta),
          })
        : crearTarea(destino.id, base);
    },
    onSuccess: async () => {
      setTitulo('');
      setResponsable(null);
      setFecha('');
      setHorasAlta('');
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
    if (titulo.trim() !== '' && horasValidas(horasAlta) && !agregar.isPending) agregar.mutate();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-titulo text-base font-semibold">
          Tareas · {hechas}/{tareas.length}
          {conHoras
            ? ` · ${formatoHoras.format(estimadas)} h estimadas · ${formatoHoras.format(reales)} h reales`
            : ''}
        </h3>
        <Progress
          value={porcentaje}
          aria-label="Progreso de tareas"
          className="h-1.5 max-w-40 flex-1"
        />
      </div>

      {tareas.length === 0 ? <p className="text-sm text-tinta-2">Sin tareas</p> : null}
      {conHoras && tareas.length > 0 ? (
        <p
          aria-hidden="true"
          className="hidden justify-end gap-1.5 pr-11 text-xs font-semibold text-tinta-2 uppercase sm:flex"
        >
          <span className="w-20 text-right lg:w-[72px]">Est.</span>
          <span className="w-20 text-right lg:w-[72px]">Real</span>
          <span className="w-12 text-right">Reg.</span>
        </p>
      ) : null}
      <ul className="flex flex-col">
        {tareas.map((t) => (
          <li
            key={t.id}
            className={cn(
              'flex min-h-11 items-center gap-3 border-b py-1.5 last:border-b-0',
              conHoras && 'flex-wrap sm:flex-nowrap',
            )}
          >
            <CasillaTactil
              id={`tarea-${t.id}`}
              checked={t.hecha}
              disabled={!puedeEditar || marcar.isPending}
              aria-label={`Tarea hecha: ${t.titulo}`}
              onCheckedChange={() => marcar.mutate(t)}
            />
            <span
              className={cn(
                'min-w-0 flex-1 text-sm',
                conHoras && 'basis-32',
                t.hecha && 'text-tinta-3 line-through',
              )}
            >
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
            {conHoras ? (
              <span className="flex items-center gap-1 sm:gap-1.5">
                <span aria-hidden="true" className="text-xs text-tinta-2 sm:hidden">
                  Est.
                </span>
                <CampoHoras
                  etiqueta={`Horas estimadas de ${t.titulo}`}
                  valor={t.horas_estimadas}
                  disabled={!puedeEditar || cerrado}
                  onGuardar={(horas) =>
                    guardarHoras.mutate({ tarea: t, campo: 'horas_estimadas', horas })
                  }
                />
                <span aria-hidden="true" className="text-xs text-tinta-2 sm:hidden">
                  Real
                </span>
                <CampoHoras
                  etiqueta={`Horas reales de ${t.titulo}`}
                  valor={t.horas_reales}
                  disabled={!puedeEditar || cerrado}
                  onGuardar={(horas) =>
                    guardarHoras.mutate({ tarea: t, campo: 'horas_reales', horas })
                  }
                />
                <span aria-hidden="true" className="text-xs text-tinta-2 sm:hidden">
                  Reg.
                </span>
                <span
                  role="img"
                  aria-label={`${formatoHoras.format(t.horas_estimadas ?? 0)} h estimadas, ${formatoHoras.format(t.horas_reales ?? 0)} h reales, ${formatoHoras.format(t.horas_registradas)} h registradas`}
                  className="w-12 text-right font-mono text-sm"
                >
                  {formatoHoras.format(t.horas_registradas)}
                </span>
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
            className="w-full min-w-48 flex-1"
          />
          <div className="w-full sm:w-44">
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
            className="w-full sm:w-40"
          />
          {conHoras ? (
            <Input
              type="number"
              step={0.25}
              min={0}
              max={999}
              inputMode="decimal"
              aria-label="Horas est."
              placeholder="Horas est."
              aria-invalid={!horasValidas(horasAlta)}
              value={horasAlta}
              onChange={(e) => setHorasAlta(e.target.value)}
              className="w-full font-mono sm:w-28"
            />
          ) : null}
          <Button
            type="submit"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={titulo.trim() === '' || !horasValidas(horasAlta) || agregar.isPending}
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
