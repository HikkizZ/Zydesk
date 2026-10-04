import { MANUALES } from './manuales';

export type EnlaceResuelto =
  | { tipo: 'ancla'; href: string }
  | { tipo: 'interno'; to: string }
  | { tipo: 'texto' }
  | { tipo: 'externo'; href: string };

// Clasifica el `href` de un enlace escrito en un manual (spec fase 6 §27.4).
export function resolverEnlace(href: string | undefined): EnlaceResuelto {
  if (!href) return { tipo: 'texto' };
  if (href.startsWith('#')) return { tipo: 'ancla', href };
  if (/^(https?:\/\/|mailto:)/i.test(href)) return { tipo: 'externo', href };
  const [ruta = '', ...resto] = href.split('#');
  if (ruta.toLowerCase().endsWith('.md')) {
    const base = ruta.split('/').pop()!;
    const manual = MANUALES.find((m) => m.archivo === base);
    if (!manual) return { tipo: 'texto' };
    const ancla = resto.join('#');
    return { tipo: 'interno', to: `/ayuda/${manual.clave}${ancla ? `#${ancla}` : ''}` };
  }
  return { tipo: 'interno', to: href };
}
