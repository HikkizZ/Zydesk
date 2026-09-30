import ReactMarkdown, { type Components } from 'react-markdown';

// Estilos mínimos para los documentos legales (sin plugin de tipografía). El enlace externo abre en pestaña nueva.
const COMPONENTES: Components = {
  h1: (p) => <h2 className="mb-3 mt-6 font-titulo text-2xl font-bold" {...p} />,
  h2: (p) => <h3 className="mb-2 mt-6 font-titulo text-xl font-semibold" {...p} />,
  h3: (p) => <h4 className="mb-2 mt-4 font-titulo text-lg font-semibold" {...p} />,
  p: (p) => <p className="mb-3 leading-relaxed" {...p} />,
  ul: (p) => <ul className="mb-3 list-disc pl-6" {...p} />,
  ol: (p) => <ol className="mb-3 list-decimal pl-6" {...p} />,
  li: (p) => <li className="mb-1" {...p} />,
  a: (p) => <a className="text-acento underline underline-offset-2" {...p} />,
  blockquote: (p) => (
    <blockquote
      className="mb-3 rounded-md border border-nota-interna-borde bg-nota-interna-fondo px-3 py-2"
      {...p}
    />
  ),
};

export function Markdown({ texto }: { texto: string }) {
  return <ReactMarkdown components={COMPONENTES}>{texto}</ReactMarkdown>;
}
