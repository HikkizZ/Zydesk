import type { ComponentProps } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

type Props = Pick<
  ComponentProps<typeof Checkbox>,
  'id' | 'checked' | 'disabled' | 'onCheckedChange' | 'aria-label'
> & { id: string };

// Casilla de 20 px dentro de un `label` de 44 × 44: el área táctil es la del `label` (ADR 0011).
export function CasillaTactil({ id, 'aria-label': ariaLabel, ...resto }: Props) {
  return (
    <label
      htmlFor={id}
      className="inline-flex size-11 shrink-0 items-center justify-center lg:size-9"
    >
      <Checkbox id={id} className="size-5" aria-label={ariaLabel} {...resto} />
    </label>
  );
}
