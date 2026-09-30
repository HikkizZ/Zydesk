import type { TipoMensaje } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'mensaje' })
export class Mensaje {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // Fase 3: NULL + ot_id + copiado_desde_id
  @Column({ type: 'integer' })
  ticket_id!: number;

  @Column({ type: 'text' })
  tipo!: TipoMensaje;

  @Column({ type: 'integer', nullable: true })
  autor_id!: number | null;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericoANumero })
  horas!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;
}
