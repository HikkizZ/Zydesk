export interface HorarioDia {
  /** 0 = domingo … 6 = sábado (getDay) */
  dia_semana: number;
  activo: boolean;
  /** HH:mm */
  entrada: string;
  salida: string;
  colacion_inicio: string;
  colacion_min: number;
}

export interface Calendario {
  /** 7 entradas, una por día de la semana */
  horario: HorarioDia[];
  /** AAAA-MM-DD, aplican a todo el día */
  feriados: string[];
  hora_extendida_desde?: string;
}

export interface Plazo {
  valor: number;
  unidad: 'horas' | 'dias';
}
