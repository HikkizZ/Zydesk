import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DepartamentoEntrada,
  jornadaSemanalHoras,
  type DepartamentoSalidaDatos,
  type HorarioDia,
} from '@zydesk/shared';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crearDepartamento, departamentos, eliminarDepartamento, guardarDepartamento } from './api';
import { FeriadosCard } from './FeriadosCard';
import { Tarjeta } from './Tarjeta';

// Lunes a domingo; `dia_semana` 0 = domingo.
const DIAS: Array<{ dia: number; nombre: string }> = [
  { dia: 1, nombre: 'Lunes' },
  { dia: 2, nombre: 'Martes' },
  { dia: 3, nombre: 'Miércoles' },
  { dia: 4, nombre: 'Jueves' },
  { dia: 5, nombre: 'Viernes' },
  { dia: 6, nombre: 'Sábado' },
  { dia: 0, nombre: 'Domingo' },
];

// Lo propone el front al crear (spec §7): L–V 08:30–18:00 con colación 13:00/60; S y D libres.
function horarioPorDefecto(): HorarioDia[] {
  return DIAS.map(({ dia }) => {
    const laboral = dia >= 1 && dia <= 5;
    return {
      dia_semana: dia,
      activo: laboral,
      entrada: laboral ? '08:30' : '09:00',
      salida: laboral ? '18:00' : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    };
  });
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

// Con horas a medio escribir (`''`) el motor no puede calcular: se muestra "—".
function horas(horario: HorarioDia[]): string {
  const total = jornadaSemanalHoras(horario);
  return Number.isFinite(total) ? `${formatoHoras.format(total)} h` : '—';
}

function EditorDepartamento({
  departamento,
  alGuardar,
  alEliminar,
}: {
  departamento: DepartamentoSalidaDatos | null;
  alGuardar: (id: number) => void;
  alEliminar: () => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(departamento?.nombre ?? '');
  const [extendida, setExtendida] = useState(departamento?.hora_extendida_desde ?? '19:00');
  const [capacidad, setCapacidad] = useState(String(departamento?.capacidad_tickets_pct ?? 80));
  const [horario, setHorario] = useState<HorarioDia[]>(
    departamento?.horario ?? horarioPorDefecto(),
  );
  const [error, setError] = useState<string | null>(null);

  const cambiarDia = (dia: number, cambios: Partial<HorarioDia>) =>
    setHorario((h) => h.map((d) => (d.dia_semana === dia ? { ...d, ...cambios } : d)));

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['departamentos'] });
    void queryClient.invalidateQueries({ queryKey: ['usuarios'] });
  };

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof DepartamentoEntrada.parse>) =>
      departamento ? guardarDepartamento(departamento.id, entrada) : crearDepartamento(entrada),
    onSuccess: async (guardado) => {
      toast.success('Guardado');
      await refrescar();
      alGuardar(guardado.id);
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
        setError('Ya existe un departamento con ese nombre');
      } else setError(mensajeDeError(err));
    },
  });

  const eliminar = useMutation({
    mutationFn: () => eliminarDepartamento((departamento as DepartamentoSalidaDatos).id),
    onSuccess: async () => {
      toast.success('Departamento eliminado');
      await refrescar();
      alEliminar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.detalles?.['motivo'] === 'con_personas') {
        toast.error('No se puede eliminar: tiene personas asignadas');
      } else toast.error(mensajeDeError(err));
    },
  });

  function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nombre.trim() === '') {
      setError('Escribe el nombre del departamento');
      return;
    }
    const resultado = DepartamentoEntrada.safeParse({
      nombre,
      hora_extendida_desde: extendida,
      capacidad_tickets_pct: Number(capacidad),
      horario,
    });
    if (!resultado.success) {
      const primero = resultado.error.issues[0];
      const enHorario = primero?.path[0] === 'horario';
      setError(
        enHorario
          ? 'Horario inválido: revisa entrada, colación y salida de los días activos'
          : primero?.path[0] === 'capacidad_tickets_pct'
            ? 'El tiempo disponible para tickets debe estar entre 0 y 100'
            : primero?.path[0] === 'hora_extendida_desde'
              ? 'Indica la hora desde la que rige el horario extendido'
              : 'Revisa los datos del departamento',
      );
      return;
    }
    guardar.mutate(resultado.data);
  }

  const tienePersonas = (departamento?.personas ?? 0) > 0;
  const botonEliminar = (
    <Button type="button" variant="outline" disabled={tienePersonas || eliminar.isPending}>
      Eliminar
    </Button>
  );

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="dep-nombre">Nombre</Label>
        <Input id="dep-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Día</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead>Colación inicio</TableHead>
              <TableHead>Colación (min)</TableHead>
              <TableHead>Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIAS.map(({ dia, nombre: nombreDia }) => {
              const d = horario.find((x) => x.dia_semana === dia) as HorarioDia;
              const campo = 'w-28';
              return (
                <TableRow key={dia}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={d.activo}
                        onCheckedChange={(activo) => cambiarDia(dia, { activo })}
                        aria-label={`${nombreDia} activo`}
                      />
                      <span className={cn(!d.activo && 'text-tinta-2')}>{nombreDia}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="time"
                      className={campo}
                      disabled={!d.activo}
                      value={d.entrada}
                      aria-label={`Entrada ${nombreDia}`}
                      onChange={(e) => cambiarDia(dia, { entrada: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="time"
                      className={campo}
                      disabled={!d.activo}
                      value={d.salida}
                      aria-label={`Salida ${nombreDia}`}
                      onChange={(e) => cambiarDia(dia, { salida: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="time"
                      className={campo}
                      disabled={!d.activo}
                      value={d.colacion_inicio}
                      aria-label={`Colación inicio ${nombreDia}`}
                      onChange={(e) => cambiarDia(dia, { colacion_inicio: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={240}
                      className="w-20"
                      disabled={!d.activo}
                      value={d.colacion_min}
                      aria-label={`Colación (min) ${nombreDia}`}
                      onChange={(e) => cambiarDia(dia, { colacion_min: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {d.activo ? horas([d]) : 'Libre'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="font-medium">Jornada semanal calculada: {horas(horario)}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dep-extendida">Horario extendido desde</Label>
          <Input
            id="dep-extendida"
            type="time"
            className="w-32"
            value={extendida}
            aria-describedby="dep-extendida-ayuda"
            onChange={(e) => setExtendida(e.target.value)}
          />
          <p id="dep-extendida-ayuda" className="text-sm text-tinta-2">
            Aplica la tarifa de horario extendido
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dep-capacidad">Tiempo disponible para tickets (%)</Label>
          <Input
            id="dep-capacidad"
            type="number"
            min={0}
            max={100}
            className="w-24"
            value={capacidad}
            aria-describedby="dep-capacidad-ayuda"
            onChange={(e) => setCapacidad(e.target.value)}
          />
          <p id="dep-capacidad-ayuda" className="text-sm text-tinta-2">
            El resto se reserva para reuniones y trabajo interno
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-urgente">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {departamento ? (
          tienePersonas ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{botonEliminar}</span>
              </TooltipTrigger>
              <TooltipContent>Tiene personas asignadas</TooltipContent>
            </Tooltip>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>{botonEliminar}</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {departamento.nombre}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran también su horario y sus feriados propios.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => eliminar.mutate()}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        ) : null}
      </div>
    </form>
  );
}

const NUEVO = 'nuevo';

export function DepartamentosTab() {
  const [seleccion, setSeleccion] = useState<number | typeof NUEVO | null>(null);
  const consulta = useQuery({ queryKey: ['departamentos'], queryFn: departamentos });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  }

  const lista = consulta.data;
  const actual =
    seleccion === NUEVO ? null : (lista.find((d) => d.id === seleccion) ?? lista[0] ?? null);
  const creando = seleccion === NUEVO || actual === null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Button onClick={() => setSeleccion(NUEVO)}>+ Nuevo departamento</Button>
          {lista.length === 0 ? (
            <EstadoVacio titulo="Aún no hay departamentos" />
          ) : (
            lista.map((d) => {
              const elegido = !creando && actual?.id === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setSeleccion(d.id)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg border bg-superficie p-4 text-left',
                    elegido ? 'border-2 border-tinta' : 'border-borde',
                  )}
                >
                  <span className="font-semibold">{d.nombre}</span>
                  <span className="text-sm text-tinta-2">
                    {d.personas} {d.personas === 1 ? 'persona' : 'personas'} ·{' '}
                    {formatoHoras.format(d.jornada_semanal_horas)} h por semana
                  </span>
                </button>
              );
            })
          )}
        </div>

        <Tarjeta titulo={creando ? 'Nuevo departamento' : actual.nombre}>
          <EditorDepartamento
            key={creando ? NUEVO : actual.id}
            departamento={creando ? null : actual}
            alGuardar={(id) => setSeleccion(id)}
            alEliminar={() => setSeleccion(null)}
          />
        </Tarjeta>
      </div>

      {creando ? null : <FeriadosCard departamento={actual} />}

      <p className="text-sm text-tinta-2">
        Este horario se usa para contar los plazos en horas hábiles, calcular la carga de cada
        persona y marcar como extendidas las horas registradas fuera de jornada.
      </p>
    </div>
  );
}
