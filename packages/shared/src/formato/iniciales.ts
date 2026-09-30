// Primera letra del primer y del último token; un solo token → sus dos primeras letras.
export function iniciales(nombre: string): string {
  const tokens = nombre.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const primero = tokens[0]!;
  if (tokens.length === 1) return primero.slice(0, 2).toUpperCase();
  const ultimo = tokens[tokens.length - 1]!;
  return `${primero.charAt(0)}${ultimo.charAt(0)}`.toUpperCase();
}
