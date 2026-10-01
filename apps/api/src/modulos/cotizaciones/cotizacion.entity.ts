import type { EstadoCotizacion, Moneda, ValidezDias } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'cotizacion' })
export class Cotizacion {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  ot_id!: number;

  @Column({ type: 'integer' })
  version!: number;

  // 'COT-0218' (sin la versión)
  @Column({ type: 'text' })
  codigo!: string;

  @Column({ type: 'text' })
  estado!: EstadoCotizacion;

  @Column({ type: 'integer', nullable: true })
  contacto_id!: number | null;

  // AAAA-MM-DD
  @Column({ type: 'date' })
  fecha_emision!: string;

  @Column({ type: 'integer' })
  validez_dias!: ValidezDias;

  @Column({ type: 'text' })
  moneda!: Moneda;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericoANumero,
  })
  valor_uf!: number | null;

  @Column({ type: 'boolean', default: true })
  aplica_iva!: boolean;

  // Snapshot de la configuración al crear (ADR 0007)
  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericoANumero })
  iva_pct!: number;

  @Column({ type: 'text', nullable: true })
  condiciones!: string | null;

  @Column({ type: 'text', nullable: true })
  nota_interna!: string | null;

  // Materializados por la API con `calcularCotizacion`
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericoANumero })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericoANumero })
  descuentos!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericoANumero })
  neto!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericoANumero })
  iva!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericoANumero })
  total!: number;

  @Column({ type: 'timestamptz', nullable: true })
  enviada_en!: Date | null;

  @Column({ type: 'integer', nullable: true })
  enviada_por!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  aprobada_en!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rechazada_en!: Date | null;

  @Column({ type: 'integer', nullable: true })
  creado_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
