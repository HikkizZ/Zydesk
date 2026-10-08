import { useQuery } from '@tanstack/react-query';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CabeceraPagina } from '@/app/CabeceraPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { Codigo } from '@/components/dominio/Codigo';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { FechaRelativa } from '@/components/dominio/FechaRelativa';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { LineaIndicadores } from '@/components/dominio/LineaIndicadores';
import { PillTipoOt } from '@/components/dominio/PillTipoOt';
import { Button } from '@/components/ui/button';
import { usePermiso, useYo } from '@/features/auth/SesionProvider';
import { formatearFechaLarga } from '@/lib/fechas';
import { formatearHoras } from '@/lib/formato';
import { clavesMiDia, miDia, REFRESCO_MI_DIA_MS, STALE_MI_DIA, type MiDiaDatos } from '../api';
import { ListaTareasMiDia } from '../components/ListaTareasMiDia';
import { TarjetaTicketBreve } from '../components/TarjetaTicketBreve';

const DIA_MS = 86_400_000;

function Seccion({
  id,
  titulo,
  total,
  children,
  enlace,
}: {
  id: string;
  titulo: string;
  total: number;
  children: ReactNode;
  enlace?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-4 flex-col">
      <div className="flex items-center gap-2 border-b border-linea-fuerte pb-2">
        <h2 id={`${id}-titulo`} className="text-sm font-semibold text-tinta">
          {titulo}
        </h2>
        <span className="rounded-sm border border-linea bg-panel px-1.5 text-xs font-medium text-tinta-2 tabular-nums">
          {total}
        </span>
        {enlace ? <span className="ml-auto">{enlace}</span> : null}
      </div>
      {children}
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
      <LineaIndicadores
        items={[
          {
            etiqueta: 'Vencen hoy',
            valor: conteos.vencen_hoy,
            tono: 'atento',
            onClick: () => ir('vencen-hoy'),
          },
          {
            etiqueta: 'Vencidos',
            valor: conteos.vencidos,
            tono: 'vencido',
            onClick: () => ir('vencidos'),
          },
          ...(puedeAprobar
            ? [
                {
                  etiqueta: 'Por aprobar',
                  valor: conteos.por_aprobar,
                  onClick: () => ir('por-aprobar'),
                },
              ]
            : []),
          { etiqueta: 'Te mencionaron', valor: conteos.menciones, onClick: () => ir('menciones') },
          { etiqueta: 'Tus tareas', valor: conteos.tareas, onClick: () => ir('tareas') },
          { etiqueta: 'Detenidos', valor: conteos.detenidos, onClick: () => ir('detenidos') },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {datos.vencen_hoy.length > 0 ? (
            <Seccion id="vencen-hoy" titulo="Vencen hoy" total={conteos.vencen_hoy}>
              <div className="flex flex-col">
                {datos.vencen_hoy.map((t) => (
                  <TarjetaTicketBreve key={t.id} ticket={t} />
                ))}
              </div>
            </Seccion>
          ) : null}
          {datos.vencidos.length > 0 ? (
            <Seccion id="vencidos" titulo="Vencidos" total={conteos.vencidos}>
              <div className="flex flex-col">
                {datos.vencidos.map((t) => (
                  <TarjetaTicketBreve key={t.id} ticket={t} />
                ))}
              </div>
            </Seccion>
          ) : null}
          {puedeAprobar && datos.por_aprobar.length > 0 ? (
            <Seccion id="por-aprobar" titulo="Por aprobar" total={conteos.por_aprobar}>
              <ul className="flex flex-col">
                {datos.por_aprobar.map((ot) => (
                  <li
                    key={ot.id}
                    className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-linea py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Codigo>{ot.codigo}</Codigo>
                        <PillTipoOt tipo={ot.tipo} />
                      </div>
                      <p className="text-tabla font-medium text-tinta">{ot.titulo}</p>
                      <p className="text-xs text-tinta-3">
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
              enlace={
                <Button asChild variant="link" className="min-h-11 px-0 lg:min-h-0">
                  <Link to="/avisos?filtro=menciones">Ver todos</Link>
                </Button>
              }
            >
              <ul className="flex flex-col">
                {datos.menciones.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={a.enlace}
                      className="flex min-h-12 items-center gap-3 border-b border-linea py-3 text-tabla text-tinta hover:bg-lienzo"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-panel-hundido text-xs font-medium text-tinta-2"
                      >
                        @
                      </span>
                      <span className="min-w-0 flex-1">{a.texto}</span>
                      <span className="shrink-0 text-xs text-tinta-3">
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
              <div className="flex flex-col">
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

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function MiDiaPage() {
  const yo = useYo();
  const consulta = useQuery({
    queryKey: clavesMiDia.miDia,
    queryFn: miDia,
    staleTime: STALE_MI_DIA,
    refetchInterval: REFRESCO_MI_DIA_MS,
  });
  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-4">
      <CabeceraPagina
        titulo={mayuscula(formatearFechaLarga(datos?.fecha ?? hoyIso()))}
        subtitulo={`Buen día, ${yo.nombre.split(' ')[0]}`}
      />
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
