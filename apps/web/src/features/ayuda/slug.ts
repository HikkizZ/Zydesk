// Mismo algoritmo que GitHub para los encabezados (spec fase 6 §27.4), con guiones repetidos colapsados.
export function slug(texto: string): string {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ids únicos dentro de un documento: la segunda aparición lleva `-1`, la tercera `-2`, como GitHub.
export function crearGeneradorIds(): (texto: string) => string {
  const vistos = new Map<string, number>();
  return (texto) => {
    const base = slug(texto);
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

export interface Encabezado {
  nivel: number;
  texto: string;
  id: string;
}

// Encabezados `#`…`####` del texto crudo (fuera de bloques de código con triple acento grave), con su id.
export function encabezadosDe(texto: string): Encabezado[] {
  const idDe = crearGeneradorIds();
  const salida: Encabezado[] = [];
  let enBloque = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linea)) {
      enBloque = !enBloque;
      continue;
    }
    if (enBloque) continue;
    const m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(linea);
    if (m) salida.push({ nivel: m[1]!.length, texto: m[2]!, id: idDe(m[2]!) });
  }
  return salida;
}
