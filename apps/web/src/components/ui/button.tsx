import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-plazo-vencido [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-acento text-white hover:bg-acento/90',
        destructive: 'bg-plazo-vencido text-white hover:bg-plazo-vencido/90',
        outline: 'border border-linea-fuerte bg-panel hover:bg-panel-hundido',
        secondary: 'bg-panel-hundido text-tinta-2 hover:bg-panel-hundido/70',
        ghost: 'hover:bg-panel-hundido',
        link: 'text-acento underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-3 text-sm lg:h-8 has-[>svg]:px-2.5',
        sm: 'h-11 gap-1.5 px-2.5 text-xs lg:h-7 has-[>svg]:px-2',
        icon: 'size-11 lg:size-8',
        'icon-sm': 'size-11 lg:size-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
