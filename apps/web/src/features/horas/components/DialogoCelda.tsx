import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
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
import { hoyIso } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatearHoras } from '@/lib/formato';
import type { DiaDatos, FilaDatos, RegistroCeldaDatos } from '../api';
import type { AccionesHoras } from '../useAccionesHoras';
import { fechaLarga, interpretarHoras, nombreFila, registroManual } from '../utiles';

const textoHoras = (n: number) => String(n).replace('.', ',');

function enlaceDeOrigen(r: RegistroCeldaDatos): string | null {
  if (r.mensaje_id === null) return null;
  if (r.ot_id !== null) return `/ots/${r.ot_id}#mensaje-${r.mensaje_id}`;
  if (r.ticket_id !== null) return `/tickets/${r.ticket_id}#mensaje-${r.mensaje_id}`;
  return null;
}

function Registro({
  registro,
  etiqueta,
  acciones,
  alMover,
}: {
  registro: RegistroCeldaDatos;
  etiqueta: string;
  acciones: AccionesHoras;
  alMover: (fecha: string) => void;
}) {
  const [texto, setTexto] = useState(textoHoras(registro.horas));
  const [previo, setPrevio] = useState(registro.horas);
  const [invalido, setInvalido] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  if (previo !== registro.horas) {
    setPrevio(registro.horas);
    setTexto(textoHoras(registro.horas));
  }
  const origen = enlaceDeOrigen(registro);
  const id = `registro-${registro.id}`;

  const guardarHoras = async () => {
    const r = interpretarHoras(texto);
    if (!r.ok || r.valor === null) {
      setTexto(textoHoras(registro.horas));
      setInvalido(true);
      return;
    }
    if (r.valor === registro.horas) return;
    try {
      await acciones.editar(registro, { horas: r.valor });
      setInvalido(false);
    } catch {
      setTexto(textoHoras(registro.horas));
      setInvalido(true);
    }
  };

  const quitar = () => void acciones.quitar(registro).catch(() => {});

  return (
    <li className="space-y-3 rounded-lg border border-borde p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        {origen ? (
          <Link to={origen} className="text-acento underline underline-offset-2">
            Seguimiento
          </Link>
        ) : (
          <span className="font-medium">Manual</span>
        )}
        <span className="font-mono text-tinta-2">{formatearHoras(registro.horas)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-horas`}>Horas ({etiqueta})</Label>
          <Input
            id={`${id}-horas`}
            inputMode="decimal"
            value={texto}
            aria-invalid={invalido || undefined}
            onChange={(e) => {
              setTexto(e.target.value);
              setInvalido(false);
            }}
            onBlur={() => void guardarHoras()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="text-right font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-fecha`}>Fecha ({etiqueta})</Label>
          <Input
            id={`${id}-fecha`}
            type="date"
            max={hoyIso()}
            value={registro.fecha}
            onChange={(e) => {
              const nueva = e.target.value;
              if (!nueva || nueva === registro.fecha) return;
              void acciones
                .editar(registro, { fecha: nueva })
                .then(() => {
                  toast.success('Registro movido de día');
                  alMover(nueva);
                })
                .catch(() => {});
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`${id}-fuera`}
            checked={registro.fuera_de_horario}
            onCheckedChange={(v) =>
              void acciones.editar(registro, { fuera_de_horario: v }).catch(() => {})
            }
          />
          <Label htmlFor={`${id}-fuera`}>Fuera de horario</Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (registro.mensaje_id === null ? quitar() : setConfirmando(true))}
        >
          Quitar
        </Button>
      </div>
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar las horas de este seguimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              El seguimiento se conserva, pero dejará de tener horas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={quitar}>Quitar horas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AgregarHoras({
  fila,
  dia,
  acciones,
}: {
  fila: FilaDatos;
  dia: DiaDatos;
  acciones: AccionesHoras;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [invalido, setInvalido] = useState(false);
  if (!abierto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierto(true)}>
        Agregar horas
      </Button>
    );
  }
  const guardar = async () => {
    const r = interpretarHoras(texto);
    if (!r.ok || r.valor === null) {
      setInvalido(true);
      return;
    }
    try {
      await acciones.crear(fila, dia.fecha, r.valor);
      setAbierto(false);
      setTexto('');
    } catch {
      setInvalido(true);
    }
  };
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="horas-nuevas">Horas nuevas</Label>
        <Input
          id="horas-nuevas"
          inputMode="decimal"
          autoFocus
          value={texto}
          aria-invalid={invalido || undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            setInvalido(false);
          }}
          className="text-right font-mono"
        />
      </div>
      <Button type="button" onClick={() => void guardar()}>
        Guardar
      </Button>
    </div>
  );
}

// Detalle de una celda: los registros que la componen, con corrección de horas, fecha y marca.
export function DialogoCelda({
  fila,
  indice,
  dia,
  acciones,
  onCerrar,
}: {
  fila: FilaDatos | null;
  indice: number;
  dia: DiaDatos | null;
  acciones: AccionesHoras;
  onCerrar: () => void;
}) {
  const celda = fila?.celdas[indice];
  return (
    <Dialog open={fila !== null && dia !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {fila && dia && celda ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {nombreFila(fila)} · {fechaLarga(dia.fecha, indice)}
              </DialogTitle>
              <DialogDescription>
                {celda.registros.length === 0
                  ? 'Sin registros en esta celda.'
                  : `Total del día: ${formatearHoras(celda.total)}.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-3">
              {celda.registros.map((r) => (
                <Registro
                  key={r.id}
                  registro={r}
                  etiqueta={r.mensaje_id === null ? 'manual' : `seguimiento ${r.id}`}
                  acciones={acciones}
                  alMover={onCerrar}
                />
              ))}
            </ul>
            {registroManual(celda) ? null : (
              <AgregarHoras fila={fila} dia={dia} acciones={acciones} />
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
