import { Camera, FileText, Image as ImagenIcono, Loader2, Mail, Paperclip, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import { quitarArchivoPendiente, subirArchivos, type ArchivoDatos } from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAXIMO_ARCHIVOS = 10;

interface ItemSubida {
  clave: number;
  nombre: string;
}
interface ErrorSubida {
  clave: number;
  nombre: string;
  mensaje: string;
}

function mensajeDeSubida(err: unknown): string {
  if (err instanceof ErrorApi) {
    if (err.codigo === 'ARCHIVO_NO_PERMITIDO') return 'Tipo de archivo no permitido.';
    if (err.codigo === 'ARCHIVO_MUY_GRANDE') return 'Supera el máximo de 20 MB.';
    if (err.codigo === 'DEMASIADOS_ARCHIVOS') return `Máximo ${MAXIMO_ARCHIVOS} archivos.`;
    return err.message;
  }
  return 'No se pudo subir. Intenta de nuevo.';
}

// Las fotos se reducen antes de subir (ADR 0009); si falla la compresión se sube el original.
async function prepararArchivo(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || /heic|gif|svg/.test(archivo.type)) return archivo;
  try {
    const { default: comprimir } = await import('browser-image-compression');
    const resultado = await comprimir(archivo, {
      maxWidthOrHeight: 2000,
      initialQuality: 0.8,
      useWebWorker: true,
    });
    return new File([resultado], archivo.name, { type: resultado.type || archivo.type });
  } catch {
    return archivo;
  }
}

function IconoArchivo({ archivo }: { archivo: ArchivoDatos }) {
  if (archivo.es_imagen) {
    return (
      <img
        src={archivo.url}
        alt=""
        className="size-10 shrink-0 rounded-md border object-cover"
        loading="lazy"
      />
    );
  }
  const Icono = archivo.categoria === 'correo' ? Mail : FileText;
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-superficie-suave text-tinta-2">
      <Icono aria-hidden="true" className="size-5" />
    </span>
  );
}

// Zona de arrastre o botones compactos ("Fotos"/"Archivo"); sube en cuanto se eligen (dos pasos, ADR 0009).
export function SubidaArchivos({
  archivos,
  onChange,
  acepta,
  camara = false,
  compacto = false,
}: {
  archivos: ArchivoDatos[];
  onChange: (archivos: ArchivoDatos[]) => void;
  acepta?: string;
  /** Agrega un botón "Tomar foto" que abre la cámara en el celular. */
  camara?: boolean;
  /** Dos botones (Fotos con cámara y Archivo) en lugar de la zona de arrastre. */
  compacto?: boolean;
}) {
  const entradaArchivos = useRef<HTMLInputElement>(null);
  const entradaCamara = useRef<HTMLInputElement>(null);
  const actuales = useRef<ArchivoDatos[]>(archivos);
  actuales.current = archivos;
  const secuencia = useRef(0);
  const [subiendo, setSubiendo] = useState<ItemSubida[]>([]);
  const [errores, setErrores] = useState<ErrorSubida[]>([]);
  const [arrastrando, setArrastrando] = useState(false);

  async function procesar(elegidos: File[]) {
    if (elegidos.length === 0) return;
    const cupo = Math.max(MAXIMO_ARCHIVOS - actuales.current.length, 0);
    const aceptados = elegidos.slice(0, cupo);
    setErrores(
      elegidos.slice(aceptados.length).map((f) => ({
        clave: ++secuencia.current,
        nombre: f.name,
        mensaje: `Máximo ${MAXIMO_ARCHIVOS} archivos.`,
      })),
    );
    for (const archivo of aceptados) {
      const clave = ++secuencia.current;
      setSubiendo((s) => [...s, { clave, nombre: archivo.name }]);
      try {
        const listo = await prepararArchivo(archivo);
        const subidos = await subirArchivos([listo]);
        actuales.current = [...actuales.current, ...subidos];
        onChange(actuales.current);
      } catch (err) {
        setErrores((e) => [...e, { clave, nombre: archivo.name, mensaje: mensajeDeSubida(err) }]);
      } finally {
        setSubiendo((s) => s.filter((x) => x.clave !== clave));
      }
    }
  }

  async function quitar(archivo: ArchivoDatos) {
    try {
      await quitarArchivoPendiente(archivo.id);
    } catch (err) {
      // 404: ya no existe (limpiado o ajeno); igual se quita de la lista
      if (!(err instanceof ErrorApi && err.status === 404)) {
        setErrores([
          {
            clave: ++secuencia.current,
            nombre: archivo.nombre_original,
            mensaje: mensajeDeSubida(err),
          },
        ]);
        return;
      }
    }
    actuales.current = actuales.current.filter((a) => a.id !== archivo.id);
    onChange(actuales.current);
  }

  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    void procesar(Array.from(e.dataTransfer.files));
  };

  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = '';
    void procesar(elegidos);
  };

  const botonCamara = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => entradaCamara.current?.click()}
    >
      <Camera aria-hidden="true" />
      {compacto ? 'Fotos' : 'Tomar foto'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={entradaArchivos}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir archivos"
        {...(acepta ? { accept: acepta } : {})}
        onChange={alElegir}
      />
      {camara || compacto ? (
        <input
          ref={entradaCamara}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Tomar foto"
          onChange={alElegir}
        />
      ) : null}

      {compacto ? (
        <div className="flex flex-wrap gap-2">
          {botonCamara}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => entradaArchivos.current?.click()}
          >
            <Paperclip aria-hidden="true" />
            Archivo
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={alSoltar}
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border border-dashed border-borde-campo bg-superficie-suave-2 px-4 py-6 text-center text-sm text-tinta-2',
            arrastrando && 'border-acento bg-media-fondo',
          )}
        >
          <ImagenIcono aria-hidden="true" className="size-6 text-tinta-3" />
          <p>Arrastra archivos aquí o elígelos desde tu equipo</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => entradaArchivos.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              Elegir archivos
            </Button>
            {camara ? botonCamara : null}
          </div>
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-1.5">
        {subiendo.map((s) => (
          <p key={s.clave} className="flex items-center gap-2 text-sm text-tinta-2">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Subiendo {s.nombre}…
          </p>
        ))}
        {errores.map((e) => (
          <p key={e.clave} role="alert" className="text-sm text-urgente">
            {e.nombre}: {e.mensaje}
          </p>
        ))}
      </div>

      {archivos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {archivos.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border bg-superficie px-2 py-1.5"
            >
              <IconoArchivo archivo={a} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{a.nombre_original}</span>
                <span className="text-xs text-tinta-2">{formatearTamano(a.tamano)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar ${a.nombre_original}`}
                onClick={() => void quitar(a)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
