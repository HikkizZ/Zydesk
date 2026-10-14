import { useEffect } from 'react';
import { NavLink, useLocation, useParams } from 'react-router';
import { PaginaNoEncontrada } from '@/app/PaginaNoEncontrada';
import { CabeceraPagina } from '@/app/CabeceraPagina';
import { useYo } from '@/features/auth/SesionProvider';
import { cn } from '@/lib/utils';
import { MarkdownManual } from '../MarkdownManual';
import { manualesDe, manualPorClave } from '../manuales';
import { encabezadosDe } from '../slug';

const claseEnlaceIndice =
  'flex min-h-11 items-center rounded-md px-2 text-sm hover:text-tinta lg:min-h-8';

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
      <a
        href={`#${e.id}`}
        aria-current={hash === `#${e.id}` ? 'location' : undefined}
        className={cn(
          claseEnlaceIndice,
          hash === `#${e.id}` ? 'bg-acento-suave text-acento' : 'text-tinta-2',
        )}
      >
        {e.texto}
      </a>
    </li>
  ));

  return (
    <div className="flex flex-col gap-4 [&>div:first-child]:mb-2">
      <CabeceraPagina titulo="Ayuda" />
      {manuales.length > 1 ? (
        <nav aria-label="Manuales" className="flex gap-1 overflow-x-auto border-b border-linea">
          {manuales.map((m) => (
            <NavLink
              key={m.clave}
              to={`/ayuda/${m.clave}`}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium lg:min-h-10',
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
      <details className="rounded-md border border-linea bg-panel px-4 py-2 lg:hidden">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          En esta página
        </summary>
        <ul className="pb-2">{enlacesIndice}</ul>
      </details>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <article className="max-w-3xl rounded-md border border-linea bg-panel p-5 text-sm leading-relaxed text-tinta lg:p-6">
          <MarkdownManual texto={manual.texto} carpeta={manual.carpeta} />
        </article>
        <aside
          aria-label="Índice del manual"
          className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-tinta-3">
            En esta página
          </p>
          <ul>{enlacesIndice}</ul>
        </aside>
      </div>
    </div>
  );
}
