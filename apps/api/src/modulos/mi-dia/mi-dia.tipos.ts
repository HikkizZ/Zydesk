import type { MiDiaSalida } from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de los esquemas: se infieren aquí.
export type MiDiaSalidaDatos = z.infer<typeof MiDiaSalida>;
export type AvisoMiDiaDatos = MiDiaSalidaDatos['menciones'][number];
export type TareaMiDiaDatos = MiDiaSalidaDatos['tareas'][number];
