import type { TipoMensaje } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'mensaje' })
export class Mensaje {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // Exactamente uno de ticket_id y ot_id (CHECK mensaje_destino_chk)
  @Column({ type: 'integer', nullable: true })
  ticket_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  ot_id!: number | null;

  // Mensaje de OT del que se copió este mensaje del ticket (índice único: una copia por origen)
  @Column({ type: 'integer', nullable: true })
  copiado_desde_id!: number | null;

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
