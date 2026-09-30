import type { FormaAprobacion } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'aprobacion_cliente' })
export class AprobacionCliente {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  ot_id!: number;

  @Column({ type: 'integer' })
  contacto_id!: number;

  // AAAA-MM-DD
  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'text' })
  forma!: FormaAprobacion;

  @Column({ type: 'integer' })
  archivo_id!: number;

  @Column({ type: 'integer', nullable: true })
  registrada_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  registrada_en!: Date;
}
