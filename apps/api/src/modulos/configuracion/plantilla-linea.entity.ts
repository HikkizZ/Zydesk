import type { TipoLinea, Unidad } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'plantilla_linea' })
export class PlantillaLinea {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  plantilla_id!: number;

  @Column({ type: 'integer' })
  orden!: number;

  @Column({ type: 'text' })
  tipo!: TipoLinea;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1, transformer: numericoANumero })
  cantidad!: number;

  @Column({ type: 'text' })
  unidad!: Unidad;

  // null = se toma de la tarifa al aplicar la plantilla
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericoANumero,
  })
  precio_unitario!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numericoANumero })
  descuento_pct!: number;
}
