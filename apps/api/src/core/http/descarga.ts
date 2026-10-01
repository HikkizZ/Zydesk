// Nombre seguro para `filename=` (ASCII) y codificado para `filename*=` (RFC 5987).
export function contentDisposition(disposicion: 'inline' | 'attachment', nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]|["\\\/;]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposicion}; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}
