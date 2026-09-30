import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_ROL,
  ROLES,
  type DepartamentoSalidaDatos,
  type UsuarioSalidaDatos,
} from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Campo } from '@/components/dominio/Campo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorApi } from '@/lib/api';
import { crearUsuario, editarUsuario } from './api';
import { generarTemporal } from './contrasena';
import { Seleccion } from './Seleccion';

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(120, 'Máximo 120 caracteres'),
  correo: z
    .string()
    .trim()
    .min(1, 'Escribe el correo')
    .max(200, 'Máximo 200 caracteres')
    .email('Escribe un correo válido'),
  rol: z.enum(ROLES),
  departamento: z.string(),
  color_avatar: z.string(),
});
type Formulario = z.infer<typeof esquema>;

export const SIN_DEPARTAMENTO = 'ninguno';

export interface TemporalGenerada {
  nombre: string;
  correo: string;
  contrasena: string;
}

// Crea (sin `usuario`) o edita nombre, correo y color (con `usuario`).
export function FormularioUsuario({
  usuario,
  departamentos,
  alCerrar,
  alCrear,
}: {
  usuario?: UsuarioSalidaDatos;
  departamentos: DepartamentoSalidaDatos[];
  alCerrar: () => void;
  alCrear?: (temporal: TemporalGenerada) => void;
}) {
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombre: usuario?.nombre ?? '',
      correo: usuario?.correo ?? '',
      rol: usuario?.rol ?? 'tecnico',
      departamento: String(usuario?.departamento_id ?? SIN_DEPARTAMENTO),
      color_avatar: usuario?.color_avatar.toLowerCase() ?? '#cfddf3',
    },
  });

  const guardar = useMutation({
    mutationFn: async (v: Formulario) => {
      if (usuario) {
        await editarUsuario(usuario.id, {
          nombre: v.nombre,
          correo: v.correo,
          color_avatar: v.color_avatar,
        });
        return null;
      }
      const temporal = generarTemporal(v.correo);
      await crearUsuario({
        nombre: v.nombre,
        correo: v.correo,
        rol: v.rol,
        departamento_id: v.departamento === SIN_DEPARTAMENTO ? null : Number(v.departamento),
        contrasena_temporal: temporal,
      });
      return { nombre: v.nombre, correo: v.correo.toLowerCase(), contrasena: temporal };
    },
    onSuccess: async (temporal) => {
      await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      if (usuario) void queryClient.invalidateQueries({ queryKey: ['yo'] });
      alCerrar();
      if (temporal) alCrear?.(temporal);
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
        setError('correo', { message: 'Ya existe una persona con ese correo' });
      } else {
        setErrorGeneral(
          err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
        );
      }
    },
  });

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{usuario ? 'Editar persona' : 'Agregar persona'}</DialogTitle>
          <DialogDescription>
            {usuario
              ? 'Cambia el nombre, el correo o el color del avatar.'
              : 'Se genera una contraseña temporal que verás una sola vez.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            setErrorGeneral(null);
            void handleSubmit((v) => guardar.mutate(v))(e);
          }}
          className="flex flex-col gap-4"
        >
          <Campo etiqueta="Nombre" error={errors.nombre?.message}>
            {(p) => <Input autoComplete="off" {...p} {...register('nombre')} />}
          </Campo>
          <Campo etiqueta="Correo" error={errors.correo?.message}>
            {(p) => <Input type="email" autoComplete="off" {...p} {...register('correo')} />}
          </Campo>
          {usuario ? (
            <Campo etiqueta="Color del avatar">
              {(p) => (
                <Input type="color" className="w-20 p-1" {...p} {...register('color_avatar')} />
              )}
            </Campo>
          ) : (
            <>
              <Campo etiqueta="Rol">
                {(p) => (
                  <Controller
                    control={control}
                    name="rol"
                    render={({ field }) => (
                      <Seleccion
                        id={p.id}
                        valor={field.value}
                        alCambiar={field.onChange}
                        opciones={ROLES.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
                      />
                    )}
                  />
                )}
              </Campo>
              <Campo etiqueta="Departamento">
                {(p) => (
                  <Controller
                    control={control}
                    name="departamento"
                    render={({ field }) => (
                      <Seleccion
                        id={p.id}
                        valor={field.value}
                        alCambiar={field.onChange}
                        opciones={[
                          { valor: SIN_DEPARTAMENTO, etiqueta: 'Sin departamento' },
                          ...departamentos.map((d) => ({
                            valor: String(d.id),
                            etiqueta: d.nombre,
                          })),
                        ]}
                      />
                    )}
                  />
                )}
              </Campo>
            </>
          )}
          {errorGeneral ? (
            <p role="alert" className="text-sm text-urgente">
              {errorGeneral}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : usuario ? 'Guardar' : 'Agregar persona'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
