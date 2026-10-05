import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calcularCotizacion, CotizacionEntrada, type CotizacionEntradaDatos } from '@zydesk/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMes } from '@/components/dominio/formato-fecha';
import { PillEstadoCotizacion } from '@/components/dominio/PillEstadoCotizacion';
import { Button } from '@/components/ui/button';
import { usePermiso } from '@/features/auth/SesionProvider';
import { cliente as obtenerCliente } from '@/features/clientes/api';
import { ErrorApi } from '@/lib/api';
import {
  clavesCotizacion,
  cotizacion as obtenerCotizacion,
  guardarCotizacion,
  invalidarCotizacion,
  STALE_COTIZACIONES,
  tarifas as obtenerTarifas,
  type CotizacionSalidaDatos,
  type TarifasSalidaDatos,
} from '../api';
import { AccionesCotizacion } from '../components/AccionesCotizacion';
import { DatosCotizacion, type ContactoOpcion } from '../components/DatosCotizacion';
import { DialogoImportarHoras } from '../components/DialogoImportarHoras';
import { DialogoPlantilla } from '../components/DialogoPlantilla';
import { TablaLineas } from '../components/TablaLineas';
import { TotalesCotizacion } from '../components/TotalesCotizacion';
import { VersionesCotizacion } from '../components/VersionesCotizacion';
import {
  lineasParaCalculo,
  valoresDe,
  type ValoresCotizacion,
  type ValoresLinea,
} from '../formulario';
import { useVistaTarjetas } from '../useVistaTarjetas';

function NoEncontrada() {
  return (
    <EstadoVacio
      titulo="Cotización no encontrada"
      descripcion="Puede que se haya eliminado o que el enlace no sea correcto."
      accion={
        <Button asChild variant="outline">
          <Link to="/cotizaciones">Ir a cotizaciones</Link>
        </Button>
      }
    />
  );
}

// Aviso bajo el título cuando la versión ya no se edita (spec fase 4 §11.4).
function textoAviso(c: CotizacionSalidaDatos): string | null {
  switch (c.estado) {
    case 'enviada':
      return `Enviada${c.enviada_en ? ` el ${diaMes(c.enviada_en)}` : ''} · ya no se edita; duplica para hacer cambios`;
    case 'aprobada':
      return `Aprobada por el cliente${c.aprobada_en ? ` el ${diaMes(c.aprobada_en)}` : ''} · congelada`;
    case 'rechazada':
      return `Rechazada: duplica como v${c.version + 1} para corregir`;
    case 'reemplazada': {
      const siguiente = c.versiones.map((v) => v.version).filter((v) => v > c.version);
      return `Reemplazada por la v${siguiente.length > 0 ? Math.min(...siguiente) : c.version + 1}`;
    }
    default:
      return null;
  }
}

type DialogoAbierto = 'horas' | 'plantilla' | null;

function Editor({
  cotizacion,
  tarifas,
  contactos,
}: {
  cotizacion: CotizacionSalidaDatos;
  tarifas: TarifasSalidaDatos | undefined;
  contactos: ContactoOpcion[];
}) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const editable = cotizacion.editable && puedeEditar;
  const vistaTarjetas = useVistaTarjetas();
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null);

  const form = useForm<ValoresCotizacion, unknown, CotizacionEntradaDatos>({
    resolver: zodResolver(CotizacionEntrada),
    defaultValues: valoresDe(cotizacion),
    mode: 'onChange',
  });
  const { isDirty, isValid } = form.formState;
  const valores = useWatch({ control: form.control });
  const moneda = valores.moneda ?? cotizacion.moneda;
  const aplicaIva = valores.aplica_iva ?? cotizacion.aplica_iva;

  // Cálculo en vivo con la función única de `shared` (ADR 0007).
  const calculo = calcularCotizacion(
    lineasParaCalculo(valores.lineas as Partial<ValoresLinea>[] | undefined),
    {
      moneda,
      aplica_iva: aplicaIva,
      iva_pct: cotizacion.iva_pct,
    },
  );
  const valorUf =
    typeof valores.valor_uf === 'number' && Number.isFinite(valores.valor_uf)
      ? valores.valor_uf
      : null;

  const refrescar = () =>
    invalidarCotizacion(queryClient, cotizacion.id, cotizacion.ot.id, cotizacion.ot.ticket.id);
  // El formulario se vuelve a armar con la respuesta del servidor (totales y líneas tal como quedaron).
  const alRecibir = async (c: CotizacionSalidaDatos) => {
    queryClient.setQueryData(clavesCotizacion.una(c.id), c);
    form.reset(valoresDe(c));
    await refrescar();
  };

  const guardar = useMutation({
    mutationFn: (entrada: CotizacionEntradaDatos) => guardarCotizacion(cotizacion.id, entrada),
    onSuccess: async (c) => {
      toast.success('Cotización guardada');
      await alRecibir(c);
    },
    onError: (err) => {
      toast.error(mensajeDeError(err));
      void refrescar();
    },
  });
  const onGuardar = () => void form.handleSubmit((v) => guardar.mutate(v))();

  const alAplicar = async (c: CotizacionSalidaDatos) => {
    setDialogo(null);
    await alRecibir(c);
  };

  const aviso = textoAviso(cotizacion);
  const pistaBloqueo = isDirty ? 'Guarda primero' : null;

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TituloPagina
            titulo={`${cotizacion.codigo} v${cotizacion.version}`}
            codigo={`${cotizacion.codigo} v${cotizacion.version}`}
          />
          <PillEstadoCotizacion estado={cotizacion.estado} />
        </div>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <Link
            to={`/ots/${cotizacion.ot.id}`}
            className="text-acento underline underline-offset-2"
          >
            <span className="font-mono">{cotizacion.ot.codigo}</span> · {cotizacion.ot.titulo}
          </Link>
          <Link
            to={`/tickets/${cotizacion.ot.ticket.id}`}
            className="font-mono text-acento underline underline-offset-2"
          >
            {cotizacion.ot.ticket.codigo}
          </Link>
          {cotizacion.cliente ? (
            <span className="text-tinta-2">{cotizacion.cliente.nombre}</span>
          ) : null}
        </p>
        {aviso ? (
          <p role="status" className="rounded-md bg-superficie-suave px-3 py-2 text-sm">
            {aviso}
          </p>
        ) : null}
        <AccionesCotizacion
          cotizacion={cotizacion}
          hayCambios={isDirty}
          puedeGuardar={isValid}
          guardando={guardar.isPending}
          onGuardar={onGuardar}
          onImportar={() => setDialogo('horas')}
          onAplicarPlantilla={() => setDialogo('plantilla')}
        />
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (editable) onGuardar();
          }}
          className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-span-2"
        >
          <DatosCotizacion
            form={form}
            cotizacion={cotizacion}
            contactos={contactos}
            editable={editable}
          />
          <section
            aria-label="Líneas"
            className="rounded-lg border border-borde bg-superficie p-4 sm:p-5"
          >
            <h2 className="mb-3 font-titulo text-base font-semibold">Líneas</h2>
            <TablaLineas
              form={form}
              moneda={moneda}
              totalesLinea={calculo.lineas}
              editable={editable}
              precioNuevaLinea={moneda === 'CLP' ? (tarifas?.hora_normal?.valor ?? 0) : 0}
              vistaTarjetas={vistaTarjetas}
              pistaBloqueo={pistaBloqueo}
              alImportar={() => setDialogo('horas')}
              alAplicarPlantilla={() => setDialogo('plantilla')}
            />
          </section>
        </form>

        {/* Bajo 1024 px los totales quedan fijos al pie mientras se editan las líneas. */}
        <div className="sticky bottom-14 z-[5] lg:static lg:col-start-2 lg:row-start-1">
          <TotalesCotizacion
            totales={calculo}
            moneda={moneda}
            aplicaIva={aplicaIva}
            ivaPct={cotizacion.iva_pct}
            valorUf={valorUf}
          />
        </div>
        <VersionesCotizacion cotizacion={cotizacion} className="lg:col-start-2 lg:row-start-2" />
      </div>

      <DialogoImportarHoras
        cotizacion={cotizacion}
        abierto={dialogo === 'horas'}
        onCerrar={() => setDialogo(null)}
        onHecho={(c) => void alAplicar(c)}
      />
      <DialogoPlantilla
        cotizacion={cotizacion}
        abierto={dialogo === 'plantilla'}
        onCerrar={() => setDialogo(null)}
        onHecho={(c) => void alAplicar(c)}
      />
    </>
  );
}

export function CotizadorPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const valido = Number.isInteger(id) && id > 0;

  const consulta = useQuery({
    queryKey: clavesCotizacion.una(id),
    queryFn: () => obtenerCotizacion(id),
    enabled: valido,
    staleTime: STALE_COTIZACIONES,
    retry: (intentos, err) => !(err instanceof ErrorApi && err.status === 404) && intentos < 2,
  });
  const tarifas = useQuery({
    queryKey: clavesCotizacion.tarifas,
    queryFn: obtenerTarifas,
    staleTime: 60_000,
  });
  const clienteId = consulta.data?.cliente?.id;
  const cliente = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => obtenerCliente(clienteId as number),
    enabled: clienteId !== undefined,
    staleTime: 60_000,
  });

  if (!valido) return <NoEncontrada />;
  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return consulta.error instanceof ErrorApi && consulta.error.status === 404 ? (
      <NoEncontrada />
    ) : (
      <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
    );
  }

  const cot = consulta.data;
  // Contactos activos del cliente; el ya elegido se conserva aunque se haya desactivado.
  const contactos: ContactoOpcion[] = (cliente.data?.contactos ?? [])
    .filter((c) => c.activo)
    .map((c) => ({ id: c.id, nombre: c.nombre, aprueba_cotizaciones: c.aprueba_cotizaciones }));
  if (cot.contacto && !contactos.some((c) => c.id === cot.contacto?.id)) {
    contactos.push({
      id: cot.contacto.id,
      nombre: cot.contacto.nombre,
      aprueba_cotizaciones: false,
    });
  }

  return (
    <Editor
      key={`${cot.id}-${cot.actualizado_en}`}
      cotizacion={cot}
      tarifas={tarifas.data}
      contactos={contactos}
    />
  );
}
