import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'evento' })
export class Evento {
  // bigint: pg lo entrega como string
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'text' })
  entidad!: string;

  @Column({ type: 'text' })
  entidad_id!: string;

  @Column({ type: 'integer', nullable: true })
  autor_id!: number | null;

  @Column({ type: 'text' })
  accion!: string;

  @Column({ type: 'text', nullable: true })
  campo!: string | null;

  @Column({ type: 'text', nullable: true })
  valor_anterior!: string | null;

  @Column({ type: 'text', nullable: true })
  valor_nuevo!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  datos!: unknown;

  @Column({ type: 'uuid', nullable: true })
  req_id!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;
}
