import { zodResolver } from '@hookform/resolvers/zod';
import { politicaContrasena } from '@zydesk/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Campo } from '@/components/dominio/Campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorApi } from '@/lib/api';
import { cambiarContrasena } from './api';
import { useYo, useSesion } from './SesionProvider';

export const MENSAJE_MOTIVO = {
  corta: 'Usa al menos 10 caracteres.',
  igual_correo: 'No uses tu correo como contraseña.',
  comun: 'Esa contraseña es demasiado común. Elige otra.',
} as const;

function esquema(correo: string) {
  return z
    .object({
      actual: z.string().min(1, 'Escribe tu contraseña actual'),
      nueva: z.string().min(1, 'Escribe la contraseña nueva').max(200),
      repetir: z.string().min(1, 'Repite la contraseña nueva'),
    })
    .superRefine((v, ctx) => {
      const politica = politicaContrasena(v.nueva, correo);
      if (v.nueva !== '' && !politica.ok) {
        ctx.addIssue({ code: 'custom', path: ['nueva'], message: MENSAJE_MOTIVO[politica.motivo] });
      } else if (v.nueva !== '' && v.nueva === v.actual) {
        ctx.addIssue({
          code: 'custom',
          path: ['nueva'],
          message: 'La nueva contraseña debe ser distinta de la actual',
        });
      }
      if (v.repetir !== '' && v.repetir !== v.nueva) {
        ctx.addIssue({
          code: 'custom',
          path: ['repetir'],
          message: 'Las contraseñas no coinciden',
        });
      }
    });
}

// Usado en /cambiar-contrasena y en /perfil. Al guardar, la API borra las demás sesiones y entrega una cookie nueva.
export function FormularioCambiarContrasena({ alExito }: { alExito?: () => void }) {
  const yo = useYo();
  const { recargar } = useSesion();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquema(yo.correo)),
    defaultValues: { actual: '', nueva: '', repetir: '' },
  });

  const enviar = handleSubmit(async ({ actual, nueva }) => {
    setErrorGeneral(null);
    try {
      await cambiarContrasena({ actual, nueva });
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'CONTRASENA_ACTUAL_INCORRECTA') {
        setError('actual', { message: 'La contraseña actual no es correcta' });
      } else if (err instanceof ErrorApi && err.codigo === 'CONTRASENA_DEBIL') {
        const motivo = err.detalles?.['motivo'] as keyof typeof MENSAJE_MOTIVO | undefined;
        setError('nueva', { message: (motivo && MENSAJE_MOTIVO[motivo]) || err.message });
      } else {
        setErrorGeneral(
          err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
        );
      }
      return;
    }
    reset();
    toast.success('Contraseña cambiada');
    await recargar();
    alExito?.();
  });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Contraseña actual" error={errors.actual?.message}>
        {(p) => (
          <Input type="password" autoComplete="current-password" {...p} {...register('actual')} />
        )}
      </Campo>
      <Campo
        etiqueta="Contraseña nueva"
        error={errors.nueva?.message}
        ayuda="Al menos 10 caracteres. No uses tu correo ni una contraseña común."
      >
        {(p) => <Input type="password" autoComplete="new-password" {...p} {...register('nueva')} />}
      </Campo>
      <Campo etiqueta="Repite la contraseña nueva" error={errors.repetir?.message}>
        {(p) => (
          <Input type="password" autoComplete="new-password" {...p} {...register('repetir')} />
        )}
      </Campo>
      {errorGeneral ? (
        <p role="alert" className="text-sm text-urgente">
          {errorGeneral}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}
