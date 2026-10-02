import { ETIQUETA_EVENTO_AVISO } from '@zydesk/shared';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { PreferenciaFilaDatos, PreferenciasDatos } from '../api';

// La columna de correo no se muestra (ADR 0013); el resumen diario solo va por Telegram.
export function TablaPreferencias({
  preferencias,
  alCambiar,
}: {
  preferencias: PreferenciasDatos;
  alCambiar: (fila: PreferenciaFilaDatos) => void;
}) {
  const sinVinculo = !preferencias.telegram_vinculado;
  return (
    <Table aria-label="Preferencias de avisos">
      <TableHeader>
        <TableRow>
          <TableHead>Avisarme cuando</TableHead>
          <TableHead className="text-center">En la app</TableHead>
          <TableHead className="text-center">
            Telegram
            {sinVinculo ? (
              <span className="block text-xs font-normal text-tinta-3">
                Vincula Telegram para recibirlos
              </span>
            ) : null}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preferencias.filas.map((fila) => {
          const etiqueta = ETIQUETA_EVENTO_AVISO[fila.evento];
          return (
            <TableRow key={fila.evento}>
              <TableCell className="whitespace-normal">{etiqueta}</TableCell>
              <TableCell className="text-center">
                {fila.evento === 'resumen_diario' ? (
                  <span aria-hidden="true">—</span>
                ) : (
                  <Switch
                    checked={fila.app}
                    aria-label={`${etiqueta} en la app`}
                    onCheckedChange={(app) => alCambiar({ ...fila, app })}
                  />
                )}
              </TableCell>
              <TableCell className={cn('text-center', sinVinculo && 'opacity-50')}>
                <Switch
                  checked={fila.telegram}
                  aria-label={`${etiqueta} por Telegram`}
                  onCheckedChange={(telegram) => alCambiar({ ...fila, telegram })}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
