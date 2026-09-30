import { FileText } from 'lucide-react';
import { diaMes, formatearTamano } from '@/components/dominio/formato-fecha';
import type { ArchivoDatos } from '@/features/tickets/api';

export interface ArchivoConOrigen {
  archivo: ArchivoDatos;
  /** "en seguimiento del 29 sep" para los archivos que llegaron con un mensaje. */
  etiqueta?: string;
}

// Imágenes en cuadros de 96 px que abren en otra pestaña; documentos con ícono, nombre y tamaño.
export function GaleriaArchivos({ archivos }: { archivos: ArchivoConOrigen[] }) {
  if (archivos.length === 0) return <p className="text-sm text-tinta-2">Sin archivos</p>;
  return (
    <ul className="flex flex-wrap gap-3">
      {archivos.map(({ archivo, etiqueta }) => (
        <li key={archivo.id} className="flex w-24 flex-col gap-1">
          {archivo.es_imagen ? (
            <a
              href={archivo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block size-24 overflow-hidden rounded-md border"
            >
              <img
                src={archivo.url}
                alt={archivo.nombre_original}
                loading="lazy"
                className="size-full object-cover"
              />
            </a>
          ) : (
            <a
              href={archivo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-24 flex-col items-center justify-center gap-1 rounded-md border bg-superficie-suave p-2 text-center hover:bg-superficie-suave-2"
            >
              <FileText aria-hidden="true" className="size-6 text-tinta-2" />
              <span className="line-clamp-2 text-xs break-all">{archivo.nombre_original}</span>
              <span className="text-[11px] text-tinta-2">{formatearTamano(archivo.tamano)}</span>
            </a>
          )}
          {etiqueta ? (
            <span className="text-[11px] leading-tight text-tinta-2">{etiqueta}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export const etiquetaDeMensaje = (tipo: 'seguimiento' | 'nota_interna', creado_en: string) =>
  `en ${tipo === 'seguimiento' ? 'seguimiento' : 'nota interna'} del ${diaMes(creado_en)}`;
