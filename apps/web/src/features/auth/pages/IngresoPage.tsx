import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IngresoEntrada } from '@zydesk/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Pie } from '@/app/layout/Pie';
import { TituloPagina } from '@/app/TituloPagina';
import { Campo } from '@/components/dominio/Campo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorApi } from '@/lib/api';
import { formatearHora } from '@/lib/fechas';
import { ingresar, marca } from '../api';
import { useSesion, volverSeguro } from '../SesionProvider';

type Formulario = z.input<typeof IngresoEntrada>;

function mensajeDeIngreso(err: unknown): string {
  if (err instanceof ErrorApi) {
    if (err.codigo === 'CREDENCIALES_INVALIDAS') return 'Correo o contraseña incorrectos';
    if (err.codigo === 'INGRESO_BLOQUEADO') {
      const cuando = err.detalles?.['reintentar_en'];
      return typeof cuando === 'string'
        ? `Demasiados intentos. Vuelve a intentarlo a las ${formatearHora(cuando)}`
        : 'Demasiados intentos. Vuelve a intentarlo más tarde.';
    }
    return err.message;
  }
  return 'No se pudo conectar. Intenta de nuevo.';
}

function Monograma({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  if (logoUrl) return <img src={logoUrl} alt="" className="size-10 rounded-md object-contain" />;
  return (
    <span
      aria-hidden="true"
      className="flex size-10 items-center justify-center rounded-md bg-acento font-titulo text-xl font-bold text-white"
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

export function IngresoPage() {
  const { yo } = useSesion();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const volver = volverSeguro(params.get('volver'));
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const datosMarca = useQuery({ queryKey: ['marca'], queryFn: marca, staleTime: 5 * 60_000 });
  const nombreApp = datosMarca.data?.nombre_app ?? 'Zydesk';
  const logoUrl = datosMarca.data?.logo_url ?? null;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(IngresoEntrada),
    defaultValues: { correo: '', contrasena: '', mantener: false },
  });

  if (yo) return <Navigate to={volver ?? '/mi-dia'} replace />;

  const enviar = handleSubmit(async (valores) => {
    setError(null);
    try {
      const respuesta = await ingresar({ ...valores, mantener: valores.mantener ?? false });
      // `yo` queda cargado: la redirección a `volver` (o Mi día) la hace el <Navigate> de arriba.
      queryClient.setQueryData(['yo'], respuesta);
    } catch (err) {
      setError(mensajeDeIngreso(err));
    }
  });

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <section className="flex h-24 items-center gap-3 bg-tinta px-6 lg:h-auto lg:flex-col lg:items-start lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <Monograma nombre={nombreApp} logoUrl={logoUrl} />
          <span className="font-titulo text-xl font-bold text-fondo">{nombreApp}</span>
        </div>
        <div className="hidden lg:block">
          <p className="max-w-md font-titulo text-[40px] font-bold leading-tight text-fondo">
            Cada ticket, quién lo tiene y en qué va.
          </p>
          <p className="mt-4 max-w-md text-fondo/80">
            Tickets, órdenes de trabajo y cotizaciones del equipo en un solo lugar.
          </p>
        </div>
        <p className="hidden text-sm text-fondo/50 lg:block">{nombreApp}</p>
      </section>

      <section className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] rounded-lg border border-borde bg-superficie p-6 sm:p-8">
          <TituloPagina titulo="Ingresar" />
          <p className="mb-6 mt-1 text-tinta-2">Usa tu cuenta de trabajo.</p>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            <Campo etiqueta="Correo" error={errors.correo?.message}>
              {(p) => <Input type="email" autoComplete="username" {...p} {...register('correo')} />}
            </Campo>
            <div className="flex flex-col gap-1.5">
              <Campo etiqueta="Contraseña" error={errors.contrasena?.message}>
                {(p) => (
                  <div className="flex gap-2">
                    <Input
                      type={mostrar ? 'text' : 'password'}
                      autoComplete="current-password"
                      {...p}
                      {...register('contrasena')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-pressed={mostrar}
                      onClick={() => setMostrar((v) => !v)}
                    >
                      {mostrar ? 'Ocultar' : 'Mostrar'}
                    </Button>
                  </div>
                )}
              </Campo>
              <p className="text-sm text-tinta-2">
                ¿La olvidaste? Pide a Administración que la restablezca.
              </p>
            </div>
            <div className="flex min-h-11 items-center gap-2">
              <Controller
                control={control}
                name="mantener"
                render={({ field }) => (
                  <Checkbox
                    id="mantener"
                    checked={field.value ?? false}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <Label htmlFor="mantener" className="min-h-11 flex-1">
                Mantener sesión iniciada en este equipo
              </Label>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-urgente">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
          <p className="mt-6 text-sm text-tinta-2">
            ¿No tienes cuenta? Las cuentas las crea quien administra {nombreApp} en tu equipo.
          </p>
        </div>
        <Pie nombreApp={nombreApp} className="mt-6" />
      </section>
    </div>
  );
}
