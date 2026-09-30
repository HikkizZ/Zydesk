import { Download } from 'lucide-react';
import { useState } from 'react';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import type { TicketDatos } from '@/features/tickets/api';
import { formatearFechaHora } from '@/lib/fechas';

// Correo con el que se creó el ticket: datos, cuerpo colapsado a 6 líneas y descarga del original.
export function CorreoOriginal({ correo }: { correo: NonNullable<TicketDatos['correo']> }) {
  const [completo, setCompleto] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-2">De</dt>
        <dd className="break-words">{correo.de ?? '—'}</dd>
        <dt className="text-tinta-2">Para</dt>
        <dd className="break-words">{correo.para ?? '—'}</dd>
        <dt className="text-tinta-2">Fecha</dt>
        <dd>{correo.fecha ? formatearFechaHora(correo.fecha) : '—'}</dd>
        <dt className="text-tinta-2">Asunto</dt>
        <dd className="font-medium break-words">{correo.asunto ?? '—'}</dd>
      </dl>
      <div>
        <p className={`text-sm break-words whitespace-pre-wrap ${completo ? '' : 'line-clamp-6'}`}>
          {correo.cuerpo}
        </p>
        {correo.cuerpo.split('\n').length > 6 || correo.cuerpo.length > 400 ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            aria-expanded={completo}
            onClick={() => setCompleto((c) => !c)}
          >
            {completo ? 'Ver menos' : 'Ver completo'}
          </Button>
        ) : null}
      </div>
      {correo.archivo ? (
        <Button asChild variant="outline" size="sm" className="self-start">
          <a href={correo.archivo.url} download={correo.archivo.nombre_original}>
            <Download aria-hidden="true" />
            Descargar original
          </a>
        </Button>
      ) : null}
      {correo.adjuntos.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">Adjuntos del correo</h3>
          <ul className="flex flex-col divide-y rounded-md border">
            {correo.adjuntos.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.nombre_original}</span>
                <span className="text-xs text-tinta-2">{formatearTamano(a.tamano)}</span>
                <Button asChild variant="ghost" size="sm">
                  <a href={a.url} download={a.nombre_original}>
                    Descargar
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
