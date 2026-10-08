import ReactMarkdown, { type Components } from 'react-markdown';

// Estilos mínimos para los documentos legales (sin plugin de tipografía). El enlace externo abre en pestaña nueva.
export const COMPONENTES: Components = {
  h1: (p) => <h2 className="mb-3 mt-6 text-base font-semibold text-tinta" {...p} />,
  h2: (p) => <h3 className="mb-2 mt-6 text-sm font-semibold text-tinta" {...p} />,
  h3: (p) => <h4 className="mb-2 mt-4 text-tabla font-medium text-tinta" {...p} />,
  p: (p) => <p className="mb-3 text-sm leading-relaxed" {...p} />,
  ul: (p) => <ul className="mb-3 list-disc pl-6 text-sm leading-relaxed" {...p} />,
  ol: (p) => <ol className="mb-3 list-decimal pl-6 text-sm leading-relaxed" {...p} />,
  li: (p) => <li className="mb-1" {...p} />,
  a: (p) => <a className="text-acento underline underline-offset-2" {...p} />,
  pre: (p) => (
    <pre
      className="mb-3 overflow-x-auto rounded-md bg-panel-hundido p-3 font-mono text-xs"
      {...p}
    />
  ),
  code: (p) => (
    <code
      className="font-mono text-xs [:not(pre)>&]:rounded-sm [:not(pre)>&]:bg-panel-hundido [:not(pre)>&]:px-1"
      {...p}
    />
  ),
  blockquote: (p) => (
    <blockquote
      className="mb-3 rounded-md border border-plazo-atento/40 bg-plazo-atento-suave px-3 py-2"
      {...p}
    />
  ),
};

export function Markdown({ texto }: { texto: string }) {
  return <ReactMarkdown components={COMPONENTES}>{texto}</ReactMarkdown>;
}
