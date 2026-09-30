import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_PRIORIDAD,
  PRIORIDADES,
  TicketEditarEntrada,
  type OrigenTicket,
  type Prioridad,
} from '@zydesk/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { isoALocalSantiago, localSantiagoAIso } from '@/components/dominio/formato-fecha';
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
import { Textarea } from '@/components/ui/textarea';
import { categorias } from '@/features/configuracion/api';
import { Seleccion } from '@/features/configuracion/Seleccion';
import {
  editarTicket,
  invalidarTicket,
  type TicketDatos,
  type TicketEditarEntradaDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { erroresDeApi, mensajeDeCampo, nuloSiVacio } from './formulario';
import { SelectorCliente } from './SelectorCliente';

interface Valores {
  asunto: string;
  descripcion: string;
  cliente_id: number | null;
  origen: OrigenTicket;
  solicitante_nombre: string;
  solicitante_correo: string;
  prioridad: Prioridad;
  categoria_id: number | null;
  inicio_planificado: string;
  fecha_limite: string;
  horas_estimadas: string;
}

const inicial = (t: TicketDatos): Valores => ({
  asunto: t.asunto,
  descripcion: t.descripcion ?? '',
  cliente_id: t.cliente_id,
  origen: t.origen,
  solicitante_nombre: t.solicitante_nombre ?? '',
  solicitante_correo: t.solicitante_correo ?? '',
  prioridad: t.prioridad,
  categoria_id: t.categoria_id,
  inicio_planificado: t.inicio_planificado ? isoALocalSantiago(t.inicio_planificado) : '',
  fecha_limite: t.fecha_limite ? isoALocalSantiago(t.fecha_limite) : '',
  horas_estimadas: t.horas_estimadas === null ? '' : String(t.horas_estimadas),
});

const mismoInstante = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

// Solo viajan los campos que cambiaron: cada uno deja su propio evento en el historial.
function cambios(t: TicketDatos, v: Valores): Record<string, unknown> {
  const horas =
    v.horas_estimadas.trim() === '' ? null : Number(v.horas_estimadas.replace(',', '.'));
  const inicio = v.inicio_planificado ? localSantiagoAIso(v.inicio_planificado) : null;
  const limite = v.fecha_limite ? localSantiagoAIso(v.fecha_limite) : null;
  const salida: Record<string, unknown> = {};
  if (v.asunto.trim() !== t.asunto) salida['asunto'] = v.asunto;
  if (nuloSiVacio(v.descripcion) !== (t.descripcion?.trim() || null)) {
    salida['descripcion'] = nuloSiVacio(v.descripcion);
  }
  if (v.cliente_id !== t.cliente_id) salida['cliente_id'] = v.cliente_id;
  if (v.origen !== t.origen) salida['origen'] = v.origen;
  if (nuloSiVacio(v.solicitante_nombre) !== t.solicitante_nombre) {
    salida['solicitante_nombre'] = nuloSiVacio(v.solicitante_nombre);
  }
  if (nuloSiVacio(v.solicitante_correo) !== t.solicitante_correo) {
    salida['solicitante_correo'] = nuloSiVacio(v.solicitante_correo);
  }
  if (v.prioridad !== t.prioridad) salida['prioridad'] = v.prioridad;
  if (v.categoria_id !== t.categoria_id) salida['categoria_id'] = v.categoria_id;
  if (!mismoInstante(inicio, t.inicio_planificado)) salida['inicio_planificado'] = inicio;
  if (!mismoInstante(limite, t.fecha_limite)) salida['fecha_limite'] = limite;
  if (horas !== t.horas_estimadas) salida['horas_estimadas'] = horas;
  return salida;
}

function Formulario({ ticket, onCerrar }: { ticket: TicketDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const listaCategorias = useQuery({
    queryKey: ['categorias', 'activas'],
    queryFn: () => categorias('true'),
    staleTime: 5 * 60_000,
  });
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<Valores>({ defaultValues: inicial(ticket) });
  const valores = useWatch({ control }) as Valores;

  const guardar = useMutation({
    mutationFn: (entrada: TicketEditarEntradaDatos) => editarTicket(ticket.id, entrada),
    onSuccess: async () => {
      toast.success('Ticket actualizado');
      await invalidarTicket(queryClient, ticket.id);
      onCerrar();
    },
    onError: (err) => {
      const porCampo = erroresDeApi(err);
      if (porCampo) {
        for (const [campo, mensaje] of Object.entries(porCampo)) {
          if (campo in inicial(ticket)) setError(campo as keyof Valores, { message: mensaje });
        }
        return;
      }
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      );
    },
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const resultado = TicketEditarEntrada.safeParse(cambios(ticket, v));
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? '');
        if (campo in v) setError(campo as keyof Valores, { message: mensajeDeCampo(campo, issue) });
        else setErrorGeneral(issue.message);
      }
      return;
    }
    if (Object.keys(resultado.data).length === 0) {
      onCerrar();
      return;
    }
    guardar.mutate(resultado.data);
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar ticket</DialogTitle>
        <DialogDescription>Cada cambio queda registrado en el historial.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={enviar}
        noValidate
        className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-1"
      >
        <Campo etiqueta="Asunto" error={errors.asunto?.message}>
          {(p) => <Input {...p} maxLength={200} {...register('asunto')} />}
        </Campo>
        <Campo etiqueta="Descripción" error={errors.descripcion?.message}>
          {(p) => <Textarea {...p} rows={5} {...register('descripcion')} />}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cliente o área interna" error={errors.cliente_id?.message}>
            {(p) => (
              <SelectorCliente
                id={p.id}
                invalido={p['aria-invalid']}
                valor={valores.cliente_id}
                onChange={(c) => setValue('cliente_id', c ? c.id : null, { shouldDirty: true })}
              />
            )}
          </Campo>
          <Campo etiqueta="Origen">
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Origen"
                valor={valores.origen}
                alCambiar={(v) => setValue('origen', v as OrigenTicket, { shouldDirty: true })}
                opciones={[
                  { valor: 'externo', etiqueta: 'Externo' },
                  { valor: 'interno', etiqueta: 'Interno' },
                ]}
              />
            )}
          </Campo>
          <Campo etiqueta="Nombre del solicitante" error={errors.solicitante_nombre?.message}>
            {(p) => <Input {...p} autoComplete="off" {...register('solicitante_nombre')} />}
          </Campo>
          <Campo etiqueta="Correo del solicitante" error={errors.solicitante_correo?.message}>
            {(p) => (
              <Input type="email" {...p} autoComplete="off" {...register('solicitante_correo')} />
            )}
          </Campo>
          <Campo etiqueta="Prioridad">
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Prioridad"
                valor={valores.prioridad}
                alCambiar={(v) => setValue('prioridad', v as Prioridad, { shouldDirty: true })}
                opciones={PRIORIDADES.map((x) => ({ valor: x, etiqueta: ETIQUETA_PRIORIDAD[x] }))}
              />
            )}
          </Campo>
          <Campo etiqueta="Categoría" error={errors.categoria_id?.message}>
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Categoría"
                valor={valores.categoria_id === null ? 'ninguna' : String(valores.categoria_id)}
                alCambiar={(v) =>
                  setValue('categoria_id', v === 'ninguna' ? null : Number(v), {
                    shouldDirty: true,
                  })
                }
                opciones={[
                  { valor: 'ninguna', etiqueta: 'Sin categoría' },
                  ...(listaCategorias.data ?? []).map((c) => ({
                    valor: String(c.id),
                    etiqueta: c.nombre,
                  })),
                ]}
              />
            )}
          </Campo>
          <Campo etiqueta="Inicio planificado" error={errors.inicio_planificado?.message}>
            {(p) => <Input type="datetime-local" {...p} {...register('inicio_planificado')} />}
          </Campo>
          <Campo etiqueta="Fecha límite" error={errors.fecha_limite?.message}>
            {(p) => <Input type="datetime-local" {...p} {...register('fecha_limite')} />}
          </Campo>
          <Campo etiqueta="Horas estimadas" error={errors.horas_estimadas?.message}>
            {(p) => (
              <Input
                type="number"
                step={0.25}
                min={0}
                inputMode="decimal"
                {...p}
                {...register('horas_estimadas')}
              />
            )}
          </Campo>
        </div>
        {errorGeneral ? (
          <p role="alert" className="text-sm text-urgente">
            {errorGeneral}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoEditarTicket({
  ticket,
  abierto,
  onCerrar,
}: {
  ticket: TicketDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        {abierto ? <Formulario ticket={ticket} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
