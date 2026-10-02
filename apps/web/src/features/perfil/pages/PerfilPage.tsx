import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_ROL } from '@zydesk/shared';
import { Bot } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Avatar } from '@/components/dominio/Avatar';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { Pill } from '@/components/dominio/Pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cerrarOtras, cerrarSesion, salir, sesiones } from '@/features/auth/api';
import { FormularioCambiarContrasena } from '@/features/auth/FormularioCambiarContrasena';
import { useYo } from '@/features/auth/SesionProvider';
import { formatearFechaHora } from '@/lib/fechas';
import { nombreDispositivo } from '../dispositivo';

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-borde bg-superficie p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm text-tinta-2">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

function SesionesActivas() {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: ['sesiones'], queryFn: sesiones });
  const alFallar = (err: unknown) => toast.error(mensajeDeError(err));
  const cerrar = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => {
      toast.success('Sesión cerrada');
      return queryClient.invalidateQueries({ queryKey: ['sesiones'] });
    },
    onError: alFallar,
  });
  const cerrarLasDemas = useMutation({
    mutationFn: cerrarOtras,
    onSuccess: ({ cerradas }) => {
      toast.success(cerradas === 1 ? 'Se cerró 1 sesión' : `Se cerraron ${cerradas} sesiones`);
      return queryClient.invalidateQueries({ queryKey: ['sesiones'] });
    },
    onError: alFallar,
  });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    return <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  }
  const hayOtras = consulta.data.some((s) => !s.actual);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dispositivo</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.origen === 'bot' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Bot size={16} strokeWidth={1.5} aria-hidden="true" />
                        Bot de Telegram
                      </span>
                    ) : (
                      <span>{nombreDispositivo(s.user_agent)}</span>
                    )}
                    {s.actual ? <Pill tono="acento">Esta sesión</Pill> : null}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.ip ?? '—'}</TableCell>
                <TableCell>{formatearFechaHora(s.creada_en)}</TableCell>
                <TableCell>{formatearFechaHora(s.ultimo_uso)}</TableCell>
                <TableCell>{formatearFechaHora(s.expira_en)}</TableCell>
                <TableCell>
                  {s.actual ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cerrar.isPending}
                      onClick={() => cerrar.mutate(s.id)}
                    >
                      Cerrar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={!hayOtras}>
              Cerrar las demás
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar las demás sesiones?</AlertDialogTitle>
              <AlertDialogDescription>
                Se cerrará la sesión en todos los otros dispositivos. Esta sesión se mantiene.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => cerrarLasDemas.mutate()}>
                Cerrar las demás
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

export function PerfilPage() {
  const yo = useYo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function cerrarSesionActual() {
    try {
      await salir();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(['yo'], null);
      void navigate('/ingresar', { replace: true });
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <TituloPagina titulo="Perfil" />
      <Tarjeta titulo="Tus datos">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar iniciales={yo.iniciales} color={yo.color_avatar} className="size-14 text-lg" />
          <dl className="grid flex-1 gap-4 sm:grid-cols-2">
            <Dato etiqueta="Nombre" valor={yo.nombre} />
            <Dato etiqueta="Correo" valor={yo.correo} />
            <Dato etiqueta="Rol" valor={ETIQUETA_ROL[yo.rol]} />
            <Dato etiqueta="Departamento" valor={yo.departamento?.nombre ?? 'Sin departamento'} />
          </dl>
        </div>
        <p className="mt-4 text-sm text-tinta-2">Pide a Administración para cambiar estos datos</p>
      </Tarjeta>
      <Tarjeta titulo="Sesiones activas">
        <SesionesActivas />
      </Tarjeta>
      <Tarjeta titulo="Cambiar contraseña">
        <div className="max-w-md">
          <FormularioCambiarContrasena />
        </div>
      </Tarjeta>
      <div>
        <Button variant="outline" onClick={() => void cerrarSesionActual()}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
