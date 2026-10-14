import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-sm border border-linea-campo bg-panel px-2.5 py-1 text-base transition-colors outline-none selection:bg-acento selection:text-white file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-tinta placeholder:text-tinta-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm lg:h-9',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
        'aria-invalid:border-plazo-vencido',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
