import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Folio en mono con cifras tabulares; en cabeceras de detalle: `className="text-sm text-tinta"`.
export function Codigo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-mono className={cn('font-mono text-xs tabular-nums text-tinta-2', className)}>
      {children}
    </span>
  );
}
