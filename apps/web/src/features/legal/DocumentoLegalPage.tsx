import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { AvisoBorrador } from './AvisoBorrador';
import { documentoLegal, type DocumentoLegalSalidaDatos } from './api';
import { Markdown } from './Markdown';

// Páginas públicas /terminos y /privacidad (fuera del Layout, sin sesión).
export function DocumentoLegalPage({ clave }: { clave: DocumentoLegalSalidaDatos['clave'] }) {
  const consulta = useQuery({ queryKey: ['legal', clave], queryFn: () => documentoLegal(clave) });
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : (
        <>
          <TituloPagina titulo={consulta.data.titulo} />
          {consulta.data.borrador ? <AvisoBorrador /> : null}
          <article className="mt-4 rounded-lg border border-borde bg-superficie p-6">
            <Markdown texto={consulta.data.contenido_md} />
          </article>
          <p className="mt-4 text-sm text-tinta-2">Versión {consulta.data.version}</p>
        </>
      )}
      <p className="mt-6">
        <Link to="/" className="text-acento underline underline-offset-2">
          Volver
        </Link>
      </p>
    </div>
  );
}
