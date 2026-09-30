import type { CategoriaArchivo } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'archivo' })
export class Archivo {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  // NULL = pendiente (subida en dos pasos, ADR 0009)
  @Column({ type: 'text', nullable: true })
  entidad!: 'ticket' | 'ot' | null;

  @Column({ type: 'integer', nullable: true })
  entidad_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  mensaje_id!: number | null;

  @Column({ type: 'text' })
  categoria!: CategoriaArchivo;

  @Column({ type: 'text' })
  nombre_original!: string;

  @Column({ type: 'text' })
  tipo_mime!: string;

  @Column({ type: 'integer' })
  tamano!: number;

  // aaaa/mm/<uuid>.<ext> dentro de ARCHIVOS_DIR
  @Column({ type: 'text' })
  clave!: string;

  // adjunto interno extraído de un correo
  @Column({ type: 'integer', nullable: true })
  origen_correo_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  subido_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  subido_en!: Date;
}
