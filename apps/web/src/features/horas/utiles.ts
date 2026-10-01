import { diaMesDeFecha } from '@/components/dominio/formato-fecha';
import type {
  CeldaDatos,
  DestinoDatos,
  DiaDatos,
  FilaDatos,
  PlanillaDatos,
  RegistroCeldaDatos,
} from './api';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// Las columnas van de lunes a domingo por su índice (`dia_semana` de la API usa 0 = domingo).
export const nombreDia = (i: number) => DIAS[i] ?? '';
export const inicialDia = (i: number) => INICIALES[i] ?? '';
export const nombreDiaLargo = (i: number) => DIAS_LARGO[i] ?? '';

const numeroDia = (fecha: string) => Number(fecha.slice(8, 10));

/** "Lun 28" */
export const etiquetaDia = (dia: DiaDatos, i: number) => `${nombreDia(i)} ${numeroDia(dia.fecha)}`;

/** "lunes 28 sep" */
export const fechaLarga = (fecha: string, i: number) =>
  `${nombreDiaLargo(i)} ${diaMesDeFecha(fecha)}`;

/** "Semana del 28 sep al 4 oct 2026" */
export function textoSemana(semana: PlanillaDatos['semana']): string {
  return `Semana del ${diaMesDeFecha(semana.desde)} al ${diaMesDeFecha(semana.hasta)} ${semana.hasta.slice(0, 4)}`;
}

export type ResultadoHoras = { ok: true; valor: number | null } | { ok: false };

// Coma o punto decimal; múltiplos de 0,25 entre 0,25 y 24; vacío = borrar (valor null).
export function interpretarHoras(texto: string): ResultadoHoras {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return { ok: true, valor: null };
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { ok: false };
  const n = Number(limpio);
  if (n < 0.25 || n > 24 || !Number.isInteger(n * 4)) return { ok: false };
  return { ok: true, valor: n };
}

export type TonoDia = 'urgente' | 'alta' | 'neutro';

// B3: solo visual. Más que la jornada → urgente; menos en un día pasado o de hoy → alta.
export function tonoDia(dia: DiaDatos): TonoDia {
  if (dia.jornada === null) return 'neutro';
  if (dia.total > dia.jornada) return 'urgente';
  if (!dia.futuro && dia.total < dia.jornada) return 'alta';
  return 'neutro';
}

export const registroManual = (celda: CeldaDatos): RegistroCeldaDatos | undefined =>
  celda.registros.find((r) => r.mensaje_id === null);

export const registrosDeSeguimiento = (celda: CeldaDatos): RegistroCeldaDatos[] =>
  celda.registros.filter((r) => r.mensaje_id !== null);

export function claveDeFila(destino: DestinoDatos, tareaId: number | null): string {
  if (destino.tipo === 'ticket') return `ticket:${destino.id}`;
  if (destino.tipo === 'ot')
    return tareaId === null ? `ot:${destino.id}` : `ot:${destino.id}:tarea:${tareaId}`;
  return `sin_ticket:${destino.descripcion}`;
}

export const esOtFinal = (destino: DestinoDatos) => destino.tipo === 'ot' && destino.final;

/** Nombre corto de la fila para etiquetas accesibles: "OT-0218 · Diagnóstico". */
export function nombreFila(fila: Pick<FilaDatos, 'destino' | 'tarea'>): string {
  const base = fila.destino.tipo === 'sin_ticket' ? fila.destino.descripcion : fila.destino.codigo;
  return fila.tarea ? `${base} · ${fila.tarea.titulo}` : base;
}

export interface NuevaFilaDatos {
  destino: DestinoDatos;
  tarea: FilaDatos['tarea'];
}

/** Fila sin horas que la persona agregó en el navegador (no se persiste hasta escribir en una celda). */
export function filaVacia(nueva: NuevaFilaDatos, dias: DiaDatos[]): FilaDatos {
  return {
    clave: claveDeFila(nueva.destino, nueva.tarea?.id ?? null),
    destino: nueva.destino,
    tarea: nueva.tarea,
    facturable: nueva.destino.tipo === 'ot' && nueva.destino.tipo_ot === 'facturable',
    celdas: dias.map((d) => ({ fecha: d.fecha, total: 0, fuera_de_horario: false, registros: [] })),
    total: 0,
  };
}
