import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'cliente' })
export class Cliente {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  rut!: string | null;

  @Column({ type: 'text', nullable: true })
  direccion!: string | null;

  @Column({ type: 'boolean', default: false })
  es_interno!: boolean;

  @Column({ type: 'text', nullable: true })
  condicion_pago!: string | null;

  @Column({ type: 'boolean', default: false })
  exige_oc!: boolean;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
