import { ETIQUETA_ESTADO_FACTURACION, type EstadoFacturacion } from '@zydesk/shared';
import { Pill, type TonoPill } from '@/components/dominio/Pill';

const TONO: Record<Exclude<EstadoFacturacion, 'no_aplica'>, TonoPill> = {
  pendiente: 'neutro',
  por_facturar: 'alta',
  facturada: 'resuelto',
};

export function PillFacturacion({ estado }: { estado: EstadoFacturacion }) {
  if (estado === 'no_aplica') {
    return <span className="text-sm text-tinta-3">{ETIQUETA_ESTADO_FACTURACION[estado]}</span>;
  }
  const etiqueta = ETIQUETA_ESTADO_FACTURACION[estado];
  return (
    <Pill tono={TONO[estado]}>
      {estado === 'por_facturar' ? <strong className="font-semibold">{etiqueta}</strong> : etiqueta}
    </Pill>
  );
}
