import { useMutation, useQueryClient } from '@tanstack/react-query';
import { esEtapaFinal } from '@zydesk/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { BotonConPista } from '@/components/dominio/BotonConPista';
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
import { usePermiso } from '@/features/auth/SesionProvider';
import {
  aprobarOt,
  cambiarEtapa,
  invalidarOt,
  type CambioEtapaOtDatos,
  type OtDatos,
} from '@/features/ots/api';
import { avisarErrorOt } from '@/features/ots/errores';
import { BotonCrearCotizacion } from './BotonCrearCotizacion';
import { DialogoAprobacionCliente } from './DialogoAprobacionCliente';
import { DialogoCancelarOt } from './DialogoCancelarOt';
import { DialogoCerrarOt } from './DialogoCerrarOt';
import { DialogoFacturar } from './DialogoFacturar';

type Dialogo = 'aprobacion' | 'cerrar' | 'facturar' | 'cancelar' | 'volver' | null;

// Acciones del encabezado de la OT según etapa, tipo y permisos (spec fase 3 §10.4).
export function AccionesOt({ ot }: { ot: OtDatos }) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const puedeAprobar = usePermiso('ots.aprobar');
  const puedeCerrar = usePermiso('ots.cerrar');
  const puedeFacturar = usePermiso('ots.facturar');
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const refrescar = () => invalidarOt(queryClient, ot.id, ot.ticket.id);
  const cambiar = useMutation({
    mutationFn: (entrada: CambioEtapaOtDatos) => cambiarEtapa(ot.id, entrada),
    onSuccess: async (_, entrada) => {
      toast.success(
        {
          borrador: 'OT devuelta a Borrador',
          en_ejecucion: 'OT en ejecución',
        }[entrada.etapa],
      );
      setDialogo(null);
      await refrescar();
    },
    onError: (err) => {
      setDialogo(null);
      avisarErrorOt(err, refrescar);
    },
  });
  const aprobar = useMutation({
    mutationFn: (iniciar: boolean) => aprobarOt(ot.id, { iniciar }),
    onSuccess: async () => {
      toast.success('OT aprobada');
      await refrescar();
    },
    onError: (err) => avisarErrorOt(err, refrescar),
  });
  const ocupado = cambiar.isPending || aprobar.isPending;

  const final = esEtapaFinal(ot.etapa);
  const facturable = ot.tipo === 'facturable';
  const botones: React.ReactNode[] = [];

  if (puedeEditar && !final) {
    // Facturable en Borrador: el camino al cotizador (la OT pasa a Cotizada al marcar la cotización como enviada).
    if (facturable && ot.etapa === 'borrador' && ot.puede_cotizar) {
      if (!ot.cotizacion) {
        botones.push(<BotonCrearCotizacion key="crear-cotizacion" ot={ot} />);
      } else if (ot.cotizacion.estado === 'borrador') {
        botones.push(
          <Button key="revisar-cotizacion" asChild>
            <Link to={`/cotizaciones/${ot.cotizacion.id}`}>Revisar y enviar cotización</Link>
          </Button>,
        );
      }
    }
    if (ot.etapa === 'aprobada') {
      botones.push(
        <Button
          key="iniciar"
          type="button"
          disabled={ocupado}
          onClick={() => cambiar.mutate({ etapa: 'en_ejecucion' })}
        >
          Iniciar ejecución
        </Button>,
      );
    }
  }
  if (puedeAprobar && !final) {
    if (facturable && ot.etapa === 'cotizada') {
      botones.push(
        <BotonConPista
          key="aprobacion"
          type="button"
          disabled={ot.cotizacion?.estado !== 'enviada'}
          pista="Primero marca la cotización como enviada"
          onClick={() => setDialogo('aprobacion')}
        >
          Registrar aprobación del cliente…
        </BotonConPista>,
      );
    }
    if (!facturable && ot.etapa === 'borrador') {
      botones.push(
        <Button
          key="aprobar-iniciar"
          type="button"
          disabled={ocupado}
          onClick={() => aprobar.mutate(true)}
        >
          Aprobar e iniciar
        </Button>,
        <Button
          key="solo-aprobar"
          type="button"
          variant="outline"
          disabled={ocupado}
          onClick={() => aprobar.mutate(false)}
        >
          Solo aprobar
        </Button>,
      );
    }
  }
  if (puedeEditar && facturable && ot.etapa === 'cotizada') {
    botones.push(
      <Button
        key="borrador"
        type="button"
        variant="outline"
        disabled={ocupado}
        onClick={() =>
          ot.cotizacion?.estado === 'enviada'
            ? setDialogo('volver')
            : cambiar.mutate({ etapa: 'borrador' })
        }
      >
        Volver a borrador
      </Button>,
    );
  }
  if (puedeCerrar && ot.etapa === 'en_ejecucion') {
    botones.push(
      <Button key="cerrar" type="button" onClick={() => setDialogo('cerrar')}>
        Cerrar OT…
      </Button>,
    );
  }
  if (puedeFacturar && ot.etapa === 'cerrada' && ot.estado_facturacion === 'por_facturar') {
    botones.push(
      <Button key="facturar" type="button" onClick={() => setDialogo('facturar')}>
        Marcar facturada…
      </Button>,
    );
  }
  if (puedeCerrar && !final) {
    botones.push(
      <Button key="cancelar" type="button" variant="outline" onClick={() => setDialogo('cancelar')}>
        Cancelar OT…
      </Button>,
    );
  }

  const pendienteDeAprobar =
    !facturable && ot.etapa === 'borrador' && !puedeAprobar ? (
      <span className="text-sm text-tinta-2">
        Pendiente de aprobación{ot.aprobador ? ` de ${ot.aprobador.nombre}` : ''}
      </span>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {botones}
      {pendienteDeAprobar}
      {!puedeEditar ? <span className="text-sm text-tinta-2">Solo lectura</span> : null}

      <DialogoAprobacionCliente
        ot={ot}
        abierto={dialogo === 'aprobacion'}
        onCerrar={() => setDialogo(null)}
      />
      <DialogoCerrarOt ot={ot} abierto={dialogo === 'cerrar'} onCerrar={() => setDialogo(null)} />
      <DialogoFacturar ot={ot} abierto={dialogo === 'facturar'} onCerrar={() => setDialogo(null)} />
      <DialogoCancelarOt
        ot={ot}
        abierto={dialogo === 'cancelar'}
        onCerrar={() => setDialogo(null)}
      />
      <AlertDialog open={dialogo === 'volver'} onOpenChange={(a) => !a && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Volver a borrador</AlertDialogTitle>
            <AlertDialogDescription>
              La cotización{' '}
              {ot.cotizacion ? `${ot.cotizacion.codigo} v${ot.cotizacion.version}` : ''} quedará{' '}
              <strong>rechazada</strong>; podrás duplicarla como v
              {ot.cotizacion ? ot.cotizacion.version + 1 : 2}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cambiar.isPending}
              onClick={(e) => {
                e.preventDefault();
                cambiar.mutate({ etapa: 'borrador' });
              }}
            >
              Volver a borrador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
