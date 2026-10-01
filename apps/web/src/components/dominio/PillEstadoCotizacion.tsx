import { ETIQUETA_ESTADO_COTIZACION, type EstadoCotizacion } from '@zydesk/shared';
import { Pill, type TonoPill } from '@/components/dominio/Pill';

const TONO: Record<EstadoCotizacion, TonoPill> = {
  borrador: 'neutro',
  enviada: 'acento',
  aprobada: 'resuelto',
  rechazada: 'alta',
  reemplazada: 'neutro',
};

export function PillEstadoCotizacion({ estado }: { estado: EstadoCotizacion }) {
  const etiqueta = ETIQUETA_ESTADO_COTIZACION[estado];
  return (
    <Pill tono={TONO[estado]}>
      {estado === 'reemplazada' ? <span className="line-through">{etiqueta}</span> : etiqueta}
    </Pill>
  );
}
