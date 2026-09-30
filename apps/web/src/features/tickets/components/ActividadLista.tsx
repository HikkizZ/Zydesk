import { iniciales } from '@zydesk/shared';
import { FileText, History, Lock } from 'lucide-react';
import { Fragment, type ReactNode, type Ref } from 'react';
import { Avatar } from '@/components/dominio/Avatar';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import { Pill } from '@/components/dominio/Pill';
import type { ActividadDatos, MensajeDatos, UsuarioBreveDatos } from '@/features/tickets/api';
import { describirEvento, type EventoDatos } from '@/features/tickets/eventos';
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
      <span key={i} className="font-medium">
        {parte}
      </span>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

export function TarjetaMensaje({ mensaje }: { mensaje: MensajeDatos }) {
  const esNota = mensaje.tipo === 'nota_interna';
  return (
    <article
      aria-label={`${esNota ? 'Nota interna' : 'Seguimiento'} de ${mensaje.autor?.nombre ?? 'persona desconocida'}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        esNota ? 'border-nota-interna-borde bg-nota-interna-fondo' : 'bg-superficie',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        {mensaje.autor ? (
          <Avatar
            iniciales={mensaje.autor.iniciales}
            color={mensaje.autor.color_avatar}
            className="size-7 text-[10px]"
          />
        ) : null}
        <span className="text-sm font-semibold">{mensaje.autor?.nombre ?? 'Sin autor'}</span>
        {esNota ? (
          <Pill tono="alta">
            <Lock aria-hidden="true" className="size-3" />
            Nota interna · solo equipo
          </Pill>
        ) : (
          <Pill tono="acento">Seguimiento</Pill>
        )}
        <time dateTime={mensaje.creado_en} className="text-sm text-tinta-2">
          {formatearFechaHora(mensaje.creado_en)}
        </time>
      </header>
      <p className="text-sm break-words whitespace-pre-wrap">
        <TextoConMenciones texto={mensaje.texto} mencionados={mensaje.mencionados} />
      </p>
      {mensaje.horas ? (
        <p className="font-mono text-xs text-tinta-2">
          · {formatoHoras.format(mensaje.horas)} h registradas
        </p>
      ) : null}
      {mensaje.archivos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {mensaje.archivos.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border bg-superficie p-1 text-sm hover:bg-superficie-suave"
              >
                {a.es_imagen ? (
                  <img
                    src={a.url}
                    alt={a.nombre_original}
                    loading="lazy"
                    className="size-16 rounded object-cover"
                  />
                ) : (
                  <>
                    <FileText aria-hidden="true" className="ml-1 size-4 text-tinta-2" />
                    <span className="max-w-48 truncate">{a.nombre_original}</span>
                    <span className="mr-1 text-xs text-tinta-2">{formatearTamano(a.tamano)}</span>
                  </>
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function LineaEvento({ evento }: { evento: EventoDatos }) {
  const d = describirEvento(evento);
  const delSistema = evento.accion === 'archivado' || !evento.autor;
  return (
    <div className="flex items-start gap-2 px-1 text-sm text-tinta-2">
      {evento.autor ? (
        <Avatar
          iniciales={iniciales(evento.autor.nombre)}
          color="#E8E5DD"
          className="mt-0.5 size-5 text-[8px]"
        />
      ) : (
        <History aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="break-words">
          {delSistema ? null : (
            <strong className="font-semibold text-tinta">{evento.autor?.nombre}</strong>
          )}
          {delSistema ? null : ' '}
          {d.texto}
          {d.cambio ? (
            <>
              {' '}
              <span className="rounded bg-superficie-suave px-1.5 py-0.5 font-mono text-xs text-tinta">
                {d.cambio}
              </span>
            </>
          ) : null}
        </p>
        {d.detalle ? <p className="text-xs break-words">{d.detalle}</p> : null}
      </div>
      <time dateTime={evento.creado_en} className="shrink-0 text-xs">
        {formatearFechaHora(evento.creado_en)}
      </time>
    </div>
  );
}

// Lista cronológica (lo más nuevo abajo, junto al redactor): mensajes como tarjetas y eventos como líneas.
export function ActividadLista({
  items,
  ultimoRef,
}: {
  items: ActividadDatos['items'];
  ultimoRef?: Ref<HTMLDivElement>;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-tinta-2">Sin actividad todavía</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={`${item.tipo}-${item.tipo === 'mensaje' ? item.mensaje.id : item.evento.id}`}>
          {item.tipo === 'mensaje' ? (
            <TarjetaMensaje mensaje={item.mensaje} />
          ) : (
            <LineaEvento evento={item.evento} />
          )}
          {i === items.length - 1 ? <div ref={ultimoRef} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
