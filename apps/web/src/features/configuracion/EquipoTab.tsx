import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_ROL,
  MATRIZ_VISIBLE,
  ROLES,
  tienePermiso,
  type Rol,
  type UsuarioSalidaDatos,
} from '@zydesk/shared';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/dominio/Avatar';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError, mensajeDeError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorApi } from '@/lib/api';
import {
  departamentos,
  desactivarUsuario,
  editarUsuario,
  reactivarUsuario,
  restablecerContrasena,
  usuarios,
} from './api';
import { FormularioUsuario, SIN_DEPARTAMENTO, type TemporalGenerada } from './FormularioUsuario';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

function mensajeUsuario(err: unknown): string {
  if (err instanceof ErrorApi && err.codigo === 'CONFLICTO') {
    const motivo = err.detalles?.['motivo'];
    if (motivo === 'propio') return 'No puedes desactivar tu propia cuenta';
    if (motivo === 'ultimo_admin') {
      return 'Debe quedar al menos una persona activa con rol Administración';
    }
  }
  return mensajeDeError(err);
}

type Dialogo =
  | { tipo: 'crear' }
  | { tipo: 'editar'; usuario: UsuarioSalidaDatos }
  | { tipo: 'restablecer'; usuario: UsuarioSalidaDatos }
  | { tipo: 'rol'; usuario: UsuarioSalidaDatos; rol: Rol };

// La contraseña temporal se muestra una sola vez: al cerrar este diálogo ya no existe en la pantalla.
export function DialogoTemporal({
  temporal,
  alCerrar,
}: {
  temporal: TemporalGenerada;
  alCerrar: () => void;
}) {
  const [copiada, setCopiada] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(temporal.contrasena);
      setCopiada(true);
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
    }
  }
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contraseña temporal</DialogTitle>
          <DialogDescription>
            Entrégasela a {temporal.nombre} ({temporal.correo}). Solo se muestra esta vez y deberá
            cambiarla al ingresar.
          </DialogDescription>
        </DialogHeader>
        <p
          data-testid="contrasena-temporal"
          className="rounded-md border border-borde-campo bg-superficie-suave px-3 py-2 font-mono text-lg select-all"
        >
          {temporal.contrasena}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copiar()}>
            {copiada ? 'Copiada' : 'Copiar'}
          </Button>
          <Button type="button" onClick={alCerrar}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EquipoTab() {
  const queryClient = useQueryClient();
  const [inactivos, setInactivos] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [temporal, setTemporal] = useState<TemporalGenerada | null>(null);

  const filtros = inactivos ? {} : { activo: 'true' as const };
  const consulta = useQuery({ queryKey: ['usuarios', filtros], queryFn: () => usuarios(filtros) });
  const consultaDeps = useQuery({ queryKey: ['departamentos'], queryFn: departamentos });

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    void queryClient.invalidateQueries({ queryKey: ['departamentos'] });
    void queryClient.invalidateQueries({ queryKey: ['yo'] });
  };
  const alFallar = (err: unknown) => toast.error(mensajeUsuario(err));

  const cambiarDepartamento = useMutation({
    mutationFn: ({ id, departamento }: { id: number; departamento: string }) =>
      editarUsuario(id, {
        departamento_id: departamento === SIN_DEPARTAMENTO ? null : Number(departamento),
      }),
    onSuccess: async () => {
      toast.success('Departamento actualizado');
      await refrescar();
    },
    onError: alFallar,
  });
  const cambiarRol = useMutation({
    mutationFn: ({ id, rol }: { id: number; rol: Rol }) => editarUsuario(id, { rol }),
    onSuccess: async () => {
      toast.success('Rol actualizado');
      await refrescar();
    },
    onError: alFallar,
  });
  const alternarActivo = useMutation({
    mutationFn: (u: UsuarioSalidaDatos) =>
      u.activo ? desactivarUsuario(u.id) : reactivarUsuario(u.id),
    onSuccess: async (u) => {
      toast.success(u.activo ? 'Persona reactivada' : 'Persona desactivada');
      await refrescar();
    },
    onError: alFallar,
  });
  const restablecer = useMutation({
    mutationFn: (u: UsuarioSalidaDatos) =>
      restablecerContrasena(u.id).then((r) => ({ u, contrasena: r.contrasena_temporal })),
    onSuccess: ({ u, contrasena }) => {
      setTemporal({ nombre: u.nombre, correo: u.correo, contrasena });
      return refrescar();
    },
    onError: alFallar,
  });

  const deps = consultaDeps.data ?? [];
  const opcionesDeps = [
    { valor: SIN_DEPARTAMENTO, etiqueta: 'Sin departamento' },
    ...deps.map((d) => ({ valor: String(d.id), etiqueta: d.nombre })),
  ];

  let lista;
  if (consulta.isPending) lista = <Cargando />;
  else if (consulta.isError) {
    lista = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.length === 0) {
    lista = <EstadoVacio titulo="Aún no hay personas en el equipo" />;
  } else {
    lista = (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar iniciales={u.iniciales} color={u.color_avatar} />
                    <div>
                      <div className="font-medium">{u.nombre}</div>
                      <div className="text-sm text-tinta-2">{u.correo}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-44">
                  <Seleccion
                    etiqueta={`Departamento de ${u.nombre}`}
                    valor={String(u.departamento_id ?? SIN_DEPARTAMENTO)}
                    opciones={opcionesDeps}
                    disabled={cambiarDepartamento.isPending}
                    alCambiar={(departamento) =>
                      cambiarDepartamento.mutate({ id: u.id, departamento })
                    }
                  />
                </TableCell>
                <TableCell className="min-w-44">
                  <Seleccion
                    etiqueta={`Rol de ${u.nombre}`}
                    valor={u.rol}
                    opciones={ROLES.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
                    alCambiar={(rol) => {
                      if (rol !== u.rol) setDialogo({ tipo: 'rol', usuario: u, rol: rol as Rol });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Pill tono={u.activo ? 'resuelto' : 'neutro'}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </Pill>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Acciones de ${u.nombre}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setDialogo({ tipo: 'restablecer', usuario: u })}
                      >
                        Restablecer contraseña
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'editar', usuario: u })}>
                        Editar nombre/correo/color
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => alternarActivo.mutate(u)}>
                        {u.activo ? 'Desactivar' : 'Reactivar'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta
        titulo={consulta.data ? `Equipo · ${consulta.data.length} personas` : 'Equipo'}
        acciones={
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="ver-inactivos" checked={inactivos} onCheckedChange={setInactivos} />
              <Label htmlFor="ver-inactivos">Mostrar inactivos</Label>
            </div>
            <Button onClick={() => setDialogo({ tipo: 'crear' })}>+ Agregar persona</Button>
          </div>
        }
      >
        {lista}
        <p className="mt-4 text-sm">
          <Link to="/configuracion/ingresos" className="text-acento underline">
            Ver ingresos y registro de seguridad
          </Link>
        </p>
      </Tarjeta>

      <Tarjeta titulo="Qué puede hacer cada rol">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Acción</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">
                    {ETIQUETA_ROL[r]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIZ_VISIBLE.map((fila) => (
                <TableRow key={fila.etiqueta}>
                  <TableCell>{fila.etiqueta}</TableCell>
                  {ROLES.map((r) => {
                    const permitido = tienePermiso(r, fila.permiso);
                    return (
                      <TableCell
                        key={r}
                        aria-label={permitido ? 'Permitido' : 'No permitido'}
                        className={
                          permitido
                            ? 'text-center font-semibold text-resuelto'
                            : 'text-center text-tinta-2'
                        }
                      >
                        {permitido ? '✓' : '–'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Tarjeta>

      {dialogo?.tipo === 'crear' ? (
        <FormularioUsuario
          departamentos={deps}
          alCerrar={() => setDialogo(null)}
          alCrear={setTemporal}
        />
      ) : null}
      {dialogo?.tipo === 'editar' ? (
        <FormularioUsuario
          usuario={dialogo.usuario}
          departamentos={deps}
          alCerrar={() => setDialogo(null)}
        />
      ) : null}

      <AlertDialog
        open={dialogo?.tipo === 'rol'}
        onOpenChange={(abierto) => !abierto && setDialogo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar el rol cierra las sesiones de esta persona</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogo?.tipo === 'rol'
                ? `${dialogo.usuario.nombre} pasará a ${ETIQUETA_ROL[dialogo.rol]} y tendrá que volver a ingresar.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialogo?.tipo === 'rol') {
                  cambiarRol.mutate({ id: dialogo.usuario.id, rol: dialogo.rol });
                }
              }}
            >
              Cambiar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialogo?.tipo === 'restablecer'}
        onOpenChange={(abierto) => !abierto && setDialogo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer la contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogo?.tipo === 'restablecer'
                ? `Se generará una contraseña temporal para ${dialogo.usuario.nombre} y se cerrarán sus sesiones.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialogo?.tipo === 'restablecer') restablecer.mutate(dialogo.usuario);
              }}
            >
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {temporal ? <DialogoTemporal temporal={temporal} alCerrar={() => setTemporal(null)} /> : null}
    </div>
  );
}
