import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { BotonConPista } from '@/components/dominio/BotonConPista';
import { mensajeDeError } from '@/components/dominio/EstadoError';
import { usePermiso } from '@/features/auth/SesionProvider';
import { clavesCotizacion, crearCotizacion, invalidarCotizacion } from '@/features/cotizador/api';
import { invalidarOt, type OtDatos } from '@/features/ots/api';

// Motivo por el que una OT no se puede cotizar, para el tooltip del botón deshabilitado.
export function motivoSinCotizar(ot: OtDatos, puedeEditar: boolean): string | null {
  if (!puedeEditar) return 'Solo lectura';
  if (ot.puede_cotizar) return null;
  if (ot.etapa !== 'borrador' && ot.etapa !== 'cotizada') return 'Solo en Borrador o Cotizada';
  if (!ot.cliente || ot.cliente.es_interno) return 'La OT necesita un cliente externo';
  return 'No se puede cotizar esta OT';
}

// "Crear cotización": crea la v1 en borrador y abre el cotizador (spec fase 4 §12).
export function BotonCrearCotizacion({
  ot,
  variant = 'default',
}: {
  ot: OtDatos;
  variant?: 'default' | 'outline';
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const puedeEditar = usePermiso('tickets.editar');
  const motivo = motivoSinCotizar(ot, puedeEditar);

  const crear = useMutation({
    mutationFn: () => crearCotizacion(ot.id),
    onSuccess: async (c) => {
      queryClient.setQueryData(clavesCotizacion.una(c.id), c);
      toast.success(`${c.codigo} v${c.version} creada`);
      navigate(`/cotizaciones/${c.id}`);
      await invalidarCotizacion(queryClient, c.id, ot.id, ot.ticket.id);
    },
    onError: (err) => {
      toast.error(mensajeDeError(err));
      void invalidarOt(queryClient, ot.id, ot.ticket.id);
    },
  });

  return (
    <BotonConPista
      type="button"
      variant={variant}
      disabled={motivo !== null || crear.isPending}
      pista={motivo}
      onClick={() => crear.mutate()}
    >
      Crear cotización
    </BotonConPista>
  );
}
