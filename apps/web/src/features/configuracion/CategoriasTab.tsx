import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CategoriaEntrada,
  ETIQUETA_PRIORIDAD,
  PRIORIDADES,
  UNIDADES_PLAZO,
  type CategoriaSalidaDatos,
  type Prioridad,
  type UnidadPlazo,
} from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Pill } from '@/components/dominio/Pill';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import {
  calcularPlazo,
  categorias,
  crearCategoria,
  desactivarCategoria,
  guardarCategoria,
  reactivarCategoria,
  usuarios,
} from './api';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

interface PlazoForm {
  valor: string;
  unidad: UnidadPlazo;
}

interface PlazoDatos {
  valor: number;
  unidad: UnidadPlazo;
}

export function textoPlazo({ valor, unidad }: PlazoDatos): string {
  if (unidad === 'horas') return `${valor} ${valor === 1 ? 'hora hábil' : 'horas hábiles'}`;
  return `${valor} ${valor === 1 ? 'día hábil' : 'días hábiles'}`;
}

const ETIQUETA_UNIDAD: Record<UnidadPlazo, string> = { horas: 'Horas', dias: 'Días' };
const SIN_RESPONSABLE = 'ninguno';

const aForm = (p: PlazoDatos): PlazoForm => ({ valor: String(p.valor), unidad: p.unidad });
const aDatos = (p: PlazoForm): PlazoDatos => ({ valor: Number(p.valor), unidad: p.unidad });

function CampoPlazo({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: PlazoForm;
  alCambiar: (valor: PlazoForm) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      {(p) => (
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={999}
            className="w-24"
            {...p}
            value={valor.valor}
            onChange={(e) => alCambiar({ ...valor, valor: e.target.value })}
          />
          <Seleccion
            etiqueta={`Unidad de ${etiqueta}`}
            className="w-28"
            valor={valor.unidad}
            alCambiar={(unidad) => alCambiar({ ...valor, unidad: unidad as UnidadPlazo })}
            opciones={UNIDADES_PLAZO.map((u) => ({ valor: u, etiqueta: ETIQUETA_UNIDAD[u] }))}
          />
        </div>
      )}
    </Campo>
  );
}

function VistaPrevia({
  plazo,
  departamentoId,
}: {
  plazo: PlazoForm;
  departamentoId: number | null;
}) {
  // el instante "ahora" se fija al abrir el diálogo para no recalcular en cada tecla
  const [desde] = useState(() => new Date().toISOString());
  const datos = aDatos(plazo);
  const valido = Number.isInteger(datos.valor) && datos.valor >= 1 && datos.valor <= 999;
  const consulta = useQuery({
    queryKey: ['plazo-previa', departamentoId, datos.valor, datos.unidad],
    queryFn: () =>
      calcularPlazo({ desde, plazo: datos, departamento_id: departamentoId as number }),
    enabled: departamentoId !== null && valido,
  });

  let texto: string;
  if (departamentoId === null) {
    texto = 'Elige un responsable con departamento para ver cuándo vencería un ticket.';
  } else if (!valido) {
    texto = 'Indica un plazo de resolución válido para la vista previa.';
  } else if (consulta.isPending) texto = 'Calculando…';
  else if (consulta.isError) texto = 'No se pudo calcular la vista previa.';
  else {
    texto = `Si un ticket Alta entra ahora, vencería el ${formatearFechaHora(consulta.data.hasta)}.`;
  }
  return (
    <p role="status" className="rounded-md bg-superficie-suave px-3 py-2 text-sm">
      {texto}
    </p>
  );
}

function FormularioCategoria({
  categoria,
  alCerrar,
}: {
  categoria: CategoriaSalidaDatos | null;
  alCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [responsable, setResponsable] = useState(
    String(categoria?.responsable_defecto_id ?? SIN_RESPONSABLE),
  );
  const [respuesta, setRespuesta] = useState<PlazoForm>(
    categoria ? aForm(categoria.plazo_respuesta) : { valor: '2', unidad: 'horas' },
  );
  const [resolucion, setResolucion] = useState<Record<Prioridad, PlazoForm>>({
    urgente: categoria
      ? aForm(categoria.plazo_resolucion.urgente)
      : { valor: '4', unidad: 'horas' },
    alta: categoria ? aForm(categoria.plazo_resolucion.alta) : { valor: '1', unidad: 'dias' },
    media: categoria ? aForm(categoria.plazo_resolucion.media) : { valor: '3', unidad: 'dias' },
    baja: categoria ? aForm(categoria.plazo_resolucion.baja) : { valor: '5', unidad: 'dias' },
  });
  const [errores, setErrores] = useState<{ nombre?: string; general?: string }>({});

  const personas = useQuery({
    queryKey: ['usuarios', { activo: 'true' }],
    queryFn: () => usuarios({ activo: 'true' }),
  });
  const departamentoDelResponsable =
    personas.data?.find((u) => String(u.id) === responsable)?.departamento_id ?? null;

  const guardar = useMutation({
    mutationFn: (entrada: ReturnType<typeof CategoriaEntrada.parse>) =>
      categoria ? guardarCategoria(categoria.id, entrada) : crearCategoria(entrada),
    onSuccess: async () => {
      toast.success('Guardado');
      await queryClient.invalidateQueries({ queryKey: ['categorias'] });
      alCerrar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
        setErrores({ nombre: 'Ya existe una categoría con ese nombre' });
      } else setErrores({ general: mensajeDeError(err) });
    },
  });

  function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (nombre.trim() === '') {
      setErrores({ nombre: 'Escribe el nombre de la categoría' });
      return;
    }
    const entrada = CategoriaEntrada.safeParse({
      nombre,
      responsable_defecto_id: responsable === SIN_RESPONSABLE ? null : Number(responsable),
      plazo_respuesta: aDatos(respuesta),
      plazo_resolucion: {
        urgente: aDatos(resolucion.urgente),
        alta: aDatos(resolucion.alta),
        media: aDatos(resolucion.media),
        baja: aDatos(resolucion.baja),
      },
    });
    if (!entrada.success) {
      setErrores({ general: 'Cada plazo debe ser un número entero entre 1 y 999' });
      return;
    }
    setErrores({});
    guardar.mutate(entrada.data);
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Editar categoría' : 'Agregar categoría'}</DialogTitle>
          <DialogDescription>
            Los plazos se cuentan en horas o días hábiles del departamento de la persona
            responsable.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
          <Campo etiqueta="Nombre" error={errores.nombre}>
            {(p) => <Input value={nombre} onChange={(e) => setNombre(e.target.value)} {...p} />}
          </Campo>
          <Campo etiqueta="Responsable por defecto">
            {(p) => (
              <Seleccion
                id={p.id}
                valor={responsable}
                alCambiar={setResponsable}
                opciones={[
                  { valor: SIN_RESPONSABLE, etiqueta: 'Sin responsable' },
                  ...(personas.data ?? []).map((u) => ({
                    valor: String(u.id),
                    etiqueta: u.nombre,
                  })),
                ]}
              />
            )}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoPlazo etiqueta="Primera respuesta" valor={respuesta} alCambiar={setRespuesta} />
            {PRIORIDADES.map((prioridad) => (
              <CampoPlazo
                key={prioridad}
                etiqueta={`Resolución ${ETIQUETA_PRIORIDAD[prioridad]}`}
                valor={resolucion[prioridad]}
                alCambiar={(v) => setResolucion((r) => ({ ...r, [prioridad]: v }))}
              />
            ))}
          </div>
          <VistaPrevia plazo={resolucion.alta} departamentoId={departamentoDelResponsable} />
          {errores.general ? (
            <p role="alert" className="text-sm text-urgente">
              {errores.general}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriasTab() {
  const queryClient = useQueryClient();
  const [inactivas, setInactivas] = useState(false);
  const [dialogo, setDialogo] = useState<{ categoria: CategoriaSalidaDatos | null } | null>(null);

  const filtro = inactivas ? undefined : ('true' as const);
  const consulta = useQuery({
    queryKey: ['categorias', { activo: filtro }],
    queryFn: () => categorias(filtro),
  });

  const alternar = useMutation({
    mutationFn: (c: CategoriaSalidaDatos) =>
      c.activo ? desactivarCategoria(c.id) : reactivarCategoria(c.id),
    onSuccess: async (c) => {
      toast.success(c.activo ? 'Categoría reactivada' : 'Categoría desactivada');
      await queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  let contenido;
  if (consulta.isPending) contenido = <Cargando />;
  else if (consulta.isError) {
    contenido = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.length === 0) {
    contenido = (
      <EstadoVacio
        titulo="Aún no hay categorías"
        accion={
          <Button onClick={() => setDialogo({ categoria: null })}>+ Agregar categoría</Button>
        }
      />
    );
  } else {
    contenido = (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead>Responsable por defecto</TableHead>
              <TableHead>Primera respuesta</TableHead>
              {PRIORIDADES.map((p) => (
                <TableHead key={p}>Resolución {ETIQUETA_PRIORIDAD[p]}</TableHead>
              ))}
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.nombre}
                    {c.activo ? null : <Pill tono="neutro">Inactiva</Pill>}
                  </div>
                </TableCell>
                <TableCell>{c.responsable_defecto?.nombre ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{textoPlazo(c.plazo_respuesta)}</TableCell>
                {PRIORIDADES.map((p) => (
                  <TableCell key={p} className="whitespace-nowrap">
                    {textoPlazo(c.plazo_resolucion[p])}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${c.nombre}`}
                      onClick={() => setDialogo({ categoria: c })}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${c.activo ? 'Desactivar' : 'Reactivar'} ${c.nombre}`}
                      disabled={alternar.isPending}
                      onClick={() => alternar.mutate(c)}
                    >
                      {c.activo ? 'Desactivar' : 'Reactivar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Tarjeta
      titulo="Categorías y plazos"
      acciones={
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="ver-inactivas" checked={inactivas} onCheckedChange={setInactivas} />
            <Label htmlFor="ver-inactivas">Mostrar inactivas</Label>
          </div>
          <Button onClick={() => setDialogo({ categoria: null })}>+ Agregar categoría</Button>
        </div>
      }
    >
      {contenido}
      {dialogo ? (
        <FormularioCategoria categoria={dialogo.categoria} alCerrar={() => setDialogo(null)} />
      ) : null}
    </Tarjeta>
  );
}
