import { ETIQUETA_FORMA_APROBACION } from '@zydesk/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatares } from '@/components/dominio/Avatares';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMes, diaMesDeFecha, diaMesHora } from '@/components/dominio/formato-fecha';
import { Pill } from '@/components/dominio/Pill';
import { PillEstado } from '@/components/dominio/PillEstado';
import { PillEtapaOt } from '@/components/dominio/PillEtapaOt';
import { PillFacturacion } from '@/components/dominio/PillFacturacion';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OtDatos } from '@/features/ots/api';
import { describirEventoOt } from '@/features/ots/eventos';
import type { EventoDatos } from '@/features/tickets/eventos';

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const horas = (n: number) => `${formatoHoras.format(n)} h`;

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-lg border border-borde bg-superficie p-4">
      <h2 className="mb-3 font-titulo text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="text-tinta-2">{etiqueta}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function BotonDeshabilitado({ texto, pista }: { texto: string; pista: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Button type="button" variant="outline" disabled>
            {texto}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{pista}</TooltipContent>
    </Tooltip>
  );
}

function Aprobacion({ ot }: { ot: OtDatos }) {
  if (ot.tipo === 'facturable') {
    const a = ot.aprobacion;
    return (
      <div className="flex flex-col gap-2 text-sm">
        <Pill tono={a ? 'resuelto' : 'alta'}>{a ? 'Aprobada' : 'Pendiente'}</Pill>
        {a ? (
          <dl>
            <Dato etiqueta="Contacto">{a.contacto.nombre}</Dato>
            <Dato etiqueta="Fecha">{diaMesDeFecha(a.fecha)}</Dato>
            <Dato etiqueta="Forma">{ETIQUETA_FORMA_APROBACION[a.forma]}</Dato>
            <Dato etiqueta="Respaldo">
              <a
                href={a.archivo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-acento underline underline-offset-2"
              >
                {a.archivo.nombre_original}
              </a>
            </Dato>
          </dl>
        ) : (
          <p className="text-tinta-2">Falta registrar la aprobación del cliente con su respaldo.</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Pill tono={ot.aprobada_por ? 'resuelto' : 'alta'}>
        {ot.aprobada_por ? 'Aprobada' : 'Pendiente'}
      </Pill>
      <dl>
        <Dato etiqueta="Quién aprueba">
          {ot.aprobador?.nombre ?? <span className="text-tinta-3">Sin definir</span>}
        </Dato>
      </dl>
      {ot.aprobada_por && ot.aprobada_en ? (
        <p className="text-tinta-2">
          Aprobada por {ot.aprobada_por.nombre} el {diaMesHora(ot.aprobada_en)}
        </p>
      ) : null}
    </div>
  );
}

// Panel derecho de la OT (spec fase 3 §10.4 punto 7).
export function PanelOt({
  ot,
  eventos,
  onVerHistorial,
}: {
  ot: OtDatos;
  eventos: EventoDatos[];
  onVerHistorial: () => void;
}) {
  const origen = ot.ticket_origen;
  const ultimos = eventos.slice(-5).reverse();
  return (
    <aside aria-label="Datos de la OT" className="flex flex-col gap-4">
      {ot.tipo === 'facturable' ? (
        <Tarjeta titulo="Cotización">
          <EstadoVacio
            titulo="Cotizador disponible en la Fase 4"
            descripcion="La cotización se hace por ahora fuera de la app."
            accion={<BotonDeshabilitado texto="Crear cotización" pista="Fase 4" />}
          />
        </Tarjeta>
      ) : (
        <Tarjeta titulo="Costo interno">
          <p className="mb-2 text-sm text-tinta-2">
            Se calcula con la tarifa de costo interno (Fase 4)
          </p>
          <dl>
            <Dato etiqueta="Horas reales">
              <span className="font-mono">{horas(ot.horas.reales)}</span>
            </Dato>
            <Dato etiqueta="Horas registradas">
              <span className="font-mono">{horas(ot.horas.registradas)}</span>
            </Dato>
          </dl>
        </Tarjeta>
      )}

      <Tarjeta titulo="Aprobación">
        <Aprobacion ot={ot} />
      </Tarjeta>

      {ot.tipo === 'facturable' ? (
        <Tarjeta titulo="Facturación">
          <dl>
            <Dato etiqueta="Estado">
              <PillFacturacion estado={ot.estado_facturacion} />
            </Dato>
            {ot.n_factura ? (
              <Dato etiqueta="N° de factura">
                <span className="font-mono">{ot.n_factura}</span>
              </Dato>
            ) : null}
            {ot.facturada_en ? (
              <Dato etiqueta="Fecha">
                {diaMesHora(ot.facturada_en)}
                {ot.facturada_por ? ` · ${ot.facturada_por.nombre}` : ''}
              </Dato>
            ) : null}
          </dl>
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Ticket de origen">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-start gap-2">
            <Link
              to={`/tickets/${origen.id}`}
              className="font-mono text-acento underline underline-offset-2"
            >
              {origen.codigo}
            </Link>
            <span className="min-w-0 flex-1 break-words">{origen.asunto}</span>
          </div>
          <div>
            <PillEstado estado={origen.estado} />
          </div>
          {origen.responsables.length > 0 ? (
            <div className="flex items-center gap-2">
              <Avatares personas={origen.responsables} />
              <span className="text-tinta-2">
                {origen.responsables.map((r) => r.nombre).join(', ')}
              </span>
            </div>
          ) : (
            <span className="text-alta">Sin responsables</span>
          )}
          {origen.otras_ots_abiertas.length > 0 ? (
            <div className="flex flex-col gap-1 border-t pt-2">
              <p className="text-xs font-semibold tracking-wide text-tinta-2 uppercase">
                Otras OT abiertas
              </p>
              <ul className="flex flex-col gap-1">
                {origen.otras_ots_abiertas.map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <Link
                      to={`/ots/${o.id}`}
                      className="font-mono text-acento underline underline-offset-2"
                    >
                      {o.codigo}
                    </Link>
                    <PillEtapaOt etapa={o.etapa} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Horas">
        <dl>
          <Dato etiqueta="Estimadas">
            <span className="font-mono">{horas(ot.horas.estimadas)}</span>
          </Dato>
          <Dato etiqueta="Reales">
            <span className="font-mono">{horas(ot.horas.reales)}</span>
          </Dato>
          <Dato etiqueta="Registradas">
            <span className="font-mono">{horas(ot.horas.registradas)}</span>
          </Dato>
        </dl>
      </Tarjeta>

      <Tarjeta titulo="Datos">
        <dl>
          <Dato etiqueta="Creada por">
            {ot.creado_por?.nombre ?? '—'} · {diaMesHora(ot.creado_en)}
          </Dato>
          {ot.cerrada_en ? (
            <Dato etiqueta="Cerrada">
              {ot.cerrada_por?.nombre ?? '—'} · {diaMesHora(ot.cerrada_en)}
            </Dato>
          ) : null}
          {ot.cancelada_en ? <Dato etiqueta="Cancelada">{diaMesHora(ot.cancelada_en)}</Dato> : null}
          {ot.inicio ? <Dato etiqueta="Inicio">{diaMesDeFecha(ot.inicio)}</Dato> : null}
        </dl>
        {ot.resumen_cierre ? (
          <div className="mt-2 border-t pt-2">
            <p className="text-xs font-semibold tracking-wide text-tinta-2 uppercase">
              Resumen de cierre
              {ot.resolvio_ticket !== null
                ? ` · ${ot.resolvio_ticket ? 'resolvió el ticket' : 'no resolvió el ticket'}`
                : ''}
            </p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">{ot.resumen_cierre}</p>
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta titulo="Historial">
        {ultimos.length === 0 ? (
          <p className="text-sm text-tinta-2">Sin movimientos</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {ultimos.map((e) => {
              const d = describirEventoOt(e);
              return (
                <li key={e.id} className="flex flex-col">
                  <span className="break-words">
                    {e.autor ? <strong className="font-semibold">{e.autor.nombre} </strong> : null}
                    {d.texto}
                    {d.cambio ? <span className="font-mono text-xs"> {d.cambio}</span> : null}
                  </span>
                  <time dateTime={e.creado_en} className="text-xs text-tinta-3">
                    {diaMes(e.creado_en)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        <Button type="button" variant="link" className="mt-1 px-0" onClick={onVerHistorial}>
          Ver todo
        </Button>
      </Tarjeta>
    </aside>
  );
}
