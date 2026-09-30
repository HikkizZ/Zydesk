import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'contacto' })
export class Contacto {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  cliente_id!: number;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  area!: string | null;

  @Column({ type: 'citext', nullable: true })
  correo!: string | null;

  @Column({ type: 'text', nullable: true })
  telefono!: string | null;

  @Column({ type: 'boolean', default: false })
  aprueba_cotizaciones!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
