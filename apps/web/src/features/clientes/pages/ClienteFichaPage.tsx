import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONCEPTOS_TARIFA, ETIQUETA_CONCEPTO_TARIFA, formatearMonto } from '@zydesk/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useMigas } from '@/app/proveedores';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Chip } from '@/components/dominio/Chip';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermiso } from '@/features/auth/SesionProvider';
import { ErrorApi } from '@/lib/api';
import {
  cliente as obtenerCliente,
  desactivarCliente,
  quitarContacto,
  reactivarCliente,
  type ClienteSalidaDatos,
  type ContactoSalidaDatos,
} from '../api';
import { DialogoBolsa } from '../components/DialogoBolsa';
import { DialogoCliente } from '../components/DialogoCliente';
import { DialogoContacto } from '../components/DialogoContacto';
import { DialogoTarifas } from '../components/DialogoTarifas';
import { OtsDelCliente } from '../components/OtsDelCliente';
import { TicketsDelCliente } from '../components/TicketsDelCliente';
import { formatearDia, formatearDiaAnio, formatearHoras } from '../formato';

function Tarjeta({
  titulo,
  acciones,
  children,
}: {
  titulo: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-linea bg-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}

function Bolsa({ c }: { c: ClienteSalidaDatos }) {
  const { vigente, historial } = c.bolsa;
  return (
    <Tarjeta titulo="Bolsa de horas">
      {vigente ? (
        <p className="text-sm font-medium text-tinta">
          {formatearHoras(vigente.horas_mes)} h al mes
          {vigente.fecha_renovacion
            ? ` · Se renueva el ${formatearDia(vigente.fecha_renovacion)}`
            : ''}
          {` · vigente desde ${formatearDiaAnio(vigente.vigente_desde)}`}
          {vigente.vigente_hasta ? ` hasta ${formatearDiaAnio(vigente.vigente_hasta)}` : ''}
        </p>
      ) : (
        <p className="text-sm font-medium text-tinta">Sin contrato vigente</p>
      )}
      {vigente && vigente.horas_usadas_mes !== null ? (
        <p
          className={
            vigente.horas_usadas_mes > vigente.horas_mes
              ? 'mt-1 text-sm font-semibold text-plazo-vencido'
              : 'mt-1 text-sm text-tinta-2'
          }
        >
          {`${formatearHoras(vigente.horas_usadas_mes)} / ${formatearHoras(vigente.horas_mes)} h usadas este mes`}
        </p>
      ) : null}
      <h3 className="mt-4 mb-1 text-xs font-medium text-tinta-3">Historial de contratos</h3>
      <ul className="divide-y divide-linea-suave text-sm">
        {historial.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-medium text-tinta">{formatearHoras(h.horas_mes)} h al mes</span>
            <span className="text-tinta-2">
              {formatearDiaAnio(h.vigente_desde)}
              {' – '}
              {h.vigente_hasta ? formatearDiaAnio(h.vigente_hasta) : 'sin término'}
            </span>
            {h.vigente ? <Chip tono="suave-ok">Vigente</Chip> : null}
            {h.notas ? <span className="text-tinta-2">{h.notas}</span> : null}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function Condiciones({ c }: { c: ClienteSalidaDatos }) {
  return (
    <Tarjeta titulo="Condiciones comerciales">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-tinta-2">Condición de pago</dt>
          <dd className="text-sm text-tinta">{c.condicion_pago ?? 'Sin definir'}</dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-2">Exige OC</dt>
          <dd className="text-sm text-tinta">{c.exige_oc ? 'Sí' : 'No'}</dd>
        </div>
      </dl>
    </Tarjeta>
  );
}

function Tarifas({ c, puedeEditar }: { c: ClienteSalidaDatos; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  return (
    <Tarjeta
      titulo="Tarifas"
      acciones={
        puedeEditar ? (
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            Editar tarifas
          </Button>
        ) : null
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {CONCEPTOS_TARIFA.map((concepto) => {
          const t = c.tarifas.find((x) => x.concepto === concepto);
          return (
            <div key={concepto}>
              <dt className="text-xs text-tinta-2">{ETIQUETA_CONCEPTO_TARIFA[concepto]}</dt>
              <dd className="text-sm text-tinta tabular-nums">
                {t ? `${formatearMonto(t.valor, t.moneda)} + IVA` : 'Tarifa global'}
              </dd>
            </div>
          );
        })}
      </dl>
      <DialogoTarifas
        abierto={editando}
        alCambiar={setEditando}
        clienteId={c.id}
        tarifas={c.tarifas}
      />
    </Tarjeta>
  );
}

function Contactos({ c }: { c: ClienteSalidaDatos }) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const [dialogo, setDialogo] = useState<{ contacto?: ContactoSalidaDatos } | null>(null);
  const [aQuitar, setAQuitar] = useState<ContactoSalidaDatos | null>(null);
  const quitar = useMutation({
    mutationFn: (contactoId: number) => quitarContacto(c.id, contactoId),
    onSuccess: async () => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', c.id] }),
      ]);
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });
  return (
    <Tarjeta
      titulo="Contactos"
      acciones={
        puedeEditar ? (
          <Button variant="outline" size="sm" onClick={() => setDialogo({})}>
            + Agregar contacto
          </Button>
        ) : null
      }
    >
      {c.contactos.length === 0 ? (
        <p className="text-sm text-tinta-2">Sin contactos registrados.</p>
      ) : (
        <ul className="divide-y divide-linea-suave">
          {c.contactos.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tinta">
                  {k.nombre}
                  {k.area ? <span className="font-normal text-tinta-2"> · {k.area}</span> : null}
                </p>
                <p className="text-sm break-words text-tinta-2">
                  {[k.correo, k.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </p>
              </div>
              {k.aprueba_cotizaciones ? <Chip tono="acento">Aprueba cotizaciones</Chip> : null}
              {puedeEditar ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar ${k.nombre}`}
                    onClick={() => setDialogo({ contacto: k })}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Quitar ${k.nombre}`}
                    onClick={() => setAQuitar(k)}
                  >
                    Quitar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <DialogoContacto
        abierto={dialogo !== null}
        alCambiar={(a) => {
          if (!a) setDialogo(null);
        }}
        clienteId={c.id}
        {...(dialogo?.contacto ? { contacto: dialogo.contacto } : {})}
      />
      <AlertDialog
        open={aQuitar !== null}
        onOpenChange={(a) => {
          if (!a) setAQuitar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar contacto</AlertDialogTitle>
            <AlertDialogDescription>
              {aQuitar ? `Se quitará a ${aQuitar.nombre} de los contactos de ${c.nombre}.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aQuitar) quitar.mutate(aQuitar.id);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tarjeta>
  );
}

function Ficha({ c }: { c: ClienteSalidaDatos }) {
  const queryClient = useQueryClient();
  const puedeEditarFicha = usePermiso('config.editar');
  const puedeAprobar = usePermiso('ots.aprobar');
  const puedeBolsa = puedeEditarFicha || puedeAprobar;
  const puedeEditarTickets = usePermiso('tickets.editar');
  const [editando, setEditando] = useState(false);
  const [agregandoBolsa, setAgregandoBolsa] = useState(false);
  const [pestana, setPestana] = useState(c.es_interno ? 'contactos' : 'datos');
  useMigas({ nombre: c.nombre });

  const cambiarActivo = useMutation({
    mutationFn: () => (c.activo ? desactivarCliente(c.id) : reactivarCliente(c.id)),
    onSuccess: async () => {
      toast.success('Guardado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente', c.id] }),
      ]);
    },
    onError: (err) => toast.error(mensajeDeError(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-tinta">{c.nombre}</h1>
          {c.es_interno ? <Chip tono="interna">Área interna</Chip> : null}
          {c.bolsa.vigente ? (
            <Chip>Bolsa {formatearHoras(c.bolsa.vigente.horas_mes)} h</Chip>
          ) : null}
          {c.activo ? null : <Chip>Inactivo</Chip>}
        </div>
        {c.es_interno ? null : (
          <p className="mt-1 text-xs text-tinta-3">
            {c.rut ? `RUT ${c.rut}` : 'Sin RUT'}
            {c.direccion ? ` · ${c.direccion}` : ''}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {puedeEditarTickets ? (
            <Button asChild variant="outline">
              <Link to={`/tickets/nuevo?cliente_id=${c.id}`}>Nuevo ticket para este cliente</Link>
            </Button>
          ) : null}
          {puedeEditarFicha ? (
            <>
              <Button variant="outline" onClick={() => setEditando(true)}>
                Editar ficha
              </Button>
              <Button
                variant="outline"
                disabled={cambiarActivo.isPending}
                onClick={() => cambiarActivo.mutate()}
              >
                {c.activo ? 'Desactivar' : 'Reactivar'}
              </Button>
            </>
          ) : null}
          {puedeBolsa && !c.es_interno ? (
            <Button variant="outline" onClick={() => setAgregandoBolsa(true)}>
              Agregar bolsa
            </Button>
          ) : null}
        </div>
      </header>

      <Tabs value={pestana} onValueChange={setPestana} className="gap-4">
        <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto">
          {c.es_interno ? null : <TabsTrigger value="datos">Datos</TabsTrigger>}
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="ots">OT</TabsTrigger>
          {c.es_interno ? null : <TabsTrigger value="tarifas">Tarifas</TabsTrigger>}
        </TabsList>
        <TabsContent value="datos" className="flex flex-col gap-4">
          {c.bolsa.historial.length > 0 ? <Bolsa c={c} /> : null}
          <Condiciones c={c} />
        </TabsContent>
        <TabsContent value="contactos">
          <Contactos c={c} />
        </TabsContent>
        <TabsContent value="tickets">
          <Tarjeta
            titulo="Tickets"
            acciones={
              <Link
                to={`/tickets/tabla?cliente_id=${c.id}`}
                className="inline-flex min-h-11 items-center text-sm text-acento underline underline-offset-2 lg:min-h-0"
              >
                Ver todos en la tabla
              </Link>
            }
          >
            <TicketsDelCliente clienteId={c.id} />
          </Tarjeta>
        </TabsContent>
        <TabsContent value="ots">
          <Tarjeta
            titulo="Órdenes de trabajo"
            acciones={
              <Link
                to={`/ots?cliente_id=${c.id}`}
                className="inline-flex min-h-11 items-center text-sm text-acento underline underline-offset-2 lg:min-h-0"
              >
                Ver todas
              </Link>
            }
          >
            <OtsDelCliente clienteId={c.id} />
          </Tarjeta>
        </TabsContent>
        <TabsContent value="tarifas">
          <Tarifas c={c} puedeEditar={puedeEditarFicha} />
        </TabsContent>
      </Tabs>

      <DialogoCliente abierto={editando} alCambiar={setEditando} cliente={c} />
      <DialogoBolsa abierto={agregandoBolsa} alCambiar={setAgregandoBolsa} clienteId={c.id} />
    </div>
  );
}

// Ficha de `/clientes/:id`. En pantallas angostas se muestra sola, con "Volver a la lista".
export function ClienteFichaPage({ id }: { id: number }) {
  const consulta = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => obtenerCliente(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });

  return (
    <div className="flex flex-col gap-4">
      <Link to="/clientes" className="text-acento underline underline-offset-2 lg:hidden">
        Volver a la lista
      </Link>
      {consulta.isPending && consulta.fetchStatus !== 'idle' ? (
        <Cargando />
      ) : consulta.isError ? (
        consulta.error instanceof ErrorApi && consulta.error.status === 404 ? (
          <EstadoVacio titulo="Cliente no encontrado" />
        ) : (
          <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
        )
      ) : consulta.data ? (
        <Ficha c={consulta.data} />
      ) : (
        <EstadoVacio titulo="Cliente no encontrado" />
      )}
    </div>
  );
}
