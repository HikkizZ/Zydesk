import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_PRIORIDAD,
  PRIORIDADES,
  TicketCrearEntrada,
  type OrigenTicket,
  type Prioridad,
} from '@zydesk/shared';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Campo } from '@/components/dominio/Campo';
import { localSantiagoAIso } from '@/components/dominio/formato-fecha';
import { PillPrioridad } from '@/components/dominio/PillPrioridad';
import { SelectorPersonas, useUsuariosActivos } from '@/components/dominio/SelectorPersonas';
import { SelectorResponsables } from '@/components/dominio/SelectorResponsables';
import { SinPermiso } from '@/components/dominio/SinPermiso';
import { SubidaArchivos } from '@/components/dominio/SubidaArchivos';
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
import { Textarea } from '@/components/ui/textarea';
import { usePermiso, useYo } from '@/features/auth/SesionProvider';
import { calcularPlazo, categorias } from '@/features/configuracion/api';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { crearTicket, type ArchivoDatos } from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { erroresDeApi, mensajeDeCampo, nuloSiVacio } from '../components/formulario';
import { PanelCorreo, type CorreoUsado, type ReferenciaCorreo } from '../components/PanelCorreo';
import { SelectorCliente, useClientesActivos } from '../components/SelectorCliente';

interface Valores {
  asunto: string;
  descripcion: string;
  cliente_id: number | null;
  origen: OrigenTicket;
  solicitante_nombre: string;
  solicitante_correo: string;
  prioridad: Prioridad;
  categoria_id: number | null;
  principal_id: number | null;
  otros_ids: number[];
  seguidores_ids: number[];
  inicio_planificado: string;
  fecha_limite: string;
  horas_estimadas: string;
}

type CampoFormulario = keyof Valores;

// Campo de la API → campo del formulario (los responsables se llaman distinto).
const CAMPO_DE_API: Record<string, CampoFormulario> = {
  responsable_principal_id: 'principal_id',
  responsables_ids: 'otros_ids',
};

const CAMPOS_FORMULARIO: CampoFormulario[] = [
  'asunto',
  'descripcion',
  'cliente_id',
  'origen',
  'solicitante_nombre',
  'solicitante_correo',
  'prioridad',
  'categoria_id',
  'principal_id',
  'otros_ids',
  'seguidores_ids',
  'inicio_planificado',
  'fecha_limite',
  'horas_estimadas',
];

const textoPlazo = (valor: number, unidad: 'horas' | 'dias') =>
  unidad === 'horas'
    ? `${valor} ${valor === 1 ? 'hora hábil' : 'horas hábiles'}`
    : `${valor} ${valor === 1 ? 'día hábil' : 'días hábiles'}`;

function FormularioNuevoTicket() {
  const yo = useYo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const clienteInicial = Number(params.get('cliente_id')) || null;

  const usuarios = useUsuariosActivos();
  const listaClientes = useClientesActivos();
  const listaCategorias = useQuery({
    queryKey: ['categorias', 'activas'],
    queryFn: () => categorias('true'),
    staleTime: 5 * 60_000,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<Valores>({
    defaultValues: {
      asunto: '',
      descripcion: '',
      cliente_id: clienteInicial,
      origen: 'externo',
      solicitante_nombre: '',
      solicitante_correo: '',
      prioridad: 'media',
      categoria_id: null,
      principal_id: yo.departamento ? yo.id : null,
      otros_ids: [],
      seguidores_ids: [],
      inicio_planificado: '',
      fecha_limite: '',
      horas_estimadas: '',
    },
  });
  const valores = useWatch({ control });

  const [archivos, setArchivos] = useState<ArchivoDatos[]>([]);
  const [correo, setCorreo] = useState<{ referencia: ReferenciaCorreo; nombre: string } | null>(
    null,
  );
  const [pendienteCorreo, setPendienteCorreo] = useState<CorreoUsado | null>(null);
  const [propuesto, setPropuesto] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const principalManual = useRef(false);
  const origenManual = useRef(false);

  // --- cliente → origen --------------------------------------------------------------------
  const alElegirCliente = (esInterno: boolean | null, id: number | null) => {
    setValue('cliente_id', id, { shouldDirty: true });
    clearErrors('cliente_id');
    if (esInterno !== null && !origenManual.current) {
      setValue('origen', esInterno ? 'interno' : 'externo');
    }
  };
  // Cliente que llega por `?cliente_id=`: ajusta el origen cuando carga la lista.
  const clienteDeUrl = listaClientes.data?.find((c) => c.id === clienteInicial);
  const esInternoDeUrl = clienteDeUrl?.es_interno ?? false;
  useEffect(() => {
    if (esInternoDeUrl) setValue('origen', 'interno');
  }, [esInternoDeUrl, setValue]);

  // --- categoría → responsable propuesto ---------------------------------------------------
  const alElegirCategoria = (id: number | null) => {
    setValue('categoria_id', id, { shouldDirty: true });
    clearErrors('categoria_id');
    const defecto = listaCategorias.data?.find((c) => c.id === id)?.responsable_defecto ?? null;
    if (defecto && !principalManual.current) {
      setValue('principal_id', defecto.id);
      setValue(
        'otros_ids',
        (getValues('otros_ids') ?? []).filter((x) => x !== defecto.id),
      );
      setPropuesto('Propuesto por la categoría');
    } else if (!defecto) {
      setPropuesto(null);
    }
  };

  // --- vista previa del plazo --------------------------------------------------------------
  const categoria = listaCategorias.data?.find((c) => c.id === valores.categoria_id);
  const principal = usuarios.data?.find((u) => u.id === valores.principal_id);
  const departamentoId = principal?.departamento_id ?? null;
  const plazo = categoria?.plazo_resolucion[valores.prioridad ?? 'media'];
  const desdeIso = valores.inicio_planificado
    ? localSantiagoAIso(valores.inicio_planificado)
    : null;
  const sinFecha = !valores.fecha_limite;
  const puedeCalcular = sinFecha && plazo !== undefined && departamentoId !== null;
  const vistaPlazo = useQuery({
    queryKey: ['plazo', desdeIso, departamentoId, plazo?.valor, plazo?.unidad],
    queryFn: () =>
      calcularPlazo({
        desde: desdeIso ?? new Date().toISOString(),
        plazo: plazo!,
        departamento_id: departamentoId!,
      }),
    enabled: puedeCalcular,
    staleTime: 60_000,
  });

  // --- correo → formulario -----------------------------------------------------------------
  function aplicarCorreo(c: CorreoUsado, reemplazar: boolean) {
    const { datos } = c;
    const conValor = (campo: CampoFormulario) => String(getValues(campo) ?? '').trim() !== '';
    const poner =
      (campo: 'asunto' | 'descripcion' | 'solicitante_nombre' | 'solicitante_correo') =>
      (valor: string | null) => {
        if (valor && (reemplazar || !conValor(campo))) {
          setValue(campo, valor, { shouldDirty: true });
          clearErrors(campo);
        }
      };
    poner('asunto')(datos.asunto);
    poner('descripcion')(datos.cuerpo_texto);
    poner('solicitante_nombre')(datos.solicitante_sugerido.nombre);
    poner('solicitante_correo')(datos.solicitante_sugerido.correo);
    setCorreo({ referencia: c.referencia, nombre: c.nombre });
  }

  function usarCorreo(c: CorreoUsado) {
    const choca = (campo: 'asunto' | 'descripcion', nuevo: string | null) => {
      const actual = (getValues(campo) ?? '').trim();
      return actual !== '' && nuevo !== null && actual !== nuevo.trim();
    };
    if (choca('asunto', c.datos.asunto) || choca('descripcion', c.datos.cuerpo_texto)) {
      setPendienteCorreo(c);
    } else {
      aplicarCorreo(c, false);
    }
  }

  // --- envío -------------------------------------------------------------------------------
  const crear = useMutation({
    mutationFn: (entrada: ReturnType<typeof TicketCrearEntrada.parse>) => crearTicket(entrada),
    onSuccess: async (ticket) => {
      toast.success(`Ticket ${ticket.codigo} creado`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['tablero'] }),
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
      ]);
      void navigate(`/tickets/${ticket.id}`);
    },
    onError: (err) => {
      const porCampo = erroresDeApi(err);
      if (porCampo) {
        const sinCampo: string[] = [];
        for (const [campo, mensaje] of Object.entries(porCampo)) {
          const destino = CAMPO_DE_API[campo] ?? campo;
          if ((CAMPOS_FORMULARIO as string[]).includes(destino)) {
            setError(destino as CampoFormulario, { message: mensaje });
          } else {
            sinCampo.push(mensaje);
          }
        }
        if (sinCampo.length > 0) setErrorGeneral(sinCampo.join(' · '));
        return;
      }
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      );
    },
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const horas =
      v.horas_estimadas.trim() === '' ? null : Number(v.horas_estimadas.replace(',', '.'));
    const resultado = TicketCrearEntrada.safeParse({
      asunto: v.asunto,
      descripcion: nuloSiVacio(v.descripcion),
      cliente_id: v.cliente_id,
      solicitante_nombre: nuloSiVacio(v.solicitante_nombre),
      solicitante_correo: nuloSiVacio(v.solicitante_correo),
      origen: v.origen,
      prioridad: v.prioridad,
      categoria_id: v.categoria_id,
      inicio_planificado: v.inicio_planificado ? localSantiagoAIso(v.inicio_planificado) : null,
      fecha_limite: v.fecha_limite ? localSantiagoAIso(v.fecha_limite) : null,
      horas_estimadas: horas,
      responsable_principal_id: v.principal_id,
      responsables_ids: v.otros_ids,
      seguidores_ids: v.seguidores_ids,
      archivo_ids: archivos.map((a) => a.id),
      correo: correo?.referencia ?? null,
    });
    if (!resultado.success) {
      const generales: string[] = [];
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? '');
        const destino = CAMPO_DE_API[campo] ?? campo;
        if ((CAMPOS_FORMULARIO as string[]).includes(destino)) {
          setError(destino as CampoFormulario, { message: mensajeDeCampo(campo, issue) });
        } else {
          generales.push(issue.message);
        }
      }
      if (generales.length > 0) setErrorGeneral(generales.join(' · '));
      return;
    }
    crear.mutate(resultado.data);
  });

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="lg:order-2 lg:self-start">
        <PanelCorreo
          usado={correo}
          alUsar={usarCorreo}
          alQuitar={() => setCorreo(null)}
          autoFoco={params.get('correo') === '1'}
        />
      </div>

      <form
        onSubmit={enviar}
        noValidate
        aria-label="Nuevo ticket"
        className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-4 sm:p-6 lg:order-1"
      >
        <Campo etiqueta="Asunto" error={errors.asunto?.message}>
          {(p) => <Input {...p} maxLength={200} {...register('asunto')} />}
        </Campo>
        <Campo etiqueta="Descripción" error={errors.descripcion?.message}>
          {(p) => <Textarea {...p} rows={6} {...register('descripcion')} />}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cliente o área interna" error={errors.cliente_id?.message}>
            {(p) => (
              <SelectorCliente
                id={p.id}
                invalido={p['aria-invalid']}
                valor={valores.cliente_id ?? null}
                onChange={(c) => alElegirCliente(c ? c.es_interno : null, c ? c.id : null)}
              />
            )}
          </Campo>
          <Campo etiqueta="Origen">
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Origen"
                valor={valores.origen ?? 'externo'}
                alCambiar={(v) => {
                  origenManual.current = true;
                  setValue('origen', v as OrigenTicket, { shouldDirty: true });
                }}
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
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Prioridad</legend>
          <div role="radiogroup" aria-label="Prioridad" className="flex flex-wrap gap-2">
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={valores.prioridad === p}
                aria-label={ETIQUETA_PRIORIDAD[p]}
                onClick={() => setValue('prioridad', p, { shouldDirty: true })}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md border px-3 lg:min-h-10',
                  valores.prioridad === p
                    ? 'border-acento ring-2 ring-acento/30'
                    : 'hover:bg-superficie-suave',
                )}
              >
                <PillPrioridad prioridad={p} />
              </button>
            ))}
          </div>
        </fieldset>

        <Campo etiqueta="Categoría" error={errors.categoria_id?.message}>
          {(p) => (
            <Seleccion
              id={p.id}
              etiqueta="Categoría"
              valor={
                valores.categoria_id === null || valores.categoria_id === undefined
                  ? 'ninguna'
                  : String(valores.categoria_id)
              }
              alCambiar={(v) => alElegirCategoria(v === 'ninguna' ? null : Number(v))}
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

        <div className="flex flex-col gap-1.5">
          <SelectorResponsables
            valor={{
              principal_id: valores.principal_id ?? null,
              otros_ids: (valores.otros_ids ?? []) as number[],
            }}
            propuesto={propuesto}
            onChange={(r) => {
              if (r.principal_id !== getValues('principal_id')) {
                principalManual.current = true;
                setPropuesto(null);
              }
              setValue('principal_id', r.principal_id, { shouldDirty: true });
              setValue('otros_ids', r.otros_ids, { shouldDirty: true });
              clearErrors(['principal_id', 'otros_ids']);
            }}
          />
          {errors.principal_id?.message || errors.otros_ids?.message ? (
            <p role="alert" className="text-sm text-urgente">
              {errors.principal_id?.message ?? errors.otros_ids?.message}
            </p>
          ) : null}
        </div>

        <Campo etiqueta="Seguidores" error={errors.seguidores_ids?.message}>
          {(p) => (
            <Controller
              control={control}
              name="seguidores_ids"
              render={({ field }) => (
                <SelectorPersonas
                  multiple
                  id={p.id}
                  etiqueta="Seguidores"
                  valor={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Inicio planificado" error={errors.inicio_planificado?.message}>
            {(p) => <Input type="datetime-local" {...p} {...register('inicio_planificado')} />}
          </Campo>
          <div className="flex flex-col gap-1.5">
            <Campo etiqueta="Fecha límite" error={errors.fecha_limite?.message}>
              {(p) => <Input type="datetime-local" {...p} {...register('fecha_limite')} />}
            </Campo>
            {sinFecha ? (
              <p aria-live="polite" className="text-sm text-tinta-2">
                {puedeCalcular && vistaPlazo.data && plazo
                  ? `Se calculará: vence el ${formatearFechaHora(vistaPlazo.data.hasta)} (${textoPlazo(plazo.valor, plazo.unidad)} desde ${desdeIso ? formatearFechaHora(desdeIso) : 'ahora'})`
                  : puedeCalcular && vistaPlazo.isPending
                    ? 'Calculando fecha límite…'
                    : 'Sin fecha límite (elige responsable y categoría o escribe una)'}
              </p>
            ) : null}
          </div>
        </div>

        <Campo etiqueta="Horas estimadas" error={errors.horas_estimadas?.message}>
          {(p) => (
            <Input
              type="number"
              step={0.25}
              min={0}
              inputMode="decimal"
              className="sm:w-40"
              {...p}
              {...register('horas_estimadas')}
            />
          )}
        </Campo>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Archivos</span>
          <p className="text-sm text-tinta-2">Fotos o documentos del ticket</p>
          <SubidaArchivos camara archivos={archivos} onChange={setArchivos} />
        </div>

        {errorGeneral ? (
          <p role="alert" className="text-sm text-urgente">
            {errorGeneral}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link to="/tickets">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear ticket'}
          </Button>
        </div>
      </form>

      <AlertDialog
        open={pendienteCorreo !== null}
        onOpenChange={(abierto) => !abierto && setPendienteCorreo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar lo que ya escribiste?</AlertDialogTitle>
            <AlertDialogDescription>
              El asunto o la descripción ya tienen texto distinto al del correo. Puedes
              reemplazarlos o conservarlos y completar solo los campos vacíos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (pendienteCorreo) aplicarCorreo(pendienteCorreo, false);
              }}
            >
              Conservar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendienteCorreo) aplicarCorreo(pendienteCorreo, true);
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function NuevoTicketPage() {
  const puedeEditar = usePermiso('tickets.editar');
  return (
    <>
      <TituloPagina titulo="Nuevo ticket" />
      {puedeEditar ? <FormularioNuevoTicket /> : <SinPermiso />}
    </>
  );
}
