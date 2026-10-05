import { Camera, MessageSquarePlus } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Redactor } from '@/components/dominio/Redactor';
import { Button } from '@/components/ui/button';
import { useEsMovil } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';

// `className` va en el contenedor raíz: la página lo usa para ubicarlo en su grilla (`order`, columnas). Debe
// ser la raíz porque la barra es `sticky` y solo se pega dentro del contenedor de la página.
type PropsRedactor = ComponentProps<typeof Redactor> & { className?: string };

// Escritorio: el `Redactor` tal cual. Móvil: una barra fija de una fila (escribir o tomar foto) que, al
// abrirse, se vuelve el redactor completo, estático (un `textarea` fijo se descoloca con el teclado
// virtual de iOS; spec fase 8 §8.3).
export function RedactorPlegable({ className, ...props }: PropsRedactor) {
  const esMovil = useEsMovil();
  const [estado, setEstado] = useState<{ abierto: boolean; camara: boolean }>({
    abierto: false,
    camara: false,
  });

  if (!esMovil)
    return (
      <div className={className}>
        <Redactor {...props} />
      </div>
    );

  const cerrar = () => setEstado({ abierto: false, camara: false });

  if (estado.abierto) {
    return (
      <div className={cn('scroll-mt-4', className)}>
        <Redactor
          {...props}
          autoEnfocar
          abrirCamaraAlMontar={estado.camara}
          onCancelar={cerrar}
          onEnviado={() => {
            cerrar();
            props.onEnviado?.();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'sticky bottom-14 z-[5] -mx-6 border-t bg-fondo px-6 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]',
        className,
      )}
    >
      <div role="group" aria-label="Redactor" className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 justify-start"
          onClick={() => setEstado({ abierto: true, camara: false })}
        >
          <MessageSquarePlus aria-hidden="true" />
          Escribir seguimiento
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Tomar foto"
          onClick={() => setEstado({ abierto: true, camara: true })}
        >
          <Camera aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
