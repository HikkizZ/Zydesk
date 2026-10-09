import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CabeceraPagina } from '@/app/CabeceraPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { AvisoBorrador } from './AvisoBorrador';
import { documentoLegal, type DocumentoLegalSalidaDatos } from './api';
import { Markdown } from './Markdown';

// Páginas públicas /terminos y /privacidad (fuera del Layout, sin sesión).
export function DocumentoLegalPage({ clave }: { clave: DocumentoLegalSalidaDatos['clave'] }) {
  const consulta = useQuery({ queryKey: ['legal', clave], queryFn: () => documentoLegal(clave) });
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10">
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <EstadoError error={consulta.error} reintentar={() => void consulta.refetch()} />
      ) : (
        <>
          <CabeceraPagina titulo={consulta.data.titulo} />
          {consulta.data.borrador ? <AvisoBorrador /> : null}
          <article className="mt-4 rounded-md border border-linea bg-panel p-5 text-sm leading-relaxed text-tinta lg:p-6">
            <Markdown texto={consulta.data.contenido_md} />
          </article>
          <p className="mt-4 text-xs text-tinta-3">Versión {consulta.data.version}</p>
        </>
      )}
      <p className="mt-6">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-acento underline underline-offset-2 lg:min-h-0"
        >
          Volver
        </Link>
      </p>
    </div>
  );
}
