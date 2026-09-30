import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'auditoria' })
export class Auditoria {
  // bigint: pg lo entrega como string
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  req_id!: string | null;

  @Column({ type: 'integer', nullable: true })
  usuario_id!: number | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'text' })
  accion!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  detalle!: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;
}
