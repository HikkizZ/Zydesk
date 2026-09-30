import { useQuery } from '@tanstack/react-query';
import { ACCIONES_AUDITORIA, type AuditoriaSalidaDatos } from '@zydesk/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatearFechaHora } from '@/lib/fechas';
import { auditoria, usuarios, type FiltrosAuditoria } from './api';
import { Seleccion } from './Seleccion';
import { Tarjeta } from './Tarjeta';

export const ETIQUETA_ACCION: Record<(typeof ACCIONES_AUDITORIA)[number], string> = {
  ingreso_ok: 'Ingreso',
  ingreso_fallido: 'Ingreso fallido',
  cierre_sesion: 'Cierre de sesión',
  sesion_cerrada: 'Sesión cerrada por Administración',
  cuenta_bloqueada: 'Cuenta bloqueada',
  contrasena_cambiada: 'Contraseña cambiada',
  contrasena_restablecida: 'Contraseña restablecida',
  usuario_creado: 'Persona creada',
  usuario_desactivado: 'Persona desactivada',
  usuario_reactivado: 'Persona reactivada',
  rol_cambiado: 'Rol cambiado',
  config_cambiada: 'Configuración cambiada',
  numeracion_cambiada: 'Numeración cambiada',
  terminos_aceptados: 'Términos aceptados',
  exportacion: 'Exportación',
  descarga_archivo: 'Descarga de archivo',
};

const TODAS = 'todas';

function etiquetaAccion(accion: string): string {
  return (ETIQUETA_ACCION as Record<string, string>)[accion] ?? accion;
}

function resumen(fila: AuditoriaSalidaDatos): string {
  if (fila.accion.startsWith('ingreso_')) {
    const ua = fila.detalle['user_agent'];
    if (typeof ua !== 'string' || ua === '') return '—';
    return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
  }
  return JSON.stringify(fila.detalle);
}

function aInstante(valor: string): string | undefined {
  return valor ? new Date(valor).toISOString() : undefined;
}

export function IngresosTab() {
  const [pagina, setPagina] = useState(1);
  const [accion, setAccion] = useState(TODAS);
  const [persona, setPersona] = useState(TODAS);
  const [correo, setCorreo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const filtros: FiltrosAuditoria = {
    pagina,
    ...(accion !== TODAS ? { accion } : {}),
    ...(persona !== TODAS ? { usuario_id: Number(persona) } : {}),
    ...(correo.trim() ? { correo: correo.trim() } : {}),
    ...(desde ? { desde: aInstante(desde) as string } : {}),
    ...(hasta ? { hasta: aInstante(hasta) as string } : {}),
  };
  const consulta = useQuery({
    queryKey: ['auditoria', filtros],
    queryFn: () => auditoria(filtros),
  });
  const personas = useQuery({ queryKey: ['usuarios', {}], queryFn: () => usuarios({}) });

  // cualquier cambio de filtro vuelve a la primera página
  const filtro =
    <T,>(fijar: (v: T) => void) =>
    (v: T) => {
      fijar(v);
      setPagina(1);
    };

  const totalPaginas = consulta.data
    ? Math.max(1, Math.ceil(consulta.data.total / consulta.data.por_pagina))
    : 1;

  let contenido;
  if (consulta.isPending) contenido = <Cargando />;
  else if (consulta.isError) {
    contenido = <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />;
  } else if (consulta.data.datos.length === 0) {
    contenido = <EstadoVacio titulo="Sin registros para este filtro" />;
  } else {
    contenido = (
      <>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.data.datos.map((fila) => {
                const correoDetalle = fila.detalle['correo'];
                const textoDetalle = resumen(fila);
                return (
                  <TableRow key={fila.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatearFechaHora(fila.creado_en)}
                    </TableCell>
                    <TableCell>{etiquetaAccion(fila.accion)}</TableCell>
                    <TableCell>
                      {fila.usuario?.nombre ??
                        (typeof correoDetalle === 'string' ? correoDetalle : '—')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fila.ip ?? '—'}</TableCell>
                    <TableCell className="max-w-md break-words font-mono text-xs">
                      {textoDetalle}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-tinta-2">
          <span>
            {consulta.data.total} registros · página {consulta.data.pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button asChild variant="outline">
          <Link to="/configuracion/equipo">Volver a Equipo</Link>
        </Button>
      </div>
      <Tarjeta titulo="Ingresos y registro de seguridad">
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-accion">Acción</Label>
            <Seleccion
              id="filtro-accion"
              valor={accion}
              alCambiar={filtro(setAccion)}
              opciones={[
                { valor: TODAS, etiqueta: 'Todas las acciones' },
                ...ACCIONES_AUDITORIA.map((a) => ({ valor: a, etiqueta: ETIQUETA_ACCION[a] })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-persona">Persona</Label>
            <Seleccion
              id="filtro-persona"
              valor={persona}
              alCambiar={filtro(setPersona)}
              opciones={[
                { valor: TODAS, etiqueta: 'Todas las personas' },
                ...(personas.data ?? []).map((u) => ({ valor: String(u.id), etiqueta: u.nombre })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-correo">Correo</Label>
            <Input
              id="filtro-correo"
              type="text"
              value={correo}
              onChange={(e) => filtro(setCorreo)(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-desde">Desde</Label>
            <Input
              id="filtro-desde"
              type="datetime-local"
              value={desde}
              onChange={(e) => filtro(setDesde)(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-hasta">Hasta</Label>
            <Input
              id="filtro-hasta"
              type="datetime-local"
              value={hasta}
              onChange={(e) => filtro(setHasta)(e.target.value)}
            />
          </div>
        </div>
        {contenido}
      </Tarjeta>
    </div>
  );
}
