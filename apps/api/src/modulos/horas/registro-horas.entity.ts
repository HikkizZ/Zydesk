import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'registro_horas' })
export class RegistroHoras {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  usuario_id!: number;

  // AAAA-MM-DD
  @Column({ type: 'date' })
  fecha!: string;

  // Fase 3 agrega ot_id; Fase 5 permite ambos NULL ("Sin ticket")
  @Column({ type: 'integer', nullable: true })
  ticket_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  mensaje_id!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericoANumero })
  horas!: number;

  @Column({ type: 'boolean', default: false })
  fuera_de_horario!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
