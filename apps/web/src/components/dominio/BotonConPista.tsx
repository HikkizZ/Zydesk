import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Botón que, deshabilitado, explica por qué en un tooltip (un botón deshabilitado no recibe foco ni
// hover: el `span` con `tabIndex` sí).
export function BotonConPista({
  pista,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pista?: string | null | undefined }) {
  if (!disabled || !pista) return <Button disabled={disabled} {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Button disabled {...props} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{pista}</TooltipContent>
    </Tooltip>
  );
}
