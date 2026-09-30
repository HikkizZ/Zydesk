import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export interface PropsControl {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

// Etiqueta + control + ayuda + error (p. ej. de React Hook Form). El control recibe `id` y las
// propiedades `aria-*` que debe aplicar:
//   <Campo etiqueta="Correo" error={errors.correo?.message}>
//     {(p) => <Input {...p} {...register('correo')} />}
//   </Campo>
export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string | undefined;
  children: (props: PropsControl) => ReactNode;
}) {
  const id = useId();
  const idMensaje = `${id}-msg`;
  const describe = error || ayuda ? idMensaje : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describe })}
      {error ? (
        <p id={idMensaje} role="alert" className="text-sm text-urgente">
          {error}
        </p>
      ) : ayuda ? (
        <p id={idMensaje} className="text-sm text-tinta-2">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
