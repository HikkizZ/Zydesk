import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_TIPO_OT, OtEditarEntrada, tienePermiso, type TipoOt } from '@zydesk/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { SelectorPersonas, useUsuariosActivos } from '@/components/dominio/SelectorPersonas';
import { SelectorTipoOt } from '@/components/dominio/SelectorTipoOt';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cliente as obtenerCliente } from '@/features/clientes/api';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { editarOt, invalidarOt, type OtDatos, type OtEditarEntradaDatos } from '@/features/ots/api';
import { esDesactualizada, mensajeDeOt } from '@/features/ots/errores';
import {
  erroresDeApi,
  mensajeDeCampo,
  nuloSiVacio,
} from '@/features/tickets/components/formulario';
import { SelectorCliente } from '@/features/tickets/components/SelectorCliente';
import { usePermiso } from '@/features/auth/SesionProvider';
import { ErrorApi } from '@/lib/api';

interface Valores {
  titulo: string;
  alcance: string;
  responsable_tecnico_id: number | null;
  inicio: string;
  termino: string;
  cliente_id: number | null;
  contacto_id: number | null;
  oc_cliente: string;
  condicion_pago: string;
  descuenta_bolsa: boolean;
  area_solicitante: string;
  centro_costo: string;
  aprobador_id: number | null;
}

const inicial = (ot: OtDatos): Valores => ({
  titulo: ot.titulo,
  alcance: ot.alcance ?? '',
  responsable_tecnico_id: ot.responsable_tecnico?.id ?? null,
  inicio: ot.inicio ?? '',
  termino: ot.termino ?? '',
  cliente_id: ot.cliente_id,
  contacto_id: ot.contacto?.id ?? null,
  oc_cliente: ot.oc_cliente ?? '',
  condicion_pago: ot.condicion_pago ?? '',
  descuenta_bolsa: ot.bolsa !== null,
  area_solicitante: ot.area_solicitante ?? '',
  centro_costo: ot.centro_costo ?? '',
  aprobador_id: ot.aprobador?.id ?? null,
});

// Solo viajan los campos que cambiaron y que aplican al tipo de la OT: cada uno deja su evento.
function cambios(ot: OtDatos, v: Valores): Record<string, unknown> {
  const antes = inicial(ot);
  const s: Record<string, unknown> = {};
  if (v.titulo.trim() !== antes.titulo) s['titulo'] = v.titulo;
  if (nuloSiVacio(v.alcance) !== (ot.alcance?.trim() || null))
    s['alcance'] = nuloSiVacio(v.alcance);
  if (v.responsable_tecnico_id !== antes.responsable_tecnico_id) {
    s['responsable_tecnico_id'] = v.responsable_tecnico_id;
  }
  if (nuloSiVacio(v.inicio) !== ot.inicio) s['inicio'] = nuloSiVacio(v.inicio);
  if (nuloSiVacio(v.termino) !== ot.termino) s['termino'] = nuloSiVacio(v.termino);
  if (ot.tipo === 'facturable') {
    const clienteCambia = ot.tipo_cambiable && v.cliente_id !== antes.cliente_id;
    if (clienteCambia) s['cliente_id'] = v.cliente_id;
    if (!clienteCambia && v.contacto_id !== antes.contacto_id) s['contacto_id'] = v.contacto_id;
    if (nuloSiVacio(v.oc_cliente) !== ot.oc_cliente) s['oc_cliente'] = nuloSiVacio(v.oc_cliente);
    if (nuloSiVacio(v.condicion_pago) !== ot.condicion_pago) {
      s['condicion_pago'] = nuloSiVacio(v.condicion_pago);
    }
    if (!clienteCambia && v.descuenta_bolsa !== antes.descuenta_bolsa) {
      s['descuenta_bolsa'] = v.descuenta_bolsa;
    }
  } else {
    if (nuloSiVacio(v.area_solicitante) !== ot.area_solicitante) {
      s['area_solicitante'] = nuloSiVacio(v.area_solicitante);
    }
    if (nuloSiVacio(v.centro_costo) !== ot.centro_costo) {
      s['centro_costo'] = nuloSiVacio(v.centro_costo);
    }
    if (v.aprobador_id !== antes.aprobador_id) s['aprobador_id'] = v.aprobador_id;
  }
  return s;
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

function Formulario({ ot, soloLectura }: { ot: OtDatos; soloLectura: boolean }) {
  const queryClient = useQueryClient();
  const usuarios = useUsuariosActivos();
  const facturable = ot.tipo === 'facturable';
  // Tras la aprobación, los datos comerciales solo los cambia quien puede aprobar.
  const puedeAprobar = usePermiso('ots.aprobar');
  const comercialBloqueado =
    !puedeAprobar && (ot.etapa === 'aprobada' || ot.etapa === 'en_ejecucion');
  const cliente = useQuery({
    queryKey: ['cliente', ot.cliente_id],
    queryFn: () => obtenerCliente(ot.cliente_id as number),
    enabled: facturable && ot.cliente_id !== null,
    staleTime: 60_000,
  });
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<Valores>({ defaultValues: inicial(ot) });
  const valores = useWatch({ control }) as Valores;

  const hayCambios = Object.keys(cambios(ot, valores)).length > 0;
  const bolsaVigente = cliente.data?.bolsa.vigente != null || ot.bolsa !== null;
  const contactos = (cliente.data?.contactos ?? []).filter(
    (c) => c.activo || c.id === ot.contacto?.id,
  );
  // Quien aprueba: solo roles con `ots.aprobar`.
  const noAprueban = (usuarios.data ?? [])
    .filter((u) => !tienePermiso(u.rol, 'ots.aprobar'))
    .map((u) => u.id);

  const guardar = useMutation({
    mutationFn: (entrada: OtEditarEntradaDatos) => editarOt(ot.id, entrada),
    onSuccess: async () => {
      toast.success('OT actualizada');
      await invalidarOt(queryClient, ot.id, ot.ticket.id);
    },
    onError: (err) => {
      const porCampo = erroresDeApi(err);
      if (porCampo) {
        for (const [campo, mensaje] of Object.entries(porCampo)) {
          if (campo in valores) setError(campo as keyof Valores, { message: mensaje });
        }
        return;
      }
      if (esDesactualizada(err)) {
        toast.error(mensajeDeOt(err));
        void invalidarOt(queryClient, ot.id, ot.ticket.id);
        return;
      }
      setErrorGeneral(mensajeDeOt(err));
    },
  });

  const enviar = handleSubmit((v) => {
    setErrorGeneral(null);
    const resultado = OtEditarEntrada.safeParse(cambios(ot, v));
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? '');
        if (campo in v) setError(campo as keyof Valores, { message: mensajeDeCampo(campo, issue) });
      }
      return;
    }
    if (Object.keys(resultado.data).length > 0) guardar.mutate(resultado.data);
  });

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <Campo
        etiqueta="Título"
        error={errors.titulo?.message && 'Escribe el título (hasta 200 caracteres)'}
      >
        {(p) => <Input {...p} maxLength={200} disabled={soloLectura} {...register('titulo')} />}
      </Campo>
      <Campo etiqueta="Alcance" error={errors.alcance?.message}>
        {(p) => <Textarea {...p} rows={4} disabled={soloLectura} {...register('alcance')} />}
      </Campo>
      <Campo etiqueta="Responsable técnico">
        {(p) => (
          <SelectorPersonas
            id={p.id}
            etiqueta="Responsable técnico"
            disabled={soloLectura}
            valor={valores.responsable_tecnico_id}
            onChange={(id) => setValue('responsable_tecnico_id', id, { shouldDirty: true })}
          />
        )}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Inicio" error={errors.inicio?.message}>
          {(p) => <Input {...p} type="date" disabled={soloLectura} {...register('inicio')} />}
        </Campo>
        <Campo etiqueta="Término" error={errors.termino?.message}>
          {(p) => <Input {...p} type="date" disabled={soloLectura} {...register('termino')} />}
        </Campo>
      </div>

      {facturable ? (
        <>
          <Campo etiqueta="Cliente" error={errors.cliente_id?.message}>
            {(p) => (
              <SelectorCliente
                id={p.id}
                disabled={soloLectura || !ot.tipo_cambiable}
                valor={valores.cliente_id}
                onChange={(c) => {
                  setValue('cliente_id', c?.id ?? null, { shouldDirty: true });
                  setValue('contacto_id', null);
                  setValue('descuenta_bolsa', false);
                }}
              />
            )}
          </Campo>
          <Campo
            etiqueta="Contacto"
            error={errors.contacto_id?.message}
            {...(cliente.isSuccess && contactos.length === 0
              ? { ayuda: 'El cliente no tiene contactos. Agrégalos en su ficha.' }
              : {})}
          >
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Contacto"
                disabled={soloLectura || valores.cliente_id !== ot.cliente_id}
                valor={valores.contacto_id === null ? '__ninguno__' : String(valores.contacto_id)}
                alCambiar={(v) =>
                  setValue('contacto_id', v === '__ninguno__' ? null : Number(v), {
                    shouldDirty: true,
                  })
                }
                opciones={[
                  { valor: '__ninguno__', etiqueta: 'Sin contacto' },
                  ...contactos.map((c) => ({
                    valor: String(c.id),
                    etiqueta: c.aprueba_cotizaciones ? `${c.nombre} · aprueba` : c.nombre,
                  })),
                ]}
              />
            )}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="N° de OC del cliente" error={errors.oc_cliente?.message}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={60}
                  disabled={soloLectura || comercialBloqueado}
                  className="font-mono"
                  {...register('oc_cliente')}
                />
              )}
            </Campo>
            <Campo etiqueta="Condición de pago" error={errors.condicion_pago?.message}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={80}
                  disabled={soloLectura || comercialBloqueado}
                  {...register('condicion_pago')}
                />
              )}
            </Campo>
          </div>
          {comercialBloqueado && !soloLectura ? (
            <p className="text-sm text-tinta-2">
              Solo Coordinación o Administración puede cambiarlos tras la aprobación
            </p>
          ) : null}
          {bolsaVigente ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="descuenta-bolsa"
                checked={valores.descuenta_bolsa}
                disabled={soloLectura || comercialBloqueado || valores.cliente_id !== ot.cliente_id}
                onCheckedChange={(v) =>
                  setValue('descuenta_bolsa', v === true, { shouldDirty: true })
                }
                className="mt-0.5 size-5"
              />
              <div className="flex flex-col">
                <Label htmlFor="descuenta-bolsa">Descuenta de la bolsa</Label>
                {ot.bolsa ? (
                  <p className="text-sm text-tinta-2">
                    {formatoHoras.format(ot.bolsa.usadas_mes)} /{' '}
                    {formatoHoras.format(ot.bolsa.horas_mes)} h usadas este mes
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Área solicitante" error={errors.area_solicitante?.message}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={120}
                  disabled={soloLectura}
                  {...register('area_solicitante')}
                />
              )}
            </Campo>
            <Campo etiqueta="Centro de costo" error={errors.centro_costo?.message}>
              {(p) => (
                <Input {...p} maxLength={80} disabled={soloLectura} {...register('centro_costo')} />
              )}
            </Campo>
          </div>
          <Campo etiqueta="Quién aprueba" error={errors.aprobador_id?.message}>
            {(p) => (
              <SelectorPersonas
                id={p.id}
                etiqueta="Quién aprueba"
                disabled={soloLectura}
                excluir={noAprueban}
                valor={valores.aprobador_id}
                onChange={(id) => setValue('aprobador_id', id, { shouldDirty: true })}
              />
            )}
          </Campo>
        </>
      )}

      {errorGeneral ? (
        <p role="alert" className="text-sm text-urgente">
          {errorGeneral}
        </p>
      ) : null}
      {soloLectura ? null : (
        <div>
          <Button type="submit" disabled={!hayCambios || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      )}
    </form>
  );
}

// Tarjeta "Tipo y datos": tipo (solo en Borrador) y los campos editables de la OT (spec §10.4 punto 3).
export function DatosOt({ ot, puedeEditar }: { ot: OtDatos; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [nuevoTipo, setNuevoTipo] = useState<TipoOt | null>(null);
  const final = ot.etapa === 'cerrada' || ot.etapa === 'cancelada';
  const soloLectura = !puedeEditar || final;

  const cambiarTipo = useMutation({
    mutationFn: (tipo: TipoOt) => editarOt(ot.id, { tipo }),
    onSuccess: async () => {
      toast.success('Tipo cambiado');
      setNuevoTipo(null);
      await invalidarOt(queryClient, ot.id, ot.ticket.id);
    },
    onError: (err) => {
      setNuevoTipo(null);
      toast.error(err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.');
      if (esDesactualizada(err)) void invalidarOt(queryClient, ot.id, ot.ticket.id);
    },
  });

  return (
    <section
      aria-label="Tipo y datos"
      className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-4 sm:p-5"
    >
      <h2 className="font-titulo text-base font-semibold">Tipo y datos</h2>
      <SelectorTipoOt
        valor={ot.tipo}
        disabled={soloLectura || !ot.tipo_cambiable}
        {...(!ot.tipo_cambiable ? {} : { aviso: null })}
        onChange={(tipo) => tipo !== ot.tipo && setNuevoTipo(tipo)}
      />
      {/* `key` reinicia el formulario cuando llegan datos nuevos del servidor. */}
      <Formulario key={ot.actualizado_en} ot={ot} soloLectura={soloLectura} />

      <AlertDialog open={nuevoTipo !== null} onOpenChange={(a) => !a && setNuevoTipo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cambiar a {nuevoTipo ? ETIQUETA_TIPO_OT[nuevoTipo] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>Se limpiarán los campos del otro tipo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (nuevoTipo) cambiarTipo.mutate(nuevoTipo);
              }}
            >
              Cambiar tipo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
