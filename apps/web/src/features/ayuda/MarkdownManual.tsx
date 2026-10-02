import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import { Link } from 'react-router';
import remarkGfm from 'remark-gfm';
import { COMPONENTES } from '@/features/legal/Markdown';
import { resolverEnlace } from './enlaces';
import { crearGeneradorIds } from './slug';

// Concatena el texto de los nodos hijos (conserva el de `code`, `strong`, etc.).
function textoDe(nodo: ReactNode): string {
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return '';
}

// react-markdown pasa `node` a los componentes; no debe llegar al DOM.
function sinNodo<T extends ExtraProps>(p: T): Omit<T, 'node'> {
  const resto = { ...p };
  delete resto.node;
  return resto;
}

// El `# ` del manual baja a h2 (el único h1 de la página es «Ayuda») y el resto baja un nivel.
const NIVELES = {
  h1: { Etiqueta: 'h2', clase: 'mb-3 mt-6 font-titulo text-2xl font-bold' },
  h2: { Etiqueta: 'h3', clase: 'mb-2 mt-6 font-titulo text-xl font-semibold' },
  h3: { Etiqueta: 'h4', clase: 'mb-2 mt-4 font-titulo text-lg font-semibold' },
  h4: { Etiqueta: 'h5', clase: 'mb-2 mt-4 font-semibold' },
} as const;

function Enlace({ href, children }: { href: string | undefined; children: ReactNode }) {
  const clase = 'text-acento underline underline-offset-2';
  const r = resolverEnlace(href);
  switch (r.tipo) {
    case 'ancla':
      return (
        <a href={r.href} className={clase}>
          {children}
        </a>
      );
    case 'interno':
      return (
        <Link to={r.to} className={clase}>
          {children}
        </Link>
      );
    case 'externo':
      return (
        <a href={r.href} target="_blank" rel="noopener noreferrer" className={clase}>
          {children}
          <span className="sr-only"> (abre en una pestaña nueva)</span>
        </a>
      );
    default:
      return <span>{children}</span>;
  }
}

export function MarkdownManual({ texto }: { texto: string }) {
  const idDe = crearGeneradorIds();
  // El id se fija por posición en el texto: un segundo render del mismo encabezado no lo duplica.
  const asignados = new Map<number, string>();

  const encabezado = (nivel: keyof typeof NIVELES) => {
    const { Etiqueta, clase } = NIVELES[nivel];
    return (p: ComponentPropsWithoutRef<'h1'> & ExtraProps) => {
      const posicion = p.node?.position?.start.offset ?? -1;
      let id = asignados.get(posicion);
      if (id === undefined) {
        id = idDe(textoDe(p.children));
        asignados.set(posicion, id);
      }
      return <Etiqueta {...sinNodo(p)} id={id} tabIndex={-1} className={`${clase} scroll-mt-4`} />;
    };
  };

  const componentes: Components = {
    ...COMPONENTES,
    h1: encabezado('h1'),
    h2: encabezado('h2'),
    h3: encabezado('h3'),
    h4: encabezado('h4'),
    a: (p) => <Enlace href={p.href}>{p.children}</Enlace>,
    table: (p) => (
      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...sinNodo(p)} />
      </div>
    ),
    thead: (p) => <thead {...sinNodo(p)} />,
    th: (p) => (
      <th
        className="border border-borde bg-secondary px-3 py-2 text-left font-semibold"
        {...sinNodo(p)}
      />
    ),
    td: (p) => <td className="border border-borde px-3 py-2 text-left" {...sinNodo(p)} />,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
      {texto}
    </ReactMarkdown>
  );
}
