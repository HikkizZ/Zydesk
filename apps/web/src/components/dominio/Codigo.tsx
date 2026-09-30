import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Codigo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-sm', className)}>{children}</span>;
}
