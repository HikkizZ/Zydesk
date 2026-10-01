import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CierreOt,
  ESPERA_DE,
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ETAPA_OT,
  efectosCierreOt,
  type CierreOtDatos,
  type EsperaDe,
} from '@zydesk/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Campo } from '@/components/dominio/Campo';
import { useUsuariosActivos, SelectorPersonas } from '@/components/dominio/SelectorPersonas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Seleccion } from '@/features/configuracion/Seleccion';
import { cerrarOt, invalidarOt, type OtDatos } from '@/features/ots/api';
import { esDesactualizada, mensajeDeOt } from '@/features/ots/errores';
import { ErrorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Siguiente = 'en_curso' | 'en_espera' | 'nueva_ot';

const OPCIONES_SIGUIENTE: { valor: Siguiente; etiqueta: string }[] = [
  { valor: 'en_curso', etiqueta: 'Vuelve a En curso' },
  { valor: 'en_espera', etiqueta: 'Pasa a En espera' },
  { valor: 'nueva_ot', etiqueta: 'Se crea una nueva OT vinculada' },
];

const OPCIONES_ESPERA = ESPERA_DE.map((valor) => ({
  valor,
  etiqueta: ETIQUETA_ESPERA_DE[valor].replace(/^./, (c) => c.toUpperCase()),
}));

interface OtAbierta {
  id: number;
  codigo: string;
  etapa?: keyof typeof ETIQUETA_ETAPA_OT;
}

function Tarjeta({
  marcada,
  disabled,
  tono,
  titulo,
  descripcion,
  onElegir,
}: {
  marcada: boolean;
  disabled?: boolean;
  tono: 'si' | 'no';
  titulo: string;
  descripcion: string;
  onElegir: () => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-start gap-3 rounded-lg border p-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        marcada
          ? tono === 'si'
            ? 'border-2 border-resuelto bg-resuelto-fondo/50'
            : 'border-2 border-alta bg-alta-fondo/60'
          : 'bg-superficie',
      )}
    >
      <input
        type="radio"
        name="resolvio-ticket"
        checked={marcada}
        disabled={disabled}
        onChange={onElegir}
        className="mt-1 size-4 accent-[var(--color-acento)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-sm text-tinta-2">{descripcion}</span>
      </span>
    </label>
  );
}

function Contenido({ ot, onCerrar }: { ot: OtDatos; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const usuarios = useUsuariosActivos();
  const origen = ot.ticket_origen;
  const bloqueoSi = origen.otras_ots_abiertas.length > 0;
  const principal = origen.responsables.find((r) => r.principal)?.id ?? null;

  const [resolvio, setResolvio] = useState<boolean>(!bloqueoSi);
  const [siguiente, setSiguiente] = useState<Siguiente>('en_curso');
  const [esperaDe, setEsperaDe] = useState<EsperaDe | ''>('');
  const [detalle, setDetalle] = useState('');
  const [responsable, setResponsable] = useState<number | null>(principal);
  const [resumen, setResumen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorResponsable, setErrorResponsable] = useState<string | null>(null);
  const [otsAbiertas, setOtsAbiertas] = useState<OtAbierta[] | null>(null);

  const nombreResponsable = usuarios.data?.find((u) => u.id === responsable)?.nombre;
  const completoNo = responsable !== null && (siguiente !== 'en_espera' || esperaDe !== '');
  const resumenOk = resumen.trim() !== '';

  const payload = ((): CierreOtDatos | null => {
    if (!resumenOk) return null;
    if (resolvio) return { resolvio_ticket: true, resumen: resumen.trim() };
    if (!completoNo || responsable === null) return null;
    const base = { resolvio_ticket: false as const, resumen: resumen.trim() };
    if (siguiente === 'en_curso') {
      return { ...base, siguiente: { accion: 'en_curso', responsable_id: responsable } };
    }
    if (siguiente === 'nueva_ot') {
      return { ...base, siguiente: { accion: 'nueva_ot', responsable_id: responsable } };
    }
    return {
      ...base,
      siguiente: {
        accion: 'en_espera',
        responsable_id: responsable,
        espera_de: esperaDe as EsperaDe,
        ...(detalle.trim() === '' ? {} : { espera_detalle: detalle.trim() }),
      },
    };
  })();

  // Vista previa en vivo con la misma función que usa el servicio (ADR 0004).
  const efectos = (() => {
    const vista: CierreOtDatos = resolvio
      ? { resolvio_ticket: true, resumen: 'x' }
      : {
          resolvio_ticket: false,
          resumen: 'x',
          siguiente:
            siguiente === 'en_espera'
              ? {
                  accion: 'en_espera',
                  responsable_id: responsable ?? 0,
                  espera_de: esperaDe === '' ? ESPERA_DE[0] : esperaDe,
                }
              : { accion: siguiente, responsable_id: responsable ?? 0 },
        };
    const e = efectosCierreOt(
      {
        ot: { codigo: ot.codigo, tipo: ot.tipo, neto: ot.neto },
        ticket: {
          codigo: origen.codigo,
          estado: origen.estado,
          responsables: origen.responsables,
          seguidores: origen.seguidores,
        },
        responsable_siguiente: nombreResponsable ? { nombre: nombreResponsable } : null,
      },
      vista,
    );
    if (!resolvio && siguiente === 'en_espera' && esperaDe === '') {
      return { ...e, ticket: e.ticket.replace(/\([^)]*\)/, '(por definir)') };
    }
    return e;
  })();

  const cerrar = useMutation({
    mutationFn: (entrada: CierreOtDatos) => cerrarOt(ot.id, CierreOt.parse(entrada)),
    onSuccess: async (resultado, entrada) => {
      toast.success('OT cerrada');
      if (!entrada.resolvio_ticket && entrada.siguiente.accion === 'nueva_ot') {
        const antes = new Set(origen.otras_ots_abiertas.map((o) => o.id));
        const nueva = resultado.ticket_origen.otras_ots_abiertas.find((o) => !antes.has(o.id));
        if (nueva) {
          toast.success(`${nueva.codigo} creada`, {
            action: { label: 'Abrir', onClick: () => void navigate(`/ots/${nueva.id}`) },
          });
        }
      }
      await invalidarOt(queryClient, ot.id, ot.ticket.id);
      onCerrar();
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'OT_ABIERTA') {
        setOtsAbiertas((err.detalles?.['ots'] as OtAbierta[] | undefined) ?? []);
      } else if (err instanceof ErrorApi && err.codigo === 'VALIDACION') {
        const campos = (err.detalles?.['fieldErrors'] ?? err.detalles ?? {}) as Record<
          string,
          unknown
        >;
        const r = campos['responsable_id'];
        if (r) setErrorResponsable(Array.isArray(r) ? String(r[0]) : String(r));
        else setError(err.message);
      } else if (
        esDesactualizada(err) ||
        (err instanceof ErrorApi && err.codigo === 'TICKET_CERRADO')
      ) {
        toast.error(mensajeDeOt(err));
        void invalidarOt(queryClient, ot.id, ot.ticket.id);
        onCerrar();
      } else {
        setError(mensajeDeOt(err));
      }
    },
  });

  if (otsAbiertas) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>El ticket tiene otras OT abiertas</DialogTitle>
          <DialogDescription>Ciérralas o cancélalas primero.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {otsAbiertas.map((o) => (
            <li key={o.id}>
              <Link to={`/ots/${o.id}`} className="text-acento underline underline-offset-2">
                {o.codigo}
              </Link>
              {o.etapa ? (
                <span className="text-sm text-tinta-2"> · {ETIQUETA_ETAPA_OT[o.etapa]}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Entendido
          </Button>
        </DialogFooter>
      </>
    );
  }

  const textoBoton = resolvio ? 'Cerrar OT y resolver ticket' : 'Cerrar OT (ticket sigue abierto)';
  const lineas: { quien: string; texto: string; clase?: string }[] = [
    { quien: ot.codigo, texto: efectos.ot },
    {
      quien: origen.codigo,
      texto: efectos.ticket,
      clase: resolvio ? 'font-semibold text-resuelto' : 'font-semibold text-en-espera',
    },
    { quien: 'Historial', texto: efectos.historial },
    { quien: 'Avisos', texto: efectos.avisos },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cerrar {ot.codigo}</DialogTitle>
        <DialogDescription>{ot.titulo}</DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setErrorResponsable(null);
          if (payload) cerrar.mutate(payload);
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">¿Esta OT resolvió el ticket?</legend>
          <Tarjeta
            tono="si"
            marcada={resolvio}
            disabled={bloqueoSi}
            titulo="Sí"
            descripcion={`El ticket ${origen.codigo} pasa a Resuelto`}
            onElegir={() => setResolvio(true)}
          />
          {bloqueoSi ? (
            <p className="text-sm text-tinta-2">
              El ticket tiene otras OT abiertas (
              {origen.otras_ots_abiertas.map((o) => o.codigo).join(', ')}): ciérralas o cancélalas
              primero.
            </p>
          ) : null}
          <Tarjeta
            tono="no"
            marcada={!resolvio}
            titulo="No, o solo en parte"
            descripcion="El ticket sigue abierto y eliges el siguiente paso"
            onElegir={() => setResolvio(false)}
          />
        </fieldset>

        {!resolvio ? (
          <div className="flex flex-col gap-4">
            <Campo etiqueta="¿Qué pasa con el ticket?">
              {(p) => (
                <Seleccion
                  id={p.id}
                  etiqueta="¿Qué pasa con el ticket?"
                  valor={siguiente}
                  alCambiar={(v) => setSiguiente(v as Siguiente)}
                  opciones={OPCIONES_SIGUIENTE}
                />
              )}
            </Campo>
            {siguiente === 'en_espera' ? (
              <>
                <Campo etiqueta="¿De quién se espera?">
                  {(p) => (
                    <Seleccion
                      id={p.id}
                      etiqueta="¿De quién se espera?"
                      valor={esperaDe === '' ? '__ninguno__' : esperaDe}
                      alCambiar={(v) => setEsperaDe(v === '__ninguno__' ? '' : (v as EsperaDe))}
                      opciones={[{ valor: '__ninguno__', etiqueta: 'Elegir…' }, ...OPCIONES_ESPERA]}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Detalle (opcional)">
                  {(p) => (
                    <Input
                      {...p}
                      value={detalle}
                      maxLength={120}
                      onChange={(e) => setDetalle(e.target.value)}
                    />
                  )}
                </Campo>
              </>
            ) : null}
            <Campo
              etiqueta={
                siguiente === 'nueva_ot'
                  ? 'Responsable técnico de la nueva OT'
                  : 'Responsable del siguiente paso'
              }
              {...(errorResponsable ? { error: errorResponsable } : {})}
            >
              {(p) => (
                <SelectorPersonas
                  id={p.id}
                  etiqueta={
                    siguiente === 'nueva_ot'
                      ? 'Responsable técnico de la nueva OT'
                      : 'Responsable del siguiente paso'
                  }
                  valor={responsable}
                  onChange={setResponsable}
                />
              )}
            </Campo>
          </div>
        ) : null}

        <Campo etiqueta="Resumen de cierre">
          {(p) => (
            <div className="flex flex-col gap-1">
              <Textarea
                {...p}
                value={resumen}
                maxLength={5000}
                rows={4}
                placeholder={
                  resolvio
                    ? 'Ej: Se cargó el nuevo CAF en producción y se emitieron 12 facturas sin error.'
                    : 'Ej: Se cargó el CAF, pero el error persiste en notas de crédito. Falta revisar…'
                }
                onChange={(e) => setResumen(e.target.value)}
              />
              <span className="self-end text-xs text-tinta-3">{resumen.length}/5000</span>
            </div>
          )}
        </Campo>

        <section aria-label="Qué va a pasar" className="rounded-lg border bg-superficie-suave p-3">
          <h3 className="mb-2 text-sm font-semibold">Qué va a pasar</h3>
          <dl className="flex flex-col gap-2 text-sm">
            {lineas.map((l) => (
              <div key={l.quien} className="grid grid-cols-[5.5rem_1fr] gap-2">
                <dt className="font-mono text-xs text-tinta-2">{l.quien}</dt>
                <dd className={l.clase}>{l.texto}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-tinta-3">Los avisos se activan en la Fase 6.</p>
        </section>

        {error ? (
          <p role="alert" className="text-sm text-urgente">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={payload === null || cerrar.isPending}>
            {cerrar.isPending ? 'Cerrando…' : textoBoton}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// Pantalla 6b: cierre de la OT con la regla 4.6 (¿resolvió el ticket?). Pantalla completa bajo 640 px.
export function DialogoCerrarOt({
  ot,
  abierto,
  onCerrar,
}: {
  ot: OtDatos;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-xl">
        {abierto ? <Contenido ot={ot} onCerrar={onCerrar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
