import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { SubidaArchivos } from '@/components/dominio/SubidaArchivos';
import { useUsuariosActivos } from '@/components/dominio/SelectorPersonas';
import { Avatar } from '@/components/dominio/Avatar';
import { CasillaTactil } from '@/components/dominio/CasillaTactil';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { crearMensajeOt, invalidarOt } from '@/features/ots/api';
import {
  crearMensaje,
  invalidarTicket,
  quitarArchivoPendiente,
  type ArchivoDatos,
  type MensajeEntradaDatos,
} from '@/features/tickets/api';
import { ErrorApi } from '@/lib/api';
import { useEsMovil } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import type { TipoMensaje } from '@zydesk/shared';

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const TEXTOS: Record<
  TipoMensaje,
  { ayuda: string; placeholder: string; boton: string; ok: string }
> = {
  seguimiento: {
    ayuda: 'Avance oficial del ticket: qué se hizo, qué se acordó o qué respondió el cliente.',
    placeholder: 'Registra un avance, acuerdo o respuesta del cliente…',
    boton: 'Registrar seguimiento',
    ok: 'Seguimiento registrado',
  },
  nota_interna: {
    ayuda: 'Contexto solo para el equipo. No se incluye en reportes al cliente.',
    placeholder: 'Escribe una nota interna…',
    boton: 'Guardar nota',
    ok: 'Nota guardada',
  },
};

interface Mencion {
  /** Posición del `@` en el texto. */
  inicio: number;
  consulta: string;
}

// Horas válidas: múltiplos de 0,25 entre 0,25 y 24 (vacío = sin horas).
function horasValidas(texto: string): boolean {
  if (texto.trim() === '') return true;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0.25 && n <= 24 && Number.isInteger(n * 4);
}

export interface DestinoMensajes {
  tipo: 'ticket' | 'ot';
  id: number;
}

// Redactor de seguimientos y notas de un ticket o de una OT. `ticketId` es la forma anterior de
// `destino`. Con `copiaAlTicket` (solo OT) ofrece "Copiar al ticket"; `codigoTicket` lo nombra.
export function Redactor({
  destino: destinoProp,
  ticketId,
  onEnviado,
  copiaAlTicket = false,
  codigoTicket,
  sinHoras = false,
  autoEnfocar = false,
  abrirCamaraAlMontar = false,
  onCancelar,
}: {
  destino?: DestinoMensajes;
  ticketId?: number;
  onEnviado?: () => void;
  copiaAlTicket?: boolean;
  codigoTicket?: string;
  // OT cerrada o cancelada: el mensaje se permite pero no las horas.
  sinHoras?: boolean;
  /** Enfoca el texto y lo centra en pantalla al montar. */
  autoEnfocar?: boolean;
  /** Abre la cámara al montar (botón de cámara de la barra plegada). */
  abrirCamaraAlMontar?: boolean;
  /** Muestra «Cancelar»; con texto o archivos pendientes pide confirmar el descarte. */
  onCancelar?: () => void;
}) {
  const esMovil = useEsMovil();
  const destino: DestinoMensajes = destinoProp ?? { tipo: 'ticket', id: ticketId ?? 0 };
  const queryClient = useQueryClient();
  const usuarios = useUsuariosActivos();
  const areaTexto = useRef<HTMLTextAreaElement>(null);
  const [modo, setModo] = useState<TipoMensaje>('seguimiento');
  const [texto, setTexto] = useState('');
  const [horas, setHoras] = useState('');
  const [copiar, setCopiar] = useState(false);
  const [archivos, setArchivos] = useState<ArchivoDatos[]>([]);
  const [elegidos, setElegidos] = useState<Map<number, string>>(new Map());
  const [mencion, setMencion] = useState<Mencion | null>(null);
  const [activo, setActivo] = useState(0);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmaDescarte, setConfirmaDescarte] = useState(false);

  useEffect(() => {
    if (!autoEnfocar) return;
    areaTexto.current?.focus();
    areaTexto.current?.scrollIntoView?.({ block: 'center' });
  }, [autoEnfocar]);

  const opciones = mencion
    ? (usuarios.data ?? [])
        .filter((u) => sinTildes(u.nombre).includes(sinTildes(mencion.consulta)))
        .slice(0, 6)
    : [];
  const menuAbierto = mencion !== null && opciones.length > 0;
  const textos = TEXTOS[modo];
  const horasOk = sinHoras || horasValidas(horas);
  const puedeEnviar = texto.trim() !== '' && horasOk;

  const enviarMensaje = useMutation({
    mutationFn: (entrada: MensajeEntradaDatos) =>
      destino.tipo === 'ot'
        ? crearMensajeOt(destino.id, entrada)
        : crearMensaje(destino.id, entrada),
    onSuccess: async () => {
      toast.success(textos.ok);
      setTexto('');
      setHoras('');
      setCopiar(false);
      setArchivos([]);
      setElegidos(new Map());
      setMencion(null);
      await (destino.tipo === 'ot'
        ? invalidarOt(queryClient, destino.id)
        : invalidarTicket(queryClient, destino.id));
      onEnviado?.();
    },
    onError: (err) =>
      setErrorGeneral(
        err instanceof ErrorApi ? err.message : 'No se pudo conectar. Intenta de nuevo.',
      ),
  });

  function enviar() {
    if (!puedeEnviar || enviarMensaje.isPending) return;
    setErrorGeneral(null);
    // Una mención cuyo nombre ya no está en el texto no se envía.
    const mencionados_ids = [...elegidos]
      .filter(([, nombre]) => texto.includes(`@${nombre}`))
      .map(([id]) => id);
    enviarMensaje.mutate({
      tipo: modo,
      texto: texto.trim(),
      archivo_ids: archivos.map((a) => a.id),
      mencionados_ids,
      horas: sinHoras || horas.trim() === '' ? null : Number(horas),
      ...(copiaAlTicket && copiar ? { copiar_al_ticket: true } : {}),
    });
  }

  function alCambiarTexto(e: ChangeEvent<HTMLTextAreaElement>) {
    const valor = e.target.value;
    setTexto(valor);
    const antes = valor.slice(0, e.target.selectionStart);
    const m = /(^|\s)@([^\s@]*)$/.exec(antes);
    if (m) {
      setMencion({ inicio: antes.length - (m[2]?.length ?? 0) - 1, consulta: m[2] ?? '' });
      setActivo(0);
    } else {
      setMencion(null);
    }
  }

  function elegirMencion(indice: number) {
    const persona = opciones[indice];
    const area = areaTexto.current;
    if (!persona || !mencion || !area) return;
    const cursor = area.selectionStart;
    const insertado = `@${persona.nombre} `;
    const nuevo = texto.slice(0, mencion.inicio) + insertado + texto.slice(cursor);
    setTexto(nuevo);
    setElegidos((m) => new Map(m).set(persona.id, persona.nombre));
    setMencion(null);
    const posicion = mencion.inicio + insertado.length;
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(posicion, posicion);
    }, 0);
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enviar();
      return;
    }
    if (!menuAbierto) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => (i + 1) % opciones.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => (i - 1 + opciones.length) % opciones.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      elegirMencion(activo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMencion(null);
    }
  }

  function cancelar() {
    if (texto.trim() === '' && archivos.length === 0) onCancelar?.();
    else setConfirmaDescarte(true);
  }

  function descartar() {
    // Mejor esfuerzo: los archivos pendientes también los limpia el job diario (ADR 0009).
    for (const a of archivos) void quitarArchivoPendiente(a.id).catch(() => undefined);
    setConfirmaDescarte(false);
    onCancelar?.();
  }

  const esNota = modo === 'nota_interna';
  return (
    <section
      aria-label="Redactor"
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3',
        esNota ? 'border-nota-interna-borde bg-nota-interna-fondo' : 'bg-superficie-suave',
      )}
    >
      <div
        role="group"
        aria-label="Tipo de mensaje"
        className="inline-flex w-fit rounded-md bg-black/5 p-0.5"
      >
        {(['seguimiento', 'nota_interna'] as const).map((tipo) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={modo === tipo}
            onClick={() => setModo(tipo)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-[6px] px-3 text-sm font-medium lg:min-h-9',
              modo === tipo ? 'bg-white shadow-sm' : 'text-tinta-2 hover:text-tinta',
            )}
          >
            {tipo === 'nota_interna' ? <Lock aria-hidden="true" className="size-3.5" /> : null}
            {tipo === 'seguimiento' ? 'Seguimiento' : 'Nota interna'}
          </button>
        ))}
      </div>
      <p className="text-sm text-tinta-2">{textos.ayuda}</p>

      <Popover open={menuAbierto}>
        <PopoverAnchor asChild>
          <div>
            <Textarea
              ref={areaTexto}
              aria-label="Texto del mensaje"
              placeholder={textos.placeholder}
              value={texto}
              rows={esMovil ? 4 : 3}
              onChange={alCambiarTexto}
              onKeyDown={alTeclear}
              className="min-h-20 bg-white"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          side="top"
          align="start"
          className="w-72 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ul role="listbox" aria-label="Mencionar a" className="flex flex-col">
            {opciones.map((u, i) => (
              <li
                key={u.id}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegirMencion(i)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm lg:min-h-9',
                  i === activo && 'bg-superficie-suave',
                )}
              >
                <Avatar
                  iniciales={u.iniciales}
                  color={u.color_avatar}
                  className="size-6 text-[10px]"
                />
                {u.nombre}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <SubidaArchivos
        compacto
        archivos={archivos}
        onChange={setArchivos}
        abrirCamaraAlMontar={abrirCamaraAlMontar}
      />

      {copiaAlTicket ? (
        <div className="flex items-start gap-2">
          <CasillaTactil
            id={`copiar-${destino.id}`}
            checked={copiar}
            onCheckedChange={(v) => setCopiar(v === true)}
          />
          <div className="flex min-h-11 flex-col justify-center lg:min-h-0">
            <Label htmlFor={`copiar-${destino.id}`}>Copiar al ticket</Label>
            <p className="text-sm text-tinta-2">
              El avance también queda en {codigoTicket ?? 'el ticket'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        {sinHoras ? (
          <p className="min-w-40 flex-1 pb-2 text-sm text-tinta-2">
            La OT está cerrada: no se registran horas
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`horas-${destino.tipo}-${destino.id}`}>Horas</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`horas-${destino.tipo}-${destino.id}`}
                  type="number"
                  step={0.25}
                  min={0.25}
                  max={24}
                  inputMode="decimal"
                  value={horas}
                  aria-invalid={!horasOk}
                  onChange={(e) => setHoras(e.target.value)}
                  className="w-[90px] bg-white"
                />
                <span className="text-sm text-tinta-2">h</span>
              </div>
            </div>
            <p className="min-w-40 flex-1 pb-2 text-sm text-tinta-2">
              {horasOk ? (
                <>
                  Se suman a tu planilla de hoy; corrígelas en{' '}
                  <Link
                    to="/horas"
                    data-objetivo="en-linea"
                    className="relative -my-1 inline-block py-1 text-acento underline underline-offset-2"
                  >
                    Horas
                  </Link>
                </>
              ) : (
                'Usa múltiplos de 0,25 entre 0,25 y 24'
              )}
            </p>
          </>
        )}
        {onCancelar ? (
          <Button type="button" variant="ghost" onClick={cancelar}>
            Cancelar
          </Button>
        ) : null}
        <Button type="button" disabled={!puedeEnviar || enviarMensaje.isPending} onClick={enviar}>
          {enviarMensaje.isPending ? 'Enviando…' : textos.boton}
        </Button>
      </div>
      {errorGeneral ? (
        <p role="alert" className="text-sm text-urgente">
          {errorGeneral}
        </p>
      ) : null}
      <AlertDialog open={confirmaDescarte} onOpenChange={setConfirmaDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar el seguimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se pierde lo escrito y se quitan las fotos o archivos ya subidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir escribiendo</AlertDialogCancel>
            <AlertDialogAction onClick={descartar}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
