import type { Manual } from './manuales';

// Las capturas de los manuales entran al bundle como assets de Vite (URL con hash en /assets; nunca
// en línea, `build.assetsInlineLimit: 0`). Fase 8, spec §10.4.
const IMAGENES = import.meta.glob('../../../../../docs/manuales/img/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PREFIJO = 'docs/manuales/';

// Clave = ruta relativa a `docs/manuales/` (p. ej. `img/tecnico/detalle-ticket.png`).
const POR_RUTA = new Map<string, string>(
  Object.entries(IMAGENES).map(([clave, url]) => [
    clave.slice(clave.indexOf(PREFIJO) + PREFIJO.length),
    url,
  ]),
);

// Rutas de imágenes disponibles en el bundle (para el test de huérfanas).
export const RUTAS_DE_IMAGENES: readonly string[] = [...POR_RUTA.keys()];

// Normaliza `src` (relativo al `.md`) a una ruta bajo `docs/manuales/`; null si sale de esa carpeta.
export function rutaDeImagen(
  manual: Pick<Manual, 'carpeta'>,
  src: string | undefined,
): string | null {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || src.includes('\\')) {
    return null;
  }
  const partes: string[] = manual.carpeta ? [manual.carpeta] : [];
  for (const parte of src.split('/')) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') {
      if (partes.pop() === undefined) return null;
    } else {
      partes.push(parte);
    }
  }
  return partes.join('/');
}

// URL del bundle para la imagen, o null si `src` no es relativa, sale de `docs/manuales` o no existe.
export function resolverImagen(
  manual: Pick<Manual, 'carpeta'>,
  src: string | undefined,
): string | null {
  const ruta = rutaDeImagen(manual, src);
  return ruta ? (POR_RUTA.get(ruta) ?? null) : null;
}
