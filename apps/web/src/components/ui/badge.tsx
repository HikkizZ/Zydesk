import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors aria-invalid:border-plazo-vencido [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-acento text-white [a&]:hover:bg-acento/90',
        secondary: 'bg-panel-hundido text-tinta-2 [a&]:hover:bg-panel-hundido/70',
        destructive: 'bg-plazo-vencido text-white [a&]:hover:bg-plazo-vencido/90',
        outline: 'border-linea-fuerte text-tinta-2 [a&]:hover:bg-panel-hundido',
        ghost: '[a&]:hover:bg-panel-hundido',
        link: 'text-acento underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
