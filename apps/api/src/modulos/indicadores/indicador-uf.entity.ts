import { Column, Entity, PrimaryColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

// Una fila por fecha (ADR 0007, Fase 8b); solo la escriben el job `indicadores.uf` y las semillas.
@Entity({ name: 'indicador_uf' })
export class IndicadorUf {
  // AAAA-MM-DD
  @PrimaryColumn({ type: 'date' })
  fecha!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericoANumero })
  valor!: number;

  @Column({ type: 'text' })
  fuente!: 'boostr' | 'mindicador' | 'semilla';

  @Column({ type: 'timestamptz', default: () => 'now()' })
  obtenido_en!: Date;
}
