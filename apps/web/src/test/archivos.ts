import { respuesta, simularFetch, type Llamada } from '@/test/fetch';

export function archivoDePrueba(nombre: string, tipo: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

// Forma de un elemento de la respuesta de `POST /api/archivos`.
export function archivoSubido(id: number, nombre: string, tipo = 'image/jpeg') {
  const esImagen = tipo.startsWith('image/');
  return {
    id,
    nombre_original: nombre,
    tipo_mime: tipo,
    tamano: 1024,
    categoria: esImagen ? 'foto' : 'documento',
    url: `/api/archivos/${id}`,
    es_imagen: esImagen,
    subido_por: null,
    subido_en: '2026-10-05T12:00:00.000Z',
    origen_correo: false,
  };
}

// Simula `POST /api/archivos` (un archivo por llamada, ids correlativos desde 1) y
// `DELETE /api/archivos/:id`; `fallaLaSubida: N` hace que la N-ésima subida (1 = la primera) responda
// `ARCHIVO_NO_PERMITIDO`. `otros` se consultan antes que los anteriores.
export function simularArchivos(
  { fallaLaSubida }: { fallaLaSubida?: number } = {},
  ...otros: Parameters<typeof simularFetch>
): Llamada[] {
  let subidas = 0;
  return simularFetch(...otros, ({ metodo, ruta }) => {
    if (metodo === 'POST' && ruta === '/api/archivos') {
      subidas += 1;
      if (subidas === fallaLaSubida)
        return respuesta(415, {
          error: { codigo: 'ARCHIVO_NO_PERMITIDO', mensaje: 'Tipo no permitido' },
        });
      return respuesta(201, [archivoSubido(subidas, `foto-${subidas}.jpg`)]);
    }
    if (metodo === 'DELETE' && /^\/api\/archivos\/\d+$/.test(ruta)) return respuesta(204);
    return undefined;
  });
}
