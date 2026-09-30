import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'usuario' })
export class Usuario {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'citext' })
  correo!: string;

  @Column({ type: 'text' })
  contrasena_hash!: string;

  @Column({ type: 'text' })
  rol!: 'admin' | 'coordinacion' | 'tecnico' | 'lectura';

  @Column({ type: 'integer', nullable: true })
  departamento_id!: number | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'text' })
  color_avatar!: string;

  @Column({ type: 'boolean', default: false })
  debe_cambiar_contrasena!: boolean;

  @Column({ type: 'text', nullable: true })
  terminos_version!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  terminos_aceptados_en!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimo_ingreso!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
