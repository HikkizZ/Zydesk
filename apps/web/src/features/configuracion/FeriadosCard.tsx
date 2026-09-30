import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FeriadoEntrada, type DepartamentoSalidaDatos } from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Pill } from '@/components/dominio/Pill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorApi } from '@/lib/api';
import { crearFeriado, eliminarFeriado, feriados } from './api';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

const formatoFecha = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

// `fecha` es AAAA-MM-DD sin hora: se formatea en UTC para que la zona del navegador no la corra.
const fechaLegible = (fecha: string) => formatoFecha.format(new Date(`${fecha}T00:00:00Z`));

function DialogoFeriado({
  departamento,
  anio,
  alCerrar,
}: {
  departamento: DepartamentoSalidaDatos;
  anio: number;
  alCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(`${anio}-01-01`);
  const [nombre, setNombre] = useState('');
  const [soloEste, setSoloEste] = useState(false);
  const [errores, setErrores] = useState<{ fecha?: string; nombre?: string; general?: string }>({});

  const crear = useMutation({
    mutationFn: crearFeriado,
    onSuccess: async () => {
      toast.success('Feriado agregado');
      await queryClient.invalidateQueries({ queryKey: ['feriados'] });
      alCerrar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
        setErrores({ fecha: 'Ya existe un feriado en esa fecha' });
      } else setErrores({ general: mensajeDeError(err) });
    },
  });

  function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    const nuevos: typeof errores = {};
    if (!fecha) nuevos.fecha = 'Elige la fecha';
    if (nombre.trim() === '') nuevos.nombre = 'Escribe el nombre del feriado';
    setErrores(nuevos);
    if (nuevos.fecha || nuevos.nombre) return;
    const entrada = FeriadoEntrada.safeParse({
      fecha,
      nombre,
      departamento_id: soloEste ? departamento.id : null,
    });
    if (!entrada.success) {
      setErrores({ general: 'Revisa la fecha y el nombre (máximo 80 caracteres)' });
      return;
    }
    crear.mutate(entrada.data);
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar feriado</DialogTitle>
          <DialogDescription>Por defecto rige para todos los departamentos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
          <Campo etiqueta="Fecha" error={errores.fecha}>
            {(p) => (
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} {...p} />
            )}
          </Campo>
          <Campo etiqueta="Nombre" error={errores.nombre}>
            {(p) => <Input value={nombre} onChange={(e) => setNombre(e.target.value)} {...p} />}
          </Campo>
          <div className="flex items-center gap-2">
            <Checkbox
              id="feriado-solo-este"
              checked={soloEste}
              onCheckedChange={(v) => setSoloEste(v === true)}
            />
            <Label htmlFor="feriado-solo-este">Solo para este departamento</Label>
          </div>
          {errores.general ? (
            <p role="alert" className="text-sm text-urgente">
              {errores.general}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? 'Guardando…' : 'Agregar feriado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FeriadosCard({ departamento }: { departamento: DepartamentoSalidaDatos }) {
  const queryClient = useQueryClient();
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [agregando, setAgregando] = useState(false);

  const consulta = useQuery({
    queryKey: ['feriados', anio, departamento.id],
    queryFn: () => feriados(anio, departamento.id),
  });

  const quitar = useMutation({
    mutationFn: eliminarFeriado,
    onSuccess: async () => {
      toast.success('Feriado quitado');
      await queryClient.invalidateQueries({ queryKey: ['feriados'] });
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  const anios = [anioActual - 1, anioActual, anioActual + 1, anioActual + 2];

  let contenido;
  if (consulta.isPending) contenido = <Cargando />;
  else if (consulta.isError) {
    contenido = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.length === 0) {
    contenido = <EstadoVacio titulo={`Sin feriados en ${anio}`} />;
  } else {
    contenido = (
      <ul className="divide-y divide-borde">
        {consulta.data.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="w-28 shrink-0 text-tinta-2">{fechaLegible(f.fecha)}</span>
            <span className="min-w-0 flex-1">{f.nombre}</span>
            <Pill tono={f.departamento_id === null ? 'neutro' : 'acento'}>
              {f.departamento_id === null ? 'General' : 'Solo este departamento'}
            </Pill>
            <Button
              variant="ghost"
              size="sm"
              disabled={quitar.isPending}
              aria-label={`Quitar ${f.nombre}`}
              onClick={() => quitar.mutate(f.id)}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Tarjeta
      titulo="Feriados"
      acciones={
        <div className="flex flex-wrap items-center gap-3">
          <Seleccion
            etiqueta="Año"
            className="w-28"
            valor={String(anio)}
            alCambiar={(v) => setAnio(Number(v))}
            opciones={anios.map((a) => ({ valor: String(a), etiqueta: String(a) }))}
          />
          <Button variant="outline" onClick={() => setAgregando(true)}>
            + Agregar feriado
          </Button>
        </div>
      }
    >
      {contenido}
      {agregando ? (
        <DialogoFeriado
          departamento={departamento}
          anio={anio}
          alCerrar={() => setAgregando(false)}
        />
      ) : null}
    </Tarjeta>
  );
}
