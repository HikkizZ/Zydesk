import { FileText, Lock } from 'lucide-react';
import { Fragment, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/dominio/Avatar';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import type {
  ActividadDatos,
  ArchivoDatos,
  MensajeDatos,
  UsuarioBreveDatos,
} from '@/features/tickets/api';
import {
  describirEvento,
  type DescripcionEvento,
  type EventoDatos,
} from '@/features/tickets/eventos';
import { formatearFechaHora } from '@/lib/fechas';
import { cn } from '@/lib/utils';

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// El texto es siempre texto plano (nunca HTML ni Markdown); solo se resaltan las `@menciones`.
function TextoConMenciones({
  texto,
  mencionados,
}: {
  texto: string;
  mencionados: UsuarioBreveDatos[];
}): ReactNode {
  if (mencionados.length === 0) return texto;
  const nombres = mencionados.map((m) => m.nombre).sort((a, b) => b.length - a.length);
  const partes = texto.split(new RegExp(`(@(?:${nombres.map(escapar).join('|')}))`, 'g'));
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-medium text-tinta">
        {parte}
      </span>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

function ArchivoAdjunto({ archivo: a, varias }: { archivo: ArchivoDatos; varias: boolean }) {
  // Una imagen que el navegador no decodifica (HEIC) se muestra como documento.
  const [fallo, setFallo] = useState(false);
  return (
    <li className="min-w-0 max-w-full">
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex max-w-full items-center gap-2 rounded-sm border border-linea bg-panel p-1 text-sm hover:bg-lienzo"
      >
        {a.es_imagen && !fallo ? (
          <img
            src={a.url}
            alt={a.nombre_original}
            loading="lazy"
            onError={() => setFallo(true)}
            className={
              varias
                ? 'h-40 w-full rounded-sm object-cover'
                : 'max-h-60 w-auto max-w-full rounded-sm bg-panel-hundido object-contain sm:max-w-80'
            }
          />
        ) : (
          <>
            <FileText aria-hidden="true" className="ml-1 size-4 text-tinta-2" />
            <span className="max-w-48 truncate">{a.nombre_original}</span>
            <span className="mr-1 text-xs text-tinta-3">{formatearTamano(a.tamano)}</span>
          </>
        )}
      </a>
    </li>
  );
}

export function TarjetaMensaje({
  mensaje,
  cierreDe = false,
}: {
  mensaje: MensajeDatos;
  /** El mensaje es el seguimiento de cierre de la OT de la que se copió. */
  cierreDe?: boolean;
}) {
  const esNota = mensaje.tipo === 'nota_interna';
  return (
    <article
      aria-label={`${esNota ? 'Nota interna' : 'Seguimiento'} de ${mensaje.autor?.nombre ?? 'persona desconocida'}`}
      className={cn(
        'flex max-w-[680px] flex-col gap-2',
        esNota && 'rounded-md border border-linea bg-plazo-atento-suave p-4',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        {mensaje.autor ? (
          <Avatar
            iniciales={mensaje.autor.iniciales}
            color={mensaje.autor.color_avatar}
            className="size-7"
          />
        ) : null}
        <span className="text-xs font-medium text-tinta">
          {mensaje.autor?.nombre ?? 'Sin autor'}
        </span>
        {esNota ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-plazo-atento">
            <Lock aria-hidden="true" className="size-3" />
            Interna
          </span>
        ) : null}
        {mensaje.copiado_de ? (
          <span className="text-xs text-tinta-3">
            {cierreDe ? 'Cierre de ' : esNota ? 'Nota · desde ' : 'Seguimiento · desde '}
            <Link
              to={`/ots/${mensaje.copiado_de.ot.id}`}
              className="text-acento underline underline-offset-2"
            >
              {mensaje.copiado_de.ot.codigo}
            </Link>
          </span>
        ) : null}
        <span aria-hidden="true" className="text-xs text-tinta-3">
          ·
        </span>
        <time dateTime={mensaje.creado_en} className="text-xs text-tinta-3">
          {formatearFechaHora(mensaje.creado_en)}
        </time>
      </header>
      <p className="text-tabla leading-relaxed break-words whitespace-pre-wrap text-tinta-2">
        <TextoConMenciones texto={mensaje.texto} mencionados={mensaje.mencionados} />
      </p>
      {mensaje.horas ? (
        <p className="font-mono text-xs text-tinta-3">
          · {formatoHoras.format(mensaje.horas)} h registradas
        </p>
      ) : null}
      {mensaje.archivos.length > 0 ? (
        <ul
          className={
            mensaje.archivos.length > 1
              ? 'grid grid-cols-2 gap-2 sm:grid-cols-3'
              : 'flex flex-wrap gap-2'
          }
        >
          {mensaje.archivos.map((a) => (
            <ArchivoAdjunto key={a.id} archivo={a} varias={mensaje.archivos.length > 1} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function LineaEvento({
  evento,
  describir,
}: {
  evento: EventoDatos;
  describir: (e: EventoDatos) => DescripcionEvento;
}) {
  const d = describir(evento);
  const delSistema = evento.accion === 'archivado' || !evento.autor;
  return (
    <div className="flex items-start gap-2 px-1 text-xs text-tinta-3">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block size-2 shrink-0 rounded-full border border-linea-campo"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="break-words">
          {delSistema ? null : (
            <strong className="font-medium text-tinta-2">{evento.autor?.nombre}</strong>
          )}
          {delSistema ? null : ' '}
          {d.texto}
          {d.cambio ? (
            <>
              {' '}
              <span className="rounded-sm bg-panel-hundido px-1.5 py-0.5 font-mono text-xs text-tinta-2">
                {d.cambio}
              </span>
            </>
          ) : null}
        </p>
        {d.detalle ? <p className="break-words">{d.detalle}</p> : null}
      </div>
      <time dateTime={evento.creado_en} className="shrink-0 text-xs">
        {formatearFechaHora(evento.creado_en)}
      </time>
    </div>
  );
}

// El mensaje copiado de una OT va precedido del evento `ot_cerrada` de esa misma OT.
function esCierreDeOt(items: ActividadDatos['items'], i: number): boolean {
  const item = items[i];
  if (item?.tipo !== 'mensaje' || !item.mensaje.copiado_de) return false;
  const otId = item.mensaje.copiado_de.ot.id;
  return items
    .slice(0, i)
    .some(
      (x) =>
        x.tipo === 'evento' &&
        x.evento.accion === 'ot_cerrada' &&
        x.evento.datos?.['ot_id'] === otId,
    );
}

// Lista cronológica (lo más nuevo abajo, junto al redactor): mensajes como tarjetas y eventos como líneas.
export function ActividadLista({
  items,
  ultimoRef,
  describir = describirEvento,
}: {
  items: ActividadDatos['items'];
  ultimoRef?: Ref<HTMLDivElement>;
  /** Frase de cada evento; por defecto la de tickets (la OT pasa la suya). */
  describir?: (e: EventoDatos) => DescripcionEvento;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-tinta-3">Sin actividad todavía</p>;
  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, i) => (
        <li key={`${item.tipo}-${item.tipo === 'mensaje' ? item.mensaje.id : item.evento.id}`}>
          {item.tipo === 'mensaje' ? (
            <TarjetaMensaje mensaje={item.mensaje} cierreDe={esCierreDeOt(items, i)} />
          ) : (
            <LineaEvento evento={item.evento} describir={describir} />
          )}
          {i === items.length - 1 ? <div ref={ultimoRef} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
