import type { EventoAviso, TipoAviso } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'aviso' })
export class Aviso {
  // bigint: pg lo entrega como string
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'integer' })
  usuario_id!: number;

  @Column({ type: 'text' })
  evento!: Exclude<EventoAviso, 'resumen_diario'>;

  @Column({ type: 'text' })
  tipo!: TipoAviso;

  // idempotencia: 'vence_pronto:ticket:12:2026-10-02T23:00:00.000Z'
  @Column({ type: 'text', nullable: true })
  clave!: string | null;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'text' })
  enlace!: string;

  @Column({ type: 'text' })
  entidad!: 'ticket' | 'ot';

  @Column({ type: 'integer' })
  entidad_id!: number;

  // solo ids y códigos: { codigo, ot_id?, mensaje_id?, tarea_id?, cotizacion_id? }
  @Column({ type: 'jsonb', default: () => `'{}'` })
  datos!: Record<string, unknown>;

  @Column({ type: 'integer', nullable: true })
  actor_id!: number | null;

  @Column({ type: 'boolean', default: true })
  en_app!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  leido_en!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;
}
