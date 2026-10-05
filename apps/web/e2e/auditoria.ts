import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

// Helpers de medición (spec §9.2). Cada uno corre en la página con `evaluate`; el código común vive en
// `BASE`, un texto que define las funciones dentro de cada evaluación (no se comparte estado entre ellas).
// `selectorDe(el)` (en `BASE`): `tag#id`, `tag[aria-label]` o `tag.clase.clase` + texto recortado a 30.
const BASE = `
  const selectorDe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.getAttribute('aria-label')) s += '[aria-label="' + el.getAttribute('aria-label') + '"]';
    else if (typeof el.className === 'string' && el.className.trim())
      s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
    const texto = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
    return texto ? s + ' "' + texto + '"' : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // El contenido de un <details> cerrado no se pinta (solo su summary).
    if (el.closest('details:not([open])') && !el.closest('summary')) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  };
  const dentro = (el, raiz) => !raiz || Boolean(document.querySelector(raiz)?.contains(el));
`;

const evaluar = <T>(page: Page, cuerpo: string): Promise<T> =>
  page.evaluate(`(() => { ${BASE} ${cuerpo} })()`) as Promise<T>;

// §3.2.1: desborde del documento y elementos visibles que sobresalen por la derecha. Un elemento
// dentro de un contenedor con scroll horizontal propio (que sí cabe) no cuenta.
export function desbordes(page: Page): Promise<{ documento: number; elementos: string[] }> {
  return evaluar(
    page,
    `
    const ancho = innerWidth;
    const recortado = (el) => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible' && p.getBoundingClientRect().right <= ancho + 1) return true;
      }
      return false;
    };
    const elementos = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      if (el.getBoundingClientRect().right > ancho + 1 && !recortado(el)) elementos.push(selectorDe(el));
    }
    const de = document.documentElement;
    return { documento: de.scrollWidth - de.clientWidth, elementos: elementos.slice(0, 30) };
  `,
  );
}

// §3.2.2: controles con área táctil < 44 px (la del control o la de su label envolvente). Los enlaces
// `data-objetivo="en-linea"` deben medir ≥ 24 px de alto; `cubre-tarjeta` se verifica aparte con un clic.
export function objetivosChicos(
  page: Page,
  raiz?: string,
): Promise<{ selector: string; ancho: number; alto: number }[]> {
  return evaluar(
    page,
    `
    const raiz = ${JSON.stringify(raiz ?? null)};
    const CONTROLES = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=checkbox], [role=switch], [role=tab], [role=option], [role=menuitem], [role=link], label[for]';
    const chicos = [];
    for (const el of document.querySelectorAll(CONTROLES)) {
      if (!dentro(el, raiz) || !visible(el)) continue;
      if (el.classList.contains('sr-only') || el.closest('[aria-hidden="true"]')) continue;
      const tipo = el.getAttribute('data-objetivo');
      if (tipo === 'cubre-tarjeta') continue;
      // Un <label for> que solo rotula (no envuelve su control) no es un objetivo: el control que
      // rotula se mide por sí mismo. Sí se mide el label que envuelve a su control (CasillaTactil).
      if (el.tagName === 'LABEL' && !el.querySelector('input, button, select, textarea')) continue;
      const r = el.getBoundingClientRect();
      const label = el.closest('label');
      const lr = label ? label.getBoundingClientRect() : null;
      const ancho = Math.max(r.width, lr ? lr.width : 0);
      const alto = Math.max(r.height, lr ? lr.height : 0);
      const falla = tipo === 'en-linea' ? alto < 23.5 : Math.min(ancho, alto) < 43.5;
      if (falla) chicos.push({ selector: selectorDe(el), ancho: Math.round(ancho), alto: Math.round(alto) });
    }
    return chicos;
  `,
  );
}

// §3.2.3: texto propio visible con letra < 12 px (salvo decorativos aria-hidden e insignias).
export function letraChica(page: Page): Promise<{ selector: string; px: number }[]> {
  return evaluar(
    page,
    `
    const chicas = [];
    for (const el of document.body.querySelectorAll('*')) {
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!propio || !visible(el)) continue;
      if (el.closest('[aria-hidden="true"]') || el.closest('[data-letra="insignia"]')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) chicas.push({ selector: selectorDe(el), px });
    }
    return chicas;
  `,
  );
}

// Coordenada `y` del documento (no de la ventana) del primer elemento que coincide.
export function posicionY(page: Page, selector: string | Locator): Promise<number> {
  const el = typeof selector === 'string' ? page.locator(selector).first() : selector.first();
  return el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY, undefined, {
    timeout: 3_000,
  });
}

export const altoDocumento = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollHeight);

// §3.2.8: violaciones serias o críticas de WCAG 2 A/AA.
export async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.map((n) => n.target.join(' ')) }));
}
