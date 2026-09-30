import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'feriado' })
export class Feriado {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // AAAA-MM-DD
  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'integer', nullable: true })
  departamento_id!: number | null;
}
