import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { TituloPagina } from '@/app/TituloPagina';
import { Cargando } from '@/components/dominio/Cargando';
import { EstadoError } from '@/components/dominio/EstadoError';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import { Button } from '@/components/ui/button';
import { usePermiso, useYo } from '@/features/auth/SesionProvider';
import { clavesHoras, planilla as obtenerPlanilla, type PlanillaDatos } from '../api';
import { DialogoAgregarFila } from '../components/DialogoAgregarFila';
import { DialogoCelda } from '../components/DialogoCelda';
import { Planilla } from '../components/Planilla';
import { ResumenSemana } from '../components/ResumenSemana';
import { SelectorPersona } from '../components/SelectorPersona';
import { SelectorSemana } from '../components/SelectorSemana';
import { useAccionesHoras } from '../useAccionesHoras';
import { filaVacia, type NuevaFilaDatos } from '../utiles';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Enfoca el primer campo editable de la fila (el de hoy si lo hay).
function enfocarFila(clave: string) {
  const fila = Array.from(document.querySelectorAll<HTMLElement>('[data-fila]')).find(
    (e) => e.dataset['fila'] === clave,
  );
  const campo =
    fila?.querySelector<HTMLInputElement>('[data-hoy] input:not(:disabled)') ??
    fila?.querySelector<HTMLInputElement>('input:not(:disabled)');
  campo?.focus();
}

function Vista({ planilla, propia }: { planilla: PlanillaDatos; propia: boolean }) {
  const [, setParams] = useSearchParams();
  const puedeEditar = usePermiso('tickets.editar');
  const acciones = useAccionesHoras();
  const [agregadas, setAgregadas] = useState<NuevaFilaDatos[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [detalle, setDetalle] = useState<{ clave: string; indice: number } | null>(null);
  const porEnfocar = useRef<string | null>(null);

  useEffect(() => {
    if (porEnfocar.current === null) return;
    enfocarFila(porEnfocar.current);
    porEnfocar.current = null;
  });

  const editable = planilla.editable;
  const delServidor = new Set(planilla.filas.map((f) => f.clave));
  const filas = [
    ...planilla.filas,
    ...agregadas.map((a) => filaVacia(a, planilla.dias)).filter((f) => !delServidor.has(f.clave)),
  ];

  const agregar = (nueva: NuevaFilaDatos) => {
    const fila = filaVacia(nueva, planilla.dias);
    if (filas.some((f) => f.clave === fila.clave)) {
      toast.info('Esa fila ya está en la planilla');
    } else {
      setAgregadas((previas) => [...previas, nueva]);
    }
    porEnfocar.current = fila.clave;
  };

  const filaDetalle = detalle ? (filas.find((f) => f.clave === detalle.clave) ?? null) : null;
  const diaDetalle = detalle ? (planilla.dias[detalle.indice] ?? null) : null;

  const irA = (semana: string | null) =>
    setParams((previos) => {
      const nuevos = new URLSearchParams(previos);
      if (semana === null) nuevos.delete('semana');
      else nuevos.set('semana', semana);
      return nuevos;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorSemana semana={planilla.semana} onCambiar={irA} onHoy={() => irA(null)} />
        {editable ? (
          <Button type="button" onClick={() => setAgregando(true)}>
            <Plus aria-hidden="true" />
            Agregar fila
          </Button>
        ) : null}
      </div>

      {!propia ? (
        <p role="status" className="rounded-md bg-superficie-suave-2 px-3 py-2 text-sm">
          Estás viendo la planilla de {planilla.usuario.nombre} · solo lectura
        </p>
      ) : !puedeEditar ? (
        <p role="status" className="rounded-md bg-superficie-suave-2 px-3 py-2 text-sm">
          Tu rol no registra horas
        </p>
      ) : null}
      {planilla.usuario.departamento === null ? (
        <p role="status" className="rounded-md bg-alta-fondo px-3 py-2 text-sm text-alta">
          Sin departamento: no hay jornada para comparar
        </p>
      ) : null}

      {filas.length === 0 ? (
        <EstadoVacio
          titulo="Sin horas esta semana"
          {...(editable
            ? {
                accion: (
                  <Button type="button" onClick={() => setAgregando(true)}>
                    Agregar fila
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-4 lg:space-y-0">
          <Planilla
            planilla={planilla}
            filas={filas}
            editable={editable}
            acciones={acciones}
            onDetalle={(clave, indice) => setDetalle({ clave, indice })}
          />
          <ResumenSemana totales={planilla.totales} />
        </div>
      )}

      {editable ? (
        <>
          <DialogoAgregarFila
            abierto={agregando}
            onAbiertoChange={setAgregando}
            onAgregar={agregar}
          />
          <DialogoCelda
            fila={filaDetalle}
            indice={detalle?.indice ?? 0}
            dia={diaDetalle}
            acciones={acciones}
            onCerrar={() => setDetalle(null)}
          />
        </>
      ) : null}
    </div>
  );
}

export function HorasPage() {
  const yo = useYo();
  const verTodas = usePermiso('horas.ver_todas');
  const [params, setParams] = useSearchParams();

  const semanaParam = params.get('semana');
  const semana = semanaParam && FECHA.test(semanaParam) ? semanaParam : undefined;
  const usuarioParam = Number(params.get('usuario'));
  // Sin `horas.ver_todas` la planilla es siempre la propia (la API respondería 403 con otra).
  const usuarioId =
    verTodas && Number.isInteger(usuarioParam) && usuarioParam > 0 && usuarioParam !== yo.id
      ? usuarioParam
      : undefined;
  const consulta = {
    ...(usuarioId === undefined ? {} : { usuario_id: usuarioId }),
    ...(semana === undefined ? {} : { semana }),
  };

  const resultado = useQuery({
    queryKey: clavesHoras.planilla(consulta),
    queryFn: () => obtenerPlanilla(consulta),
  });
  const datos = resultado.data;

  const elegirPersona = (id: number) =>
    setParams((previos) => {
      const nuevos = new URLSearchParams(previos);
      if (id === yo.id) nuevos.delete('usuario');
      else nuevos.set('usuario', String(id));
      return nuevos;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloPagina
          titulo={datos ? `Horas · semana del ${diaMesDeFecha(datos.semana.desde)}` : 'Horas'}
        />
        {verTodas ? (
          <SelectorPersona
            valor={usuarioId ?? yo.id}
            yoId={yo.id}
            actual={datos ? { id: datos.usuario.id, nombre: datos.usuario.nombre } : undefined}
            onCambiar={elegirPersona}
          />
        ) : null}
      </div>
      {resultado.isError ? (
        <EstadoError error={resultado.error} reintentar={() => void resultado.refetch()} />
      ) : datos ? (
        <Vista
          key={`${datos.usuario.id}:${datos.semana.desde}`}
          planilla={datos}
          propia={datos.usuario.id === yo.id}
        />
      ) : (
        <Cargando />
      )}
    </div>
  );
}
