import { Column, Entity, PrimaryColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'tarifa_cliente' })
export class TarifaCliente {
  @PrimaryColumn({ type: 'integer' })
  cliente_id!: number;

  @PrimaryColumn({ type: 'text' })
  concepto!: 'hora_normal' | 'hora_extendida' | 'hora_urgencia' | 'traslado_km';

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericoANumero })
  valor!: number;
}
