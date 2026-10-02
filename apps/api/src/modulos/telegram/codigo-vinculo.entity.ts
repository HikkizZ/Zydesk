import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'codigo_vinculo' })
export class CodigoVinculo {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  codigo_hash!: string;

  @Column({ type: 'integer' })
  usuario_id!: number;

  @Column({ type: 'timestamptz' })
  expira_en!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usado_en!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;
}
