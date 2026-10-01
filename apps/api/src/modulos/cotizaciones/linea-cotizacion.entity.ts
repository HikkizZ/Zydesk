import type { TipoLinea, Unidad } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'linea_cotizacion' })
export class LineaCotizacion {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  cotizacion_id!: number;

  @Column({ type: 'integer' })
  orden!: number;

  @Column({ type: 'text' })
  tipo!: TipoLinea;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericoANumero })
  cantidad!: number;

  @Column({ type: 'text' })
  unidad!: Unidad;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericoANumero })
  precio_unitario!: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numericoANumero })
  descuento_pct!: number;

  // Redondeado por línea (ADR 0007)
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericoANumero })
  total!: number;
}
