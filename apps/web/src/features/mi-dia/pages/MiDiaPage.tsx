import { useQuery } from '@tanstack/react-query';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { FechaRelativa } from '@/components/dominio/FechaRelativa';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { PillTipoOt } from '@/components/dominio/PillTipoOt';
import { Button } from '@/components/ui/button';
import { usePermiso } from '@/features/auth/SesionProvider';
import { useVistaTarjetas } from '@/features/cotizador/useVistaTarjetas';
import { formatearFechaLarga } from '@/lib/fechas';
import { formatearHoras } from '@/lib/formato';
import { clavesMiDia, miDia, REFRESCO_MI_DIA_MS, STALE_MI_DIA, type MiDiaDatos } from '../api';
import { ListaTareasMiDia } from '../components/ListaTareasMiDia';
import { TarjetaConteo } from '../components/TarjetaConteo';
import { TarjetaTicketBreve } from '../components/TarjetaTicketBreve';

const DIA_MS = 86_400_000;

function Seccion({
  id,
  titulo,
  total,
  children,
  pie,
}: {
  id: string;
  titulo: string;
  total: number;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-4 flex-col gap-2">
      <h2 id={`${id}-titulo`} className="font-titulo text-lg font-semibold">
        {titulo} <span className="text-sm font-normal text-tinta-2">({total})</span>
      </h2>
      {children}
      {pie}
    </section>
  );
}

const diasEntre = (desde: string, hasta: string) =>
  Math.max(
    0,
    Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS),
  );

function Contenido({ datos }: { datos: MiDiaDatos }) {
  const puedeAprobar = usePermiso('ots.aprobar');
  const tarjetas = useVistaTarjetas();
  const raiz = useRef<HTMLDivElement>(null);
  const ir = (id: string) =>
    raiz.current?.querySelector(`#${id}`)?.scrollIntoView?.({ behavior: 'smooth' });
  const { conteos } = datos;

  const vacio =
    datos.vencen_hoy.length === 0 &&
    datos.vencidos.length === 0 &&
    datos.por_aprobar.length === 0 &&
    datos.menciones.length === 0 &&
    datos.tareas.length === 0 &&
    datos.detenidos.length === 0;

  if (vacio) {
    return (
      <EstadoVacio
        titulo="Nada pendiente por hoy"
        accion={
          <Button asChild variant="outline">
            <Link to="/tickets">Ir al Tablero</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div ref={raiz} className="flex flex-col gap-6">
      <div
        data-columnas={tarjetas ? '2' : '4'}
        className={`grid gap-3 grid-cols-2 ${puedeAprobar ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
      >
        <TarjetaConteo
          etiqueta="Vencen hoy"
          valor={conteos.vencen_hoy}
          urgente
          onClick={() => ir('vencen-hoy')}
        />
        {puedeAprobar ? (
          <TarjetaConteo
            etiqueta="Por aprobar"
            valor={conteos.por_aprobar}
            onClick={() => ir('por-aprobar')}
          />
        ) : null}
        <TarjetaConteo
          etiqueta="Te mencionaron"
          valor={conteos.menciones}
          onClick={() => ir('menciones')}
        />
        <TarjetaConteo etiqueta="Tus tareas" valor={conteos.tareas} onClick={() => ir('tareas')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {datos.vencen_hoy.length > 0 ? (
            <Seccion id="vencen-hoy" titulo="Vencen hoy" total={conteos.vencen_hoy}>
              <div className="flex flex-col gap-2">
                {datos.vencen_hoy.map((t) => (
                  <TarjetaTicketBreve key={t.id} ticket={t} />
                ))}
              </div>
            </Seccion>
          ) : null}
          {datos.vencidos.length > 0 ? (
            <Seccion id="vencidos" titulo="Vencidos" total={conteos.vencidos}>
              <div className="flex flex-col gap-2">
                {datos.vencidos.map((t) => (
                  <TarjetaTicketBreve key={t.id} ticket={t} />
                ))}
              </div>
            </Seccion>
          ) : null}
          {puedeAprobar && datos.por_aprobar.length > 0 ? (
            <Seccion id="por-aprobar" titulo="Por aprobar" total={conteos.por_aprobar}>
              <ul className="flex flex-col gap-2">
                {datos.por_aprobar.map((ot) => (
                  <li
                    key={ot.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Codigo>{ot.codigo}</Codigo>
                        <PillTipoOt tipo={ot.tipo} />
                      </div>
                      <p className="font-medium">{ot.titulo}</p>
                      <p className="text-sm text-tinta-2">
                        interna · {formatearHoras(ot.horas.estimadas)} estimadas
                        {ot.responsable_tecnico ? ` · ${ot.responsable_tecnico.nombre}` : ''}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/ots/${ot.id}`} aria-label={`Revisar ${ot.codigo}`}>
                        Revisar
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </Seccion>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {datos.menciones.length > 0 ? (
            <Seccion
              id="menciones"
              titulo="Te mencionaron"
              total={conteos.menciones}
              pie={
                <Link
                  to="/avisos?filtro=menciones"
                  className="text-sm text-acento underline underline-offset-2"
                >
                  Ver todos
                </Link>
              }
            >
              <ul className="flex flex-col gap-2">
                {datos.menciones.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={a.enlace}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-borde bg-superficie p-3 text-sm hover:bg-superficie-suave"
                    >
                      <span className="min-w-0 flex-1">{a.texto}</span>
                      <span className="text-tinta-2">
                        <FechaRelativa fecha={a.creado_en} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          ) : null}
          {datos.tareas.length > 0 ? (
            <Seccion id="tareas" titulo="Tus tareas" total={conteos.tareas}>
              <ListaTareasMiDia tareas={datos.tareas} />
            </Seccion>
          ) : null}
          {datos.detenidos.length > 0 ? (
            <Seccion id="detenidos" titulo="Detenidos hace días" total={conteos.detenidos}>
              <div className="flex flex-col gap-2">
                {datos.detenidos.map((t) => (
                  <TarjetaTicketBreve
                    key={t.id}
                    ticket={t}
                    pie={
                      <span>
                        sin actividad desde hace{' '}
                        {diasEntre(hoyIso(new Date(t.actualizado_en)), datos.fecha)} días ·{' '}
                        <FechaRelativa fecha={t.actualizado_en} />
                      </span>
                    }
                  />
                ))}
              </div>
            </Seccion>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MiDiaPage() {
  const consulta = useQuery({
    queryKey: clavesMiDia.miDia,
    queryFn: miDia,
    staleTime: STALE_MI_DIA,
    refetchInterval: REFRESCO_MI_DIA_MS,
  });
  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-4">
      <TituloPagina titulo={`Mi día · ${formatearFechaLarga(datos?.fecha ?? hoyIso())}`} />
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError && !datos ? (
        <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : datos ? (
        <Contenido datos={datos} />
      ) : null}
    </div>
  );
}
