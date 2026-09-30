import {
  horasHabilesEntre,
  sumarPlazo,
  ZONA,
  type CalcularPlazoEntradaDatos,
  type CalcularPlazoSalidaDatos,
} from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';

const anioEnSantiago = (d: Date): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric' }).format(d));

export async function calcularPlazo(
  e: CalcularPlazoEntradaDatos,
): Promise<CalcularPlazoSalidaDatos> {
  const desde = new Date(e.desde);
  const anio = anioEnSantiago(desde);
  const calendario = await cargarCalendario(dataSource.manager, e.departamento_id, [
    anio,
    anio + 1,
  ]);
  const hasta = sumarPlazo(desde, e.plazo, calendario);
  return {
    hasta: hasta.toISOString(),
    horas_habiles: horasHabilesEntre(desde, hasta, calendario),
  };
}
