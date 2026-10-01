import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mensajeDeError } from '@/components/dominio/EstadoError';
import {
  crearRegistro,
  editarRegistro,
  eliminarRegistro,
  invalidarHoras,
  type CeldaDatos,
  type FilaDatos,
  type RegistroCeldaDatos,
  type RegistroHorasEditarDatos,
} from './api';
import { registroManual } from './utiles';

// Mutaciones de la planilla (spec fase 5 §8.2): cada celda se persiste al salir del campo. Si la
// API rechaza, se avisa con el mensaje de la API y se relanza el error para que la celda vuelva al
// valor anterior.
export function useAccionesHoras() {
  const queryClient = useQueryClient();

  const ejecutar = async (accion: () => Promise<unknown>, otId?: number | null) => {
    try {
      await accion();
    } catch (error) {
      toast.error(mensajeDeError(error));
      throw error;
    }
    await invalidarHoras(queryClient, otId ?? undefined);
  };

  const crear = (fila: FilaDatos, fecha: string, horas: number, fuera = false) =>
    ejecutar(
      () =>
        crearRegistro({
          fecha,
          horas,
          fuera_de_horario: fuera,
          ticket_id: fila.destino.tipo === 'ticket' ? fila.destino.id : null,
          ot_id: fila.destino.tipo === 'ot' ? fila.destino.id : null,
          tarea_id: fila.tarea?.id ?? null,
          descripcion: fila.destino.tipo === 'sin_ticket' ? fila.destino.descripcion : null,
        }),
      fila.destino.tipo === 'ot' ? fila.destino.id : null,
    );

  const editar = (registro: RegistroCeldaDatos, cambios: RegistroHorasEditarDatos) =>
    ejecutar(() => editarRegistro(registro.id, cambios), registro.ot_id);

  const quitar = (registro: RegistroCeldaDatos) =>
    ejecutar(() => eliminarRegistro(registro.id), registro.ot_id);

  return {
    crear,
    editar,
    quitar,
    // Celda vacía → POST; con fila manual → PATCH; vaciada → DELETE.
    guardarCelda: (fila: FilaDatos, celda: CeldaDatos, horas: number | null) => {
      const manual = registroManual(celda);
      if (horas === null) return manual ? quitar(manual) : Promise.resolve();
      return manual ? editar(manual, { horas }) : crear(fila, celda.fecha, horas);
    },
    alternarFuera: (celda: CeldaDatos, fuera: boolean) => {
      const manual = registroManual(celda);
      return manual ? editar(manual, { fuera_de_horario: fuera }) : Promise.resolve();
    },
  };
}

export type AccionesHoras = ReturnType<typeof useAccionesHoras>;
