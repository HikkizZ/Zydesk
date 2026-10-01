// motor de horas hábiles (ADR 0005)
export type { Calendario, HorarioDia, Plazo } from './tipos.js';
export { bloquesDelDia, jornadaSemanalHoras } from './calendario.js';
export { diasDeSemana, horasJornada, lunesDe } from './jornada.js';
export {
  esHoraExtendida,
  horasHabilesEntre,
  siguienteInicioHabil,
  sumarDiasHabiles,
  sumarHorasHabiles,
  sumarPlazo,
} from './motor.js';
