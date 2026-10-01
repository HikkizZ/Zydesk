import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_FORMA_APROBACION, FORMAS_APROBACION, type FormaAprobacion } from '@zydesk/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { SubidaArchivos } from '@/components/dominio/SubidaArchivos';
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
import { cliente as obtenerCliente } from '@/features/clientes/api';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { invalidarOt, registrarAprobacion, type OtDatos } from '@/features/ots/api';
import { esDesactualizada, mensajeDeOt } from '@/features/ots/errores';
import { quitarArchivoPendiente, type ArchivoDatos } from '@/features/tickets/api';

function Contenido({ ot, onCerrar }: { ot: OtDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const cliente = useQuery({
    queryKey: ['cliente', ot.cliente_id],
    queryFn: () => obtenerCliente(ot.cliente_id as number),
    enabled: ot.cliente_id !== null,
    staleTime: 60_000,
  });
  const contactos = (cliente.data?.contactos ?? []).filter((c) => c.activo);
  const [contactoId, setContactoId] = useState(ot.contacto?.id ? String(ot.contacto.id) : '');
  const [fecha, setFecha] = useState(hoyIso());
  const [forma, setForma] = useState<FormaAprobacion>('orden_de_compra');
  const [respaldo, setRespaldo] = useState<ArchivoDatos[]>([]);
  const [iniciar, setIniciar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El respaldo es un solo archivo: si se elige otro, el anterior se descarta.
  const alCambiarRespaldo = (archivos: ArchivoDatos[]) => {
    const sobrantes = archivos.slice(0, -1);
    for (const a of sobrantes) void quitarArchivoPendiente(a.id).catch(() => undefined);
    setRespaldo(archivos.slice(-1));
  };

  const archivo = respaldo[0];
  const listo = contactoId !== '' && fecha !== '' && archivo !== undefined;

  const registrar = useMutation({
    mutationFn: () =>
      registrarAprobacion(ot.id, {
        contacto_id: Number(contactoId),
        fecha,
        forma,
        archivo_id: (archivo as ArchivoDatos).id,
        iniciar,
      }),
    onSuccess: async () => {
      toast.success('Aprobación del cliente registrada');
      await invalidarOt(queryClient, ot.id, ot.ticket.id);
      onCerrar();
    },
    onError: (err) => {
      if (esDesactualizada(err)) {
        toast.error(mensajeDeOt(err));
        void invalidarOt(queryClient, ot.id, ot.ticket.id);
        onCerrar();
      } else {
        setError(mensajeDeOt(err));
      }
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar aprobación del cliente</DialogTitle>
        <DialogDescription>
          Adjunta el respaldo (orden de compra, correo o cotización firmada). Es obligatorio.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (listo) registrar.mutate();
        }}
      >
        <Campo
          etiqueta="Contacto que aprueba"
          {...(cliente.isSuccess && contactos.length === 0
            ? { error: 'El cliente no tiene contactos. Agrégalos en su ficha.' }
            : {})}
        >
          {(p) => (
            <Seleccion
              id={p.id}
              etiqueta="Contacto que aprueba"
              valor={contactoId === '' ? '__ninguno__' : contactoId}
              alCambiar={(v) => setContactoId(v === '__ninguno__' ? '' : v)}
              opciones={[
                { valor: '__ninguno__', etiqueta: 'Elegir…' },
                ...contactos.map((c) => ({
                  valor: String(c.id),
                  etiqueta: c.aprueba_cotizaciones ? `${c.nombre} · aprueba` : c.nombre,
                })),
              ]}
            />
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Fecha de la aprobación">
            {(p) => (
              <Input
                {...p}
                type="date"
                value={fecha}
                max={hoyIso()}
                onChange={(e) => setFecha(e.target.value)}
              />
            )}
          </Campo>
          <Campo etiqueta="Forma">
            {(p) => (
              <Seleccion
                id={p.id}
                etiqueta="Forma"
                valor={forma}
                alCambiar={(v) => setForma(v as FormaAprobacion)}
                opciones={FORMAS_APROBACION.map((f) => ({
                  valor: f,
                  etiqueta: ETIQUETA_FORMA_APROBACION[f],
                }))}
              />
            )}
          </Campo>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Respaldo</span>
          <SubidaArchivos archivos={respaldo} onChange={alCambiarRespaldo} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="iniciar-ejecucion"
            checked={iniciar}
            onCheckedChange={(v) => setIniciar(v === true)}
            className="size-5"
          />
          <Label htmlFor="iniciar-ejecucion">Iniciar la ejecución al registrar</Label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!listo || registrar.isPending}>
            {registrar.isPending ? 'Registrando…' : 'Registrar aprobación'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function DialogoAprobacionCliente({
  ot,
  abierto,
  onCerrar,
}: {
  ot: OtDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {abierto ? <Contenido ot={ot} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
