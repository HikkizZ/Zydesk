import type { EstadoFacturacion, EtapaOt, TipoOt } from '@zydesk/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ot' })
export class Ot {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  numero!: number;

  @Column({ type: 'text' })
  codigo!: string;

  @Column({ type: 'integer' })
  ticket_id!: number;

  @Column({ type: 'text' })
  tipo!: TipoOt;

  @Column({ type: 'text' })
  etapa!: EtapaOt;

  @Column({ type: 'text' })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  alcance!: string | null;

  @Column({ type: 'integer', nullable: true })
  responsable_tecnico_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  cliente_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  contacto_id!: number | null;

  // AAAA-MM-DD
  @Column({ type: 'date', nullable: true })
  inicio!: string | null;

  // AAAA-MM-DD
  @Column({ type: 'date', nullable: true })
  termino!: string | null;

  @Column({ type: 'text', nullable: true })
  oc_cliente!: string | null;

  @Column({ type: 'text', nullable: true })
  condicion_pago!: string | null;

  @Column({ type: 'integer', nullable: true })
  contrato_id!: number | null;

  @Column({ type: 'text', nullable: true })
  centro_costo!: string | null;

  @Column({ type: 'text', nullable: true })
  area_solicitante!: string | null;

  @Column({ type: 'integer', nullable: true })
  aprobador_id!: number | null;

  @Column({ type: 'integer', nullable: true })
  aprobada_por!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  aprobada_en!: Date | null;

  @Column({ type: 'text' })
  estado_facturacion!: EstadoFacturacion;

  @Column({ type: 'text', nullable: true })
  n_factura!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  facturada_en!: Date | null;

  @Column({ type: 'integer', nullable: true })
  facturada_por!: number | null;

  @Column({ type: 'boolean', nullable: true })
  resolvio_ticket!: boolean | null;

  @Column({ type: 'text', nullable: true })
  resumen_cierre!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cerrada_en!: Date | null;

  @Column({ type: 'integer', nullable: true })
  cerrada_por!: number | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelacion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelada_en!: Date | null;

  @Column({ type: 'integer', nullable: true })
  creado_por!: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creado_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
