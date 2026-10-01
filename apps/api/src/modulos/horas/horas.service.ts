import { ZONA } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { RegistroHoras } from './registro-horas.entity.js';

// AAAA-MM-DD de hoy en Santiago
const hoyEnSantiago = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

// B5 (mínimo): el redactor registra las horas en la planilla de hoy; la planilla completa es Fase 5.
export async function registrarHorasDesdeMensaje(
  tx: EntityManager,
  d: { usuario_id: number; mensaje_id: number; horas: number } & (
    { ticket_id: number } | { ot_id: number }
  ),
): Promise<void> {
  await tx.insert(RegistroHoras, {
    usuario_id: d.usuario_id,
    fecha: hoyEnSantiago(),
    ticket_id: 'ticket_id' in d ? d.ticket_id : null,
    ot_id: 'ot_id' in d ? d.ot_id : null,
    mensaje_id: d.mensaje_id,
    horas: d.horas,
    fuera_de_horario: false,
    descripcion: null,
  });
}
