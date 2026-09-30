import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

interface PlazoDb {
  valor: number;
  unidad: 'horas' | 'dias';
}

@Entity({ name: 'categoria' })
export class Categoria {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  nombre!: string;

  @Column({ type: 'integer', nullable: true })
  responsable_defecto_id!: number | null;

  // { valor, unidad }
  @Column({ type: 'jsonb' })
  plazo_respuesta!: PlazoDb;

  // { urgente, alta, media, baja }
  @Column({ type: 'jsonb' })
  plazo_resolucion!: Record<'urgente' | 'alta' | 'media' | 'baja', PlazoDb>;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
