import { ETIQUETA_ESTADO_FACTURACION, type EstadoFacturacion } from '@zydesk/shared';
import { Chip } from '@/components/dominio/Chip';
import { Estado } from '@/components/dominio/Estado';

export function PillFacturacion({ estado }: { estado: EstadoFacturacion }) {
  if (estado === 'no_aplica') {
    return <span className="text-sm text-tinta-3">{ETIQUETA_ESTADO_FACTURACION[estado]}</span>;
  }
  const etiqueta = ETIQUETA_ESTADO_FACTURACION[estado];
  // «Por facturar» es la única que pide acción: chip con fondo; las demás, punto + texto.
  if (estado === 'por_facturar') {
    return (
      <Chip tono="suave-atento">
        <strong className="font-medium">{etiqueta}</strong>
      </Chip>
    );
  }
  return <Estado tono={estado === 'facturada' ? 'facturada' : 'borrador'}>{etiqueta}</Estado>;
}
