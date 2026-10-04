import type { Rol } from '@zydesk/shared';
import administracion from '../../../../../docs/manuales/administracion.md?raw';
import primerosPasos from '../../../../../docs/manuales/usuario/00-primeros-pasos.md?raw';
import tecnico from '../../../../../docs/manuales/usuario/01-tecnico.md?raw';
import coordinacion from '../../../../../docs/manuales/usuario/02-coordinacion.md?raw';
import botTelegram from '../../../../../docs/manuales/usuario/04-bot-telegram.md?raw';

export type ClaveManual =
  'primeros-pasos' | 'tecnico' | 'coordinacion' | 'bot-telegram' | 'administracion';

export interface Manual {
  clave: ClaveManual;
  titulo: string;
  archivo: string;
  texto: string;
  roles: readonly Rol[];
}

// Título = texto del primer `# ` del archivo (no se duplica a mano).
function tituloDe(texto: string): string {
  return /^# (.+)$/m.exec(texto)![1]!.trim();
}

function manual(clave: ClaveManual, archivo: string, texto: string, roles: readonly Rol[]): Manual {
  return { clave, titulo: tituloDe(texto), archivo, texto, roles };
}

// Orden fijo: es el de las pestañas.
export const MANUALES: readonly Manual[] = [
  manual('primeros-pasos', '00-primeros-pasos.md', primerosPasos, [
    'lectura',
    'tecnico',
    'coordinacion',
    'admin',
  ]),
  manual('tecnico', '01-tecnico.md', tecnico, ['tecnico', 'coordinacion', 'admin']),
  manual('coordinacion', '02-coordinacion.md', coordinacion, ['coordinacion', 'admin']),
  manual('bot-telegram', '04-bot-telegram.md', botTelegram, [
    'lectura',
    'tecnico',
    'coordinacion',
    'admin',
  ]),
  manual('administracion', 'administracion.md', administracion, ['admin']),
];

export const manualesDe = (rol: Rol): Manual[] => MANUALES.filter((m) => m.roles.includes(rol));

export const manualPorClave = (clave: string | undefined): Manual | undefined =>
  MANUALES.find((m) => m.clave === clave);
