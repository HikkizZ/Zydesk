import { ChevronDown, Mail, Paperclip } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatearTamano } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  parsearCorreo,
  subirArchivos,
  type ArchivoDatos,
  type CorreoParseadoDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { formatearFechaHora } from '@/lib/fechas';
import { cn } from '@/lib/utils';

export type ReferenciaCorreo =
  { archivo_id: number; adjuntos_indices: number[] } | { texto: string };

export interface CorreoUsado {
  referencia: ReferenciaCorreo;
  nombre: string;
  datos: CorreoParseadoDatos;
}

interface Vista {
  datos: CorreoParseadoDatos;
  archivo: ArchivoDatos | null;
  texto: string | null;
}

function mensajeDeError(err: unknown): string {
  if (err instanceof ErrorApi) {
    if (err.codigo === 'CORREO_ILEGIBLE') {
      return 'No se pudo leer el archivo. Prueba pegando el texto.';
    }
    if (err.codigo === 'ARCHIVO_NO_PERMITIDO') return 'Ese tipo de archivo no está permitido.';
    if (err.codigo === 'ARCHIVO_MUY_GRANDE') return 'El archivo supera el máximo de 20 MB.';
    return err.message;
  }
  return 'No se pudo conectar. Intenta de nuevo.';
}

// Panel "Adjuntar correo": arrastrar `.eml`/`.msg` o pegar el texto; muestra lo leído y deja al
// formulario decidir qué rellenar (`alUsar`). No se conecta a ningún buzón (spec 4.2).
export function PanelCorreo({
  usado,
  alUsar,
  alQuitar,
  autoFoco = false,
}: {
  usado: { nombre: string } | null;
  alUsar: (correo: CorreoUsado) => void;
  alQuitar: () => void;
  autoFoco?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(true);
  const [pestana, setPestana] = useState('archivo');
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [arrastrando, setArrastrando] = useState(false);

  async function leer(origen: { archivo: File } | { texto: string }) {
    setError(null);
    setVista(null);
    setLeyendo(true);
    try {
      if ('archivo' in origen) {
        const [subido] = await subirArchivos([origen.archivo]);
        if (!subido) throw new Error('sin archivo');
        const datos = await parsearCorreo({ archivo_id: subido.id });
        setVista({ datos, archivo: subido, texto: null });
        setMarcados(new Set(datos.adjuntos.filter((a) => a.permitido).map((a) => a.indice)));
      } else {
        const datos = await parsearCorreo({ texto: origen.texto });
        setVista({ datos, archivo: null, texto: origen.texto });
        setMarcados(new Set());
      }
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setLeyendo(false);
    }
  }

  function elegirArchivo(archivos: FileList | File[]) {
    const archivo = Array.from(archivos)[0];
    if (!archivo) return;
    if (!/\.(eml|msg)$/i.test(archivo.name)) {
      setError('Elige un archivo .eml o .msg, o pega el texto del correo.');
      return;
    }
    void leer({ archivo });
  }

  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    elegirArchivo(e.dataTransfer.files);
  };

  function usar() {
    if (!vista) return;
    alUsar({
      referencia: vista.archivo
        ? { archivo_id: vista.archivo.id, adjuntos_indices: [...marcados].sort((a, b) => a - b) }
        : { texto: vista.texto ?? '' },
      nombre: vista.archivo?.nombre_original ?? 'Texto pegado',
      datos: vista.datos,
    });
    setVista(null);
    setTexto('');
    setAbierto(false);
  }

  return (
    <section
      aria-label="Adjuntar correo"
      className="rounded-lg border border-borde bg-superficie p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-titulo text-base font-semibold">
          <Mail aria-hidden="true" className="size-4" />
          Adjuntar correo
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="lg:hidden"
          aria-expanded={abierto}
          aria-controls="contenido-panel-correo"
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? 'Ocultar' : 'Mostrar'}
          <ChevronDown aria-hidden="true" className={cn(abierto && 'rotate-180')} />
        </Button>
      </div>

      {usado ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>
            Correo adjunto: <span className="font-medium">{usado.nombre}</span>
          </span>
          <span aria-hidden="true">·</span>
          <Button type="button" variant="link" className="h-auto p-0" onClick={alQuitar}>
            Quitar
          </Button>
        </p>
      ) : (
        <div id="contenido-panel-correo" className={cn('mt-3', !abierto && 'hidden lg:block')}>
          <p className="mb-3 text-sm text-tinta-2">
            Arrastra el correo (.msg o .eml) o pega su texto. Revisarás lo leído antes de usarlo.
          </p>
          <Tabs value={pestana} onValueChange={setPestana}>
            <TabsList className="w-full">
              <TabsTrigger value="archivo">Archivo</TabsTrigger>
              <TabsTrigger value="texto">Texto pegado</TabsTrigger>
            </TabsList>
            <TabsContent value="archivo" className="mt-3">
              <input
                ref={entrada}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-label="Elegir correo"
                accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
                onChange={(e) => {
                  if (e.target.files) elegirArchivo(e.target.files);
                  e.target.value = '';
                }}
              />
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
                <Paperclip aria-hidden="true" className="size-5 text-tinta-3" />
                <p>Suelta aquí el archivo del correo</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  autoFocus={autoFoco}
                  onClick={() => entrada.current?.click()}
                >
                  Elegir archivo
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="texto" className="mt-3 flex flex-col gap-2">
              <Label htmlFor="correo-texto" className="sr-only">
                Texto del correo
              </Label>
              <Textarea
                id="correo-texto"
                rows={6}
                value={texto}
                placeholder="Pega aquí el correo completo, incluidos De/Para/Asunto"
                onChange={(e) => setTexto(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={texto.trim() === '' || leyendo}
                onClick={() => void leer({ texto })}
              >
                Leer correo
              </Button>
            </TabsContent>
          </Tabs>

          <div aria-live="polite" className="mt-3">
            {leyendo ? <p className="text-sm text-tinta-2">Leyendo correo…</p> : null}
            {error ? (
              <p role="alert" className="text-sm text-urgente">
                {error}
              </p>
            ) : null}
          </div>

          {vista ? (
            <div className="mt-3 flex flex-col gap-3 border-t pt-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-tinta-2">De</dt>
                <dd className="break-words">{vista.datos.de ?? '—'}</dd>
                <dt className="text-tinta-2">Para</dt>
                <dd className="break-words">{vista.datos.para ?? '—'}</dd>
                <dt className="text-tinta-2">Fecha</dt>
                <dd>{vista.datos.fecha ? formatearFechaHora(vista.datos.fecha) : '—'}</dd>
                <dt className="text-tinta-2">Asunto</dt>
                <dd className="font-medium break-words">{vista.datos.asunto ?? '—'}</dd>
              </dl>
              <pre
                tabIndex={0}
                aria-label="Cuerpo del correo"
                className="max-h-[240px] overflow-auto rounded-md border bg-superficie-suave-2 p-3 font-texto text-sm whitespace-pre-wrap"
              >
                {vista.datos.cuerpo_texto}
              </pre>
              {vista.datos.origen !== 'texto' && vista.datos.adjuntos.length > 0 ? (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 text-sm font-medium">
                    Guardar también estos adjuntos del correo
                  </legend>
                  {vista.datos.adjuntos.map((a) => (
                    <div key={a.indice} className="flex min-h-11 items-center gap-2 text-sm">
                      <Checkbox
                        id={`adjunto-${a.indice}`}
                        checked={marcados.has(a.indice)}
                        disabled={!a.permitido}
                        aria-label={`Guardar adjunto ${a.nombre}`}
                        onCheckedChange={(v) =>
                          setMarcados((m) => {
                            const nuevo = new Set(m);
                            if (v === true) nuevo.add(a.indice);
                            else nuevo.delete(a.indice);
                            return nuevo;
                          })
                        }
                      />
                      <Label htmlFor={`adjunto-${a.indice}`} className="flex-1 font-normal">
                        {a.nombre}{' '}
                        <span className="text-tinta-2">({formatearTamano(a.tamano)})</span>
                      </Label>
                      {a.permitido ? null : <span className="text-tinta-2">No permitido</span>}
                    </div>
                  ))}
                </fieldset>
              ) : null}
              <Button type="button" onClick={usar}>
                Usar en el formulario
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
