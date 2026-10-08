import { ETIQUETA_ESTADO_COTIZACION, type EstadoCotizacion } from '@zydesk/shared';
import { Estado, type TonoEstado } from '@/components/dominio/Estado';

const TONO: Record<EstadoCotizacion, TonoEstado> = {
  borrador: 'borrador',
  enviada: 'en-curso',
  aprobada: 'resuelto',
  rechazada: 'en-espera',
  reemplazada: 'cerrado',
};

export function PillEstadoCotizacion({ estado }: { estado: EstadoCotizacion }) {
  const etiqueta = ETIQUETA_ESTADO_COTIZACION[estado];
  return (
    <Estado tono={TONO[estado]}>
      {estado === 'reemplazada' ? <span className="line-through">{etiqueta}</span> : etiqueta}
    </Estado>
  );
}
