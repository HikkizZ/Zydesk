import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePermiso } from '@/features/auth/SesionProvider';
import { cn } from '@/lib/utils';
import { clientes, type ClienteResumenDatos } from '../api';
import { DialogoCliente } from '../components/DialogoCliente';
import { ClienteFichaPage } from './ClienteFichaPage';

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Para comparar RUT sin puntos ni guion y sin distinguir la K mayúscula o minúscula.
const soloRut = (s: string) => s.replace(/[.\s-]/g, '').toLowerCase();

function Grupo({
  titulo,
  filas,
  idActual,
}: {
  titulo: string;
  filas: ClienteResumenDatos[];
  idActual: number | null;
}) {
  if (filas.length === 0) return null;
  return (
    <section aria-label={titulo}>
      <h3 className="mb-1 px-3 text-xs font-semibold tracking-wide text-tinta-2 uppercase">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {filas.map((c) => {
          const secundario = [
            c.tickets_abiertos > 0
              ? `${c.tickets_abiertos} ${c.tickets_abiertos === 1 ? 'ticket abierto' : 'tickets abiertos'}`
              : null,
            c.tiene_bolsa ? 'bolsa de horas' : null,
            c.activo ? null : 'Inactivo',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={c.id}>
              <Link
                to={`/clientes/${c.id}`}
                aria-current={c.id === idActual ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-col justify-center rounded-md px-3 py-1.5 hover:bg-superficie-suave',
                  c.id === idActual && 'bg-superficie-suave',
                  c.activo ? '' : 'text-tinta-2',
                )}
              >
                <span className="font-medium">{c.nombre}</span>
                {secundario ? <span className="text-sm text-tinta-2">{secundario}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ClientesPage() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const idActual = idParam === undefined ? null : Number(idParam);
  const puedeCrear = usePermiso('config.editar');
  const [busqueda, setBusqueda] = useState('');
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    document.title = 'Clientes · Zydesk';
  }, []);

  const activos = useQuery({
    queryKey: ['clientes', { activo: true }],
    queryFn: () => clientes(true),
  });
  const inactivosConsulta = useQuery({
    queryKey: ['clientes', { activo: false }],
    queryFn: () => clientes(false),
    enabled: inactivos,
  });

  const consultas = inactivos ? [activos, inactivosConsulta] : [activos];
  const pendiente = consultas.some((q) => q.isPending);
  const fallida = consultas.find((q) => q.isError);

  const todos = [
    ...(activos.data ?? []),
    ...(inactivos ? (inactivosConsulta.data ?? []) : []),
  ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const filtro = sinTildes(busqueda.trim());
  const filtroRut = soloRut(busqueda.trim());
  const visibles = filtro
    ? todos.filter(
        (c) =>
          sinTildes(c.nombre).includes(filtro) ||
          (filtroRut !== '' && c.rut !== null && soloRut(c.rut).includes(filtroRut)),
      )
    : todos;
  const externos = visibles.filter((c) => !c.es_interno);
  const internos = visibles.filter((c) => c.es_interno);

  const botonNuevo = puedeCrear ? (
    <Button onClick={() => setCreando(true)}>Nuevo cliente</Button>
  ) : null;

  const lista = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {idActual === null ? (
          <h1 className="font-titulo text-2xl font-bold">Clientes</h1>
        ) : (
          <h2 className="font-titulo text-2xl font-bold">Clientes</h2>
        )}
        {botonNuevo}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buscar-cliente">Buscar cliente</Label>
        <Input
          id="buscar-cliente"
          type="search"
          autoComplete="off"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="mostrar-inactivos" checked={inactivos} onCheckedChange={setInactivos} />
        <Label htmlFor="mostrar-inactivos">Mostrar inactivos</Label>
      </div>
      {pendiente ? (
        <Cargando />
      ) : fallida ? (
        <EstadoError
          error={fallida.error}
          reintentar={() => void Promise.all(consultas.map((q) => q.refetch()))}
        />
      ) : todos.length === 0 ? (
        <EstadoVacio titulo="Aún no hay clientes" accion={botonNuevo} />
      ) : visibles.length === 0 ? (
        <p className="text-tinta-2">Ningún cliente coincide con la búsqueda.</p>
      ) : (
        <>
          <Grupo titulo="Clientes" filas={externos} idActual={idActual} />
          <Grupo titulo="Áreas internas" filas={internos} idActual={idActual} />
        </>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-6">
      <div className={cn(idActual !== null && 'hidden lg:block')}>{lista}</div>
      <div className={cn(idActual === null && 'hidden lg:block')}>
        {idActual === null ? (
          <EstadoVacio titulo="Elige un cliente de la lista" />
        ) : (
          <ClienteFichaPage key={idActual} id={idActual} />
        )}
      </div>
      <DialogoCliente
        abierto={creando}
        alCambiar={setCreando}
        alGuardar={(c) => void navigate(`/clientes/${c.id}`)}
      />
    </div>
  );
}
