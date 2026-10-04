import { useEffect } from 'react';
import { NavLink, useLocation, useParams } from 'react-router';
import { PaginaNoEncontrada } from '@/app/PaginaNoEncontrada';
import { TituloPagina } from '@/app/TituloPagina';
import { useYo } from '@/features/auth/SesionProvider';
import { cn } from '@/lib/utils';
import { MarkdownManual } from '../MarkdownManual';
import { manualesDe, manualPorClave } from '../manuales';
import { encabezadosDe } from '../slug';

const claseEnlaceIndice = 'block rounded-md px-2 py-1 text-sm text-acento hover:underline';

// Un `#%` malformado hace lanzar a `decodeURIComponent`: se usa el hash tal cual.
function idDeHash(hash: string): string {
  const crudo = hash.slice(1);
  try {
    return decodeURIComponent(crudo);
  } catch {
    return crudo;
  }
}

export function AyudaPage() {
  const yo = useYo();
  const { manual: clave } = useParams();
  const { hash } = useLocation();
  const manual = manualPorClave(clave);
  const manuales = manualesDe(yo.rol);

  useEffect(() => {
    if (!manual) return;
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const destino = document.getElementById(idDeHash(hash));
    if (!destino) return;
    destino.scrollIntoView();
    destino.focus();
  }, [manual, hash]);

  if (!manual) return <PaginaNoEncontrada />;

  const indice = encabezadosDe(manual.texto).filter((e) => e.nivel === 2);
  const enlacesIndice = indice.map((e) => (
    <li key={e.id}>
      <a href={`#${e.id}`} className={claseEnlaceIndice}>
        {e.texto}
      </a>
    </li>
  ));

  return (
    <div className="flex flex-col gap-4">
      <TituloPagina titulo="Ayuda" />
      {manuales.length > 1 ? (
        <nav aria-label="Manuales" className="flex gap-1 overflow-x-auto border-b border-borde">
          {manuales.map((m) => (
            <NavLink
              key={m.clave}
              to={`/ayuda/${m.clave}`}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'border-acento text-tinta'
                    : 'border-transparent text-tinta-2 hover:text-tinta',
                )
              }
            >
              {m.titulo}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <details className="rounded-lg border border-borde bg-superficie px-4 py-2 lg:hidden">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          En esta página
        </summary>
        <ul className="pb-2">{enlacesIndice}</ul>
      </details>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <article className="max-w-3xl rounded-lg border border-borde bg-superficie p-6">
          <MarkdownManual texto={manual.texto} />
        </article>
        <aside
          aria-label="Índice del manual"
          className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          <p className="px-2 pb-1 text-xs uppercase tracking-wide text-tinta-2">En esta página</p>
          <ul>{enlacesIndice}</ul>
        </aside>
      </div>
    </div>
  );
}
