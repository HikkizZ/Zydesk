import type { TipoOt } from '@zydesk/shared';
import { Chip } from '@/components/dominio/Chip';

export function PillTipoOt({ tipo }: { tipo: TipoOt }) {
  return tipo === 'facturable' ? (
    <Chip tono="suave-ok">Facturable</Chip>
  ) : (
    <Chip tono="interna" punto>
      Interna
    </Chip>
  );
}
