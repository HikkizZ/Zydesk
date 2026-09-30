import type { ValueTransformer } from 'typeorm';

// `numeric` llega como string desde pg; los importes y horas se manejan como number (ADR 0007).
export const numericoANumero: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};
