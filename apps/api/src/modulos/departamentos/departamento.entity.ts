import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'departamento' })
export class Departamento {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'text' })
  hora_extendida_desde!: string;

  @Column({ type: 'integer' })
  capacidad_tickets_pct!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
