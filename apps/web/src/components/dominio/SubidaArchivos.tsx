import { Camera, FileText, Image as ImagenIcono, Loader2, Mail, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import { quitarArchivoPendiente, subirArchivos, type ArchivoDatos } from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAXIMO_ARCHIVOS = 10;

interface ItemSubida {
  clave: number;
  nombre: string;
  estado: 'subiendo' | 'error';
  mensaje?: string;
  archivo: File;
  previa?: string;
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

// Imagen con su vista previa; si el navegador no la decodifica (HEIC) o no es imagen, cuadro de documento.
function Miniatura({ src, categoria }: { src?: string | undefined; categoria?: string }) {
  const [fallo, setFallo] = useState(false);
  if (src && !fallo) {
    return (
      <img
        src={src}
        alt=""
        className="size-16 shrink-0 rounded-md border object-cover"
        loading="lazy"
        onError={() => setFallo(true)}
      />
    );
  }
  const Icono = categoria === 'correo' ? Mail : FileText;
  return (
    <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-md border bg-superficie-suave text-tinta-2">
      <Icono aria-hidden="true" className="size-6" />
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
  etiquetaFotos,
  etiquetaArchivo,
  abrirCamaraAlMontar = false,
}: {
  archivos: ArchivoDatos[];
  onChange: (archivos: ArchivoDatos[]) => void;
  acepta?: string;
  /** Agrega un botón "Tomar foto" que abre la cámara en el celular. */
  camara?: boolean;
  /** Dos botones (Fotos con cámara y Archivo) en lugar de la zona de arrastre. */
  compacto?: boolean;
  /** Textos de los botones compactos (por defecto "Fotos" y "Archivo"). */
  etiquetaFotos?: string;
  etiquetaArchivo?: string;
  /** Abre la cámara al montar (la usa `RedactorPlegable` desde su botón de cámara). */
  abrirCamaraAlMontar?: boolean;
}) {
  const entradaArchivos = useRef<HTMLInputElement>(null);
  const entradaCamara = useRef<HTMLInputElement>(null);
  const actuales = useRef<ArchivoDatos[]>(archivos);
  const secuencia = useRef(0);
  const [items, setItems] = useState<ItemSubida[]>([]);
  const [previas, setPrevias] = useState<Map<number, string>>(new Map());
  const [contador, setContador] = useState<{ total: number; hechas: number } | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<{ nombre: string; mensaje: string } | null>(
    null,
  );
  const [arrastrando, setArrastrando] = useState(false);
  const lote = useRef({ total: 0, hechas: 0, pendientes: 0 });
  const vivas = useRef(new Set<string>());
  const camaraAbierta = useRef(false);

  function crearPrevia(archivo: File) {
    if (!archivo.type.startsWith('image/')) return undefined;
    const url = URL.createObjectURL(archivo);
    vivas.current.add(url);
    return url;
  }
  function revocar(url: string | undefined) {
    if (url && vivas.current.delete(url)) URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const urls = vivas.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (!abrirCamaraAlMontar || camaraAbierta.current) return;
    camaraAbierta.current = true;
    entradaCamara.current?.click();
  }, [abrirCamaraAlMontar]);

  useEffect(() => {
    actuales.current = archivos;
  }, [archivos]);

  // Libera las vistas previas de los archivos que el padre ya no tiene (mensaje enviado).
  useEffect(() => {
    const ids = new Set(archivos.map((a) => a.id));
    for (const [id, url] of previas) if (!ids.has(id)) revocar(url);
  }, [archivos, previas]);

  function iniciarLote(n: number) {
    lote.current.total += n;
    lote.current.pendientes += n;
    setContador({ total: lote.current.total, hechas: lote.current.hechas });
  }

  function terminarUno(ok: boolean) {
    const l = lote.current;
    l.pendientes -= 1;
    if (ok) l.hechas += 1;
    if (l.pendientes <= 0) {
      lote.current = { total: 0, hechas: 0, pendientes: 0 };
      setContador(null);
    } else {
      setContador({ total: l.total, hechas: l.hechas });
    }
  }

  async function subirItem(item: ItemSubida) {
    let ok = false;
    try {
      const listo = await prepararArchivo(item.archivo);
      const subidos = await subirArchivos([listo]);
      actuales.current = [...actuales.current, ...subidos];
      const subido = subidos[0];
      if (item.previa && subido) {
        const previa = item.previa;
        setPrevias((m) => new Map(m).set(subido.id, previa));
      } else {
        revocar(item.previa);
      }
      setItems((s) => s.filter((x) => x.clave !== item.clave));
      onChange(actuales.current);
      ok = true;
    } catch (err) {
      const mensaje = mensajeDeSubida(err);
      setItems((s) =>
        s.map((x) => (x.clave === item.clave ? { ...x, estado: 'error', mensaje } : x)),
      );
    } finally {
      terminarUno(ok);
    }
  }

  const cupoLibre = () =>
    Math.max(MAXIMO_ARCHIVOS - actuales.current.length - lote.current.pendientes, 0);

  async function procesar(elegidos: File[]) {
    if (elegidos.length === 0) return;
    setErrorGeneral(null);
    const aceptados = elegidos.slice(0, cupoLibre());
    const nuevos = aceptados.map((archivo): ItemSubida => {
      const previa = crearPrevia(archivo);
      return {
        clave: ++secuencia.current,
        nombre: archivo.name,
        estado: 'subiendo',
        archivo,
        ...(previa ? { previa } : {}),
      };
    });
    const rechazados = elegidos.slice(aceptados.length).map((archivo): ItemSubida => ({
      clave: ++secuencia.current,
      nombre: archivo.name,
      estado: 'error',
      mensaje: `Máximo ${MAXIMO_ARCHIVOS} archivos.`,
      archivo,
    }));
    setItems((s) => [...s, ...nuevos, ...rechazados]);
    if (nuevos.length > 0) iniciarLote(nuevos.length);
    for (const item of nuevos) await subirItem(item);
  }

  async function reintentar(item: ItemSubida) {
    if (cupoLibre() === 0) return;
    setItems((s) =>
      s.map((x) => (x.clave === item.clave ? { ...x, estado: 'subiendo' as const } : x)),
    );
    iniciarLote(1);
    await subirItem(item);
  }

  function quitarItem(item: ItemSubida) {
    revocar(item.previa);
    setItems((s) => s.filter((x) => x.clave !== item.clave));
  }

  async function quitar(archivo: ArchivoDatos) {
    try {
      await quitarArchivoPendiente(archivo.id);
    } catch (err) {
      // 404: ya no existe (limpiado o ajeno); igual se quita de la lista
      if (!(err instanceof ErrorApi && err.status === 404)) {
        setErrorGeneral({ nombre: archivo.nombre_original, mensaje: mensajeDeSubida(err) });
        return;
      }
    }
    revocar(previas.get(archivo.id));
    setPrevias((m) => {
      const nuevo = new Map(m);
      nuevo.delete(archivo.id);
      return nuevo;
    });
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
      {compacto ? (etiquetaFotos ?? 'Fotos') : 'Tomar foto'}
    </Button>
  );

  const palabra = items.every((x) => x.archivo.type.startsWith('image/')) ? 'fotos' : 'archivos';

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
      {camara || compacto || abrirCamaraAlMontar ? (
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
            {etiquetaArchivo ?? 'Archivo'}
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

      <p aria-live="polite" className="text-sm text-tinta-2">
        {contador
          ? contador.total === 1
            ? 'Subiendo 1 archivo…'
            : `${contador.hechas} de ${contador.total} ${palabra} subidas`
          : null}
      </p>
      {errorGeneral ? (
        <p role="alert" className="text-sm text-urgente">
          {errorGeneral.nombre}: {errorGeneral.mensaje}
        </p>
      ) : null}

      {archivos.length > 0 || items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {archivos.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border bg-superficie px-2 py-1.5"
            >
              <Miniatura
                src={previas.get(a.id) ?? (a.es_imagen ? a.url : undefined)}
                categoria={a.categoria}
              />
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
          {items.map((it) => (
            <li
              key={it.clave}
              className="flex items-center gap-3 rounded-md border bg-superficie px-2 py-1.5"
            >
              <Miniatura src={it.previa} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{it.nombre}</span>
                {it.estado === 'error' ? (
                  <span role="alert" className="text-sm text-urgente">
                    {it.mensaje}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-tinta-2">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Subiendo…
                  </span>
                )}
              </span>
              {it.estado === 'error' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void reintentar(it)}
                  >
                    Reintentar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar ${it.nombre}`}
                    onClick={() => quitarItem(it)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
