import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'contrato_bolsa' })
export class ContratoBolsa {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  cliente_id!: number;

  @Column({ type: 'numeric', precision: 6, scale: 1, transformer: numericoANumero })
  horas_mes!: number;

  // AAAA-MM-DD
  @Column({ type: 'date' })
  vigente_desde!: string;

  @Column({ type: 'date', nullable: true })
  vigente_hasta!: string | null;

  @Column({ type: 'date', nullable: true })
  fecha_renovacion!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
