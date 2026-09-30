import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tarea' })
export class Tarea {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // Fase 3: ticket_id pasa a NULL y se agrega ot_id
  @Column({ type: 'integer' })
  ticket_id!: number;

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
