import type { TipoOt } from '@zydesk/shared';
import { Pill } from '@/components/dominio/Pill';

export function PillTipoOt({ tipo }: { tipo: TipoOt }) {
  return tipo === 'facturable' ? (
    <Pill tono="resuelto">Facturable</Pill>
  ) : (
    <Pill tono="interna">Interna</Pill>
  );
}
