import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Sin modo oscuro (ADR 0011): tema fijo claro; sonner anuncia los toasts con aria-live.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'shadow-flotante',
          success: '[&_[data-icon]]:text-plazo-ok',
          error: '[&_[data-icon]]:text-plazo-vencido',
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--color-panel)',
          '--normal-text': 'var(--color-tinta)',
          '--normal-border': 'var(--color-linea-fuerte)',
          '--border-radius': 'var(--radius-md)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
