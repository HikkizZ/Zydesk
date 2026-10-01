import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'tarea' })
export class Tarea {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // Exactamente uno de ticket_id y ot_id (CHECK tarea_destino_chk)
  @Column({ type: 'integer', nullable: true })
  ticket_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  ot_id!: number | null;

  // Solo tareas de OT
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericoANumero })
  horas_estimadas!: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericoANumero })
  horas_reales!: number | null;

  @Column({ type: 'text' })
  titulo!: string;

  @Column({ type: 'integer', nullable: true })
  responsable_id!: number | null;

  // AAAA-MM-DD
  @Column({ type: 'date', nullable: true })
  fecha!: string | null;

  @Column({ type: 'boolean', default: false })
  hecha!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  hecha_en!: Date | null;

  @Column({ type: 'integer' })
  orden!: number;

  @Column({ type: 'integer', nullable: true })
  creado_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
