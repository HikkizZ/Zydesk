import type { MiDiaSalida, TareaMiDia } from '@zydesk/shared';
import type { z } from 'zod';
import { obtener } from '@/lib/api';

export type MiDiaDatos = z.infer<typeof MiDiaSalida>;
export type TareaMiDiaDatos = z.infer<typeof TareaMiDia>;

// `staleTime` 30 s y sondeo de 60 s (spec fase 6 §16).
export const STALE_MI_DIA = 30_000;
export const REFRESCO_MI_DIA_MS = 60_000;

export const clavesMiDia = { miDia: ['mi-dia'] as const };

export const miDia = () => obtener<MiDiaDatos>('/api/mi-dia');
