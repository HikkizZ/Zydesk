import type { EsperaDe, EstadoTicket, OrigenTicket, Prioridad } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericoANumero } from '../../database/transformadores.js';

@Entity({ name: 'ticket' })
export class Ticket {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  numero!: number;

  @Column({ type: 'text' })
  codigo!: string;

  @Column({ type: 'text' })
  asunto!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'integer', nullable: true })
  cliente_id!: number | null;

  @Column({ type: 'text', nullable: true })
  solicitante_nombre!: string | null;

  @Column({ type: 'citext', nullable: true })
  solicitante_correo!: string | null;

  @Column({ type: 'text' })
  origen!: OrigenTicket;

  @Column({ type: 'text' })
  prioridad!: Prioridad;

  @Column({ type: 'integer', nullable: true })
  categoria_id!: number | null;

  @Column({ type: 'text' })
  estado!: EstadoTicket;

  @Column({ type: 'text', nullable: true })
  espera_de!: EsperaDe | null;

  @Column({ type: 'text', nullable: true })
  espera_detalle!: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_cierre!: string | null;

  @Column({ type: 'integer', nullable: true })
  duplicado_de_id!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  inicio_planificado!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_limite!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respuesta_limite!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  primera_respuesta_en!: Date | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericoANumero })
  horas_estimadas!: number | null;

  @Column({ type: 'integer', nullable: true })
  creado_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cerrado_en!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivado_en!: Date | null;
}
